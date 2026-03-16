"""
Lambda handler for transcript verification.

Receives a Step Functions event with transcriptId and extractedDataKey,
runs deterministic rules and AI-assisted analysis, then stores results.
"""

import json
import logging
import sys
import uuid
from datetime import datetime, timezone

# Shared layer modules
sys.path.insert(0, "/opt")
from models import VerificationResult, AuditEntry
import db
import s3_utils
from bedrock_client import invoke_nova_json, NOVA_PRO

from rules import run_all_rules
from prompts import build_verification_prompt

logger = logging.getLogger()
logger.setLevel(logging.INFO)

VERIFICATION_TABLE = "msbon-verifications"
TRANSCRIPT_TABLE = "msbon-transcripts"
AUDIT_TABLE = "msbon-audit"


def handler(event: dict, context) -> dict:
    """
    Lambda entry point for transcript verification.

    Expected event shape (from Step Functions):
    {
        "transcriptId": "uuid-string",
        "extractedDataKey": "s3-key-to-extracted-json",
        "bucket": "optional-bucket-override",
        "applicantId": "optional-applicant-id"
    }

    Returns dict with verification results for the next Step Functions state.
    """
    logger.info("Verification handler invoked: %s", json.dumps(event))

    transcript_id = event["transcriptId"]
    extracted_data_key = event["extractedDataKey"]
    bucket = event.get("bucket", "msbon-transcripts")
    applicant_id = event.get("applicantId")

    verification_id = str(uuid.uuid4())
    timestamp = datetime.now(timezone.utc).isoformat()

    # ------------------------------------------------------------------
    # 1. Load extracted transcript data from S3
    # ------------------------------------------------------------------
    logger.info("Loading extracted data from s3://%s/%s", bucket, extracted_data_key)
    try:
        extracted_data = s3_utils.get_json(bucket, extracted_data_key)
    except Exception as e:
        logger.error("Failed to load extracted data: %s", str(e))
        _update_transcript_status(transcript_id, "VERIFICATION_FAILED", timestamp)
        _log_audit(
            transcript_id,
            verification_id,
            "VERIFICATION_ERROR",
            f"Failed to load extracted data: {e}",
            timestamp,
        )
        raise

    # ------------------------------------------------------------------
    # 2. Run deterministic verification rules
    # ------------------------------------------------------------------
    logger.info("Running deterministic verification rules")
    rule_results = run_all_rules(extracted_data)

    pass_count = sum(1 for r in rule_results if r["status"] == "PASS")
    flag_count = sum(1 for r in rule_results if r["status"] == "FLAG")
    unable_count = sum(1 for r in rule_results if r["status"] == "UNABLE_TO_DETERMINE")

    logger.info(
        "Rule results: %d PASS, %d FLAG, %d UNABLE_TO_DETERMINE",
        pass_count,
        flag_count,
        unable_count,
    )

    # ------------------------------------------------------------------
    # 3. AI-assisted holistic analysis via Bedrock Nova Pro
    # ------------------------------------------------------------------
    logger.info("Invoking Nova Pro for holistic analysis")
    system_prompt, user_prompt = build_verification_prompt(extracted_data, rule_results)

    try:
        ai_analysis = invoke_nova_json(
            model_id=NOVA_PRO,
            system_prompt=system_prompt,
            user_prompt=user_prompt,
        )
    except Exception as e:
        logger.error("Bedrock Nova Pro invocation failed: %s", str(e))
        ai_analysis = {
            "summary": f"AI analysis unavailable due to error: {str(e)}",
            "additionalFlags": [],
            "recommendation": "REVIEW",
            "reasoning": "AI analysis could not be completed. Manual review recommended.",
            "confidenceScore": 0.0,
            "riskLevel": "MEDIUM",
        }

    # ------------------------------------------------------------------
    # 4. Combine into VerificationResult
    # ------------------------------------------------------------------
    recommendation = ai_analysis.get("recommendation", "REVIEW")

    # Override to REVIEW if there are critical flags but AI says APPROVE
    if recommendation == "APPROVE" and flag_count > 3:
        recommendation = "REVIEW"
        ai_analysis["reasoning"] = (
            ai_analysis.get("reasoning", "")
            + " [Override: Multiple rule flags detected, escalating to manual review.]"
        )

    verification_result = VerificationResult(
        verification_id=verification_id,
        transcript_id=transcript_id,
        applicant_id=applicant_id,
        timestamp=timestamp,
        rule_results=rule_results,
        ai_analysis=ai_analysis,
        recommendation=recommendation,
        risk_level=ai_analysis.get("riskLevel", "MEDIUM"),
        confidence_score=ai_analysis.get("confidenceScore", 0.0),
        pass_count=pass_count,
        flag_count=flag_count,
        unable_count=unable_count,
    )

    # ------------------------------------------------------------------
    # 5. Save to DynamoDB verifications table
    # ------------------------------------------------------------------
    logger.info("Saving verification result %s", verification_id)
    try:
        db.put_item(VERIFICATION_TABLE, verification_result.to_dict())
    except Exception as e:
        logger.error("Failed to save verification result: %s", str(e))
        raise

    # ------------------------------------------------------------------
    # 6. Update transcript status
    # ------------------------------------------------------------------
    new_status = _map_recommendation_to_status(recommendation)
    _update_transcript_status(transcript_id, new_status, timestamp)

    # ------------------------------------------------------------------
    # 7. Log audit entry
    # ------------------------------------------------------------------
    _log_audit(
        transcript_id,
        verification_id,
        "VERIFICATION_COMPLETE",
        (
            f"Verification completed. Recommendation: {recommendation}. "
            f"Rules: {pass_count} PASS, {flag_count} FLAG, {unable_count} UNABLE. "
            f"Risk level: {ai_analysis.get('riskLevel', 'UNKNOWN')}."
        ),
        timestamp,
    )

    # ------------------------------------------------------------------
    # 8. Return data for the next step
    # ------------------------------------------------------------------
    return {
        "transcriptId": transcript_id,
        "verificationId": verification_id,
        "recommendation": recommendation,
        "riskLevel": ai_analysis.get("riskLevel", "MEDIUM"),
        "confidenceScore": ai_analysis.get("confidenceScore", 0.0),
        "passCount": pass_count,
        "flagCount": flag_count,
        "unableCount": unable_count,
        "status": new_status,
        "timestamp": timestamp,
    }


# ---------------------------------------------------------------------------
# Helper functions
# ---------------------------------------------------------------------------


def _map_recommendation_to_status(recommendation: str) -> str:
    """Map AI recommendation to transcript status."""
    mapping = {
        "APPROVE": "VERIFIED",
        "REVIEW": "PENDING_REVIEW",
        "REJECT": "REJECTED",
    }
    return mapping.get(recommendation, "PENDING_REVIEW")


def _update_transcript_status(
    transcript_id: str, status: str, timestamp: str
) -> None:
    """Update the transcript record with the new status."""
    try:
        db.update_item(
            TRANSCRIPT_TABLE,
            key={"transcriptId": transcript_id},
            update_expression="SET #s = :status, updatedAt = :ts",
            expression_names={"#s": "status"},
            expression_values={":status": status, ":ts": timestamp},
        )
        logger.info(
            "Updated transcript %s status to %s", transcript_id, status
        )
    except Exception as e:
        logger.error(
            "Failed to update transcript status for %s: %s",
            transcript_id,
            str(e),
        )


def _log_audit(
    transcript_id: str,
    verification_id: str,
    action: str,
    details: str,
    timestamp: str,
) -> None:
    """Write an audit log entry."""
    try:
        entry = AuditEntry(
            entry_id=str(uuid.uuid4()),
            transcript_id=transcript_id,
            verification_id=verification_id,
            action=action,
            details=details,
            timestamp=timestamp,
            actor="system:verify-lambda",
        )
        db.put_item(AUDIT_TABLE, entry.to_dict())
    except Exception as e:
        logger.error("Failed to write audit entry: %s", str(e))
