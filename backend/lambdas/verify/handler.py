"""
Lambda handler for transcript verification.

Handles two invocation types:
  - Step Functions: runs the verification pipeline
  - API Gateway GET /verifications/{transcriptId}: returns stored results
"""

import json
import logging
import sys
from datetime import datetime, timezone

sys.path.insert(0, "/opt")
from models import VerificationResult, AuditEntry
import db
import s3_utils
from bedrock_client import invoke_nova_json, NOVA_PRO

from rules import run_all_rules
from prompts import build_verification_prompt

logger = logging.getLogger()
logger.setLevel(logging.INFO)

CORS_HEADERS = {
    "Content-Type": "application/json",
    "Access-Control-Allow-Origin": "*",
    "Access-Control-Allow-Headers": "Content-Type,Authorization",
    "Access-Control-Allow-Methods": "GET,POST,OPTIONS",
}


def _api_response(status_code: int, body) -> dict:
    return {
        "statusCode": status_code,
        "headers": CORS_HEADERS,
        "body": json.dumps(body, default=str),
    }


def _map_recommendation(recommendation: str) -> tuple[str, str]:
    """Map AI recommendation to (overall_status, transcript_status)."""
    mapping = {
        "APPROVE": ("CLEAR", "VERIFIED"),
        "REVIEW":  ("REVIEW_REQUIRED", "REVIEW_REQUIRED"),
        "REJECT":  ("FLAGS_FOUND", "REVIEW_REQUIRED"),
    }
    return mapping.get(recommendation, ("REVIEW_REQUIRED", "REVIEW_REQUIRED"))


def _handle_api_get(transcript_id: str) -> dict:
    """Handle API Gateway GET /verifications/{transcriptId}."""
    verifications = db.get_verifications_for_transcript(transcript_id)
    return _api_response(200, verifications)


def _normalize_for_rules(extracted: dict) -> dict:
    """Bridge field name differences between extraction schema and rules engine.

    The extraction Lambda uses its own schema (institutions[], gpa_info.cumulative,
    enrollment_terms[]). The rules engine expects flat field names. This function
    adds the expected keys without removing any original data.
    """
    normalized = dict(extracted)

    # institutions (list) → school_name (string)
    institutions = extracted.get("institutions")
    if institutions and isinstance(institutions, list) and not extracted.get("school_name"):
        normalized["school_name"] = institutions[0]

    # gpa_info.cumulative → gpa
    gpa_info = extracted.get("gpa_info") or {}
    if isinstance(gpa_info, dict) and not extracted.get("gpa"):
        cumulative = gpa_info.get("cumulative")
        if cumulative is not None:
            normalized["gpa"] = cumulative

    # transfer_credits (list of {institution, courses}) → transfer_hours (number)
    transfer_list = extracted.get("transfer_credits")
    if isinstance(transfer_list, list) and not extracted.get("transfer_hours"):
        total_transfer = 0.0
        for tr in transfer_list:
            for course in (tr.get("courses") or []):
                try:
                    total_transfer += float(course.get("credits") or 0)
                except (TypeError, ValueError):
                    pass
        normalized["transfer_hours"] = total_transfer

    # enrollment_start → start_date (for compressed timeline rule)
    enrollment_start = extracted.get("enrollment_start")
    if enrollment_start and not extracted.get("start_date"):
        normalized["start_date"] = str(enrollment_start)

    # earned_credit_hours: if available, also expose as total_credit_hours_earned
    # (keep total_credit_hours as attempted so program hours rule still works)
    earned = extracted.get("earned_credit_hours")
    if earned is not None:
        normalized["earned_credit_hours"] = earned

    return normalized


def _run_pipeline(event: dict) -> dict:
    """Run the verification pipeline (called from Step Functions)."""
    transcript_id = event["transcriptId"]
    extracted_data_key = event["extractedDataKey"]
    timestamp = datetime.now(timezone.utc).isoformat()

    # 1. Mark as verifying
    db.update_transcript_status(transcript_id, "VERIFYING")

    # 2. Load extracted data from S3
    logger.info("Loading extracted data from %s", extracted_data_key)
    try:
        extracted_data = s3_utils.get_json(extracted_data_key)
    except Exception as e:
        logger.error("Failed to load extracted data: %s", e)
        db.update_transcript_status(transcript_id, "VERIFICATION_FAILED")
        db.put_audit_entry(AuditEntry(
            transcript_id=transcript_id,
            actor="system",
            action="VERIFICATION_FAILED",
            details={"error": str(e)},
        ).to_dynamo())
        raise

    # 3. Strip raw OCR text — not needed by rules engine or AI analysis, and
    #    sending 20K chars of OCR to Nova Pro every verification call wastes tokens.
    extracted_data.pop("raw_text", None)

    # 4. Run deterministic rules
    logger.info("Running deterministic rules")
    rule_results = run_all_rules(_normalize_for_rules(extracted_data))

    pass_count  = sum(1 for r in rule_results if r["status"] == "PASS")
    flag_count  = sum(1 for r in rule_results if r["status"] == "FLAG")
    unable_count = sum(1 for r in rule_results if r["status"] == "UNABLE_TO_DETERMINE")
    logger.info("Rules: %d PASS, %d FLAG, %d UNABLE", pass_count, flag_count, unable_count)

    # 5. AI holistic analysis via Nova Pro
    logger.info("Running AI analysis via Nova Pro")
    system_prompt, user_prompt = build_verification_prompt(extracted_data, rule_results)
    try:
        ai_analysis = invoke_nova_json(
            prompt=user_prompt,
            system_prompt=system_prompt,
            model_id=NOVA_PRO,
        )
    except Exception as e:
        logger.error("Bedrock Nova Pro failed: %s", e)
        ai_analysis = {
            "summary": f"AI analysis unavailable: {e}",
            "additionalFlags": [],
            "recommendation": "REVIEW",
            "reasoning": "AI analysis could not be completed. Manual review required.",
            "confidenceScore": 0.0,
            "riskLevel": "MEDIUM",
        }

    recommendation = ai_analysis.get("recommendation", "REVIEW")

    # Safety override: escalate if many flags
    if recommendation == "APPROVE" and flag_count > 3:
        recommendation = "REVIEW"
        ai_analysis["reasoning"] = (
            ai_analysis.get("reasoning", "")
            + " [Override: Multiple flags detected, escalating to manual review.]"
        )

    overall_status, transcript_status = _map_recommendation(recommendation)

    # 6. Save verification result to DynamoDB
    result = VerificationResult(
        transcript_id=transcript_id,
        overall_status=overall_status,
        risk_level=ai_analysis.get("riskLevel", "MEDIUM"),
        rule_results=rule_results,
        ai_analysis=ai_analysis,
        rules_applied=[r["ruleId"] for r in rule_results],
    )
    logger.info("Saving verification result %s", result.verification_id)
    db.put_verification(result.to_dynamo())

    # 7. Update transcript status
    db.update_transcript_status(transcript_id, transcript_status)

    # 8. Log audit entry
    db.put_audit_entry(AuditEntry(
        transcript_id=transcript_id,
        actor="ai",
        action="VERIFICATION_COMPLETE",
        details={
            "verificationId": result.verification_id,
            "recommendation": recommendation,
            "passCount": pass_count,
            "flagCount": flag_count,
            "unableCount": unable_count,
            "riskLevel": ai_analysis.get("riskLevel", "MEDIUM"),
        },
    ).to_dynamo())

    return {
        "transcriptId": transcript_id,
        "verificationId": result.verification_id,
        "extractedDataKey": extracted_data_key,
        "recommendation": recommendation,
        "riskLevel": ai_analysis.get("riskLevel", "MEDIUM"),
        "status": transcript_status,
    }


def handler(event: dict, context) -> dict:
    """Entry point — routes to API handler or pipeline depending on caller."""
    logger.info("Verify handler invoked")

    # API Gateway invocation
    if "httpMethod" in event:
        http_method = event.get("httpMethod", "")
        if http_method == "OPTIONS":
            return _api_response(200, {})
        path_params = event.get("pathParameters") or {}
        transcript_id = path_params.get("transcriptId")
        if http_method == "GET" and transcript_id:
            return _handle_api_get(transcript_id)
        return _api_response(400, {"error": f"Unsupported route: {http_method}"})

    # Step Functions invocation
    return _run_pipeline(event)
