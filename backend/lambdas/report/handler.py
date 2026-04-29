"""Lambda handler for generating the final verification report.

Assembles the report directly from the verification data already stored by the
verify Lambda — no additional Bedrock call is needed. The verify step (Nova Pro)
already produced a full AI analysis and 18 rule results; re-calling Bedrock here
added cost and latency with no quality benefit.
"""

import logging
import sys

sys.path.insert(0, "/opt")
from models import AuditEntry
import db
import s3_utils

logger = logging.getLogger()
logger.setLevel(logging.INFO)


def handler(event, context):
    """Assemble and save the final verification report.

    Invoked by Step Functions with transcriptId and verificationId.
    Sets transcript status to COMPLETE on success.
    """
    transcript_id = event["transcriptId"]
    verification_id = event.get("verificationId", "")

    try:
        # Load verification results from DynamoDB
        verifications = db.get_verifications_for_transcript(transcript_id)
        if not verifications:
            raise ValueError(f"No verification results found for transcript {transcript_id}")

        verification = None
        if verification_id:
            verification = next(
                (v for v in verifications if v.get("verificationId") == verification_id),
                None,
            )
        if not verification:
            verification = verifications[-1]

        # Assemble report from existing verification data — no Bedrock call.
        # The verify Lambda (Nova Pro) already produced a full AI analysis and
        # all rule results. We simply structure them into the report format.
        ai_analysis = verification.get("aiAnalysis") or {}
        rule_results = verification.get("ruleResults") or []

        flag_count = sum(1 for r in rule_results if r.get("status") == "FLAG")
        pass_count = sum(1 for r in rule_results if r.get("status") == "PASS")
        unable_count = sum(1 for r in rule_results if r.get("status") == "UNABLE_TO_DETERMINE")

        report = {
            "transcriptId": transcript_id,
            "verificationId": verification.get("verificationId", verification_id),
            "summary": ai_analysis.get("summary", ""),
            "recommendation": ai_analysis.get("recommendation", "REVIEW"),
            "riskLevel": verification.get("riskLevel", "MEDIUM"),
            "overallStatus": verification.get("overallStatus", "REVIEW_REQUIRED"),
            "findings": [
                {
                    "ruleId": r.get("ruleId"),
                    "status": r.get("status"),
                    "explanation": r.get("explanation"),
                    "confidence": r.get("confidence"),
                    "sourceSection": r.get("sourceSection"),
                }
                for r in rule_results
            ],
            "additionalFlags": ai_analysis.get("additionalFlags", []),
            "reasoning": ai_analysis.get("reasoning", ""),
            "confidenceScore": ai_analysis.get("confidenceScore", 0.0),
            "flagCount": flag_count,
            "passCount": pass_count,
            "unableCount": unable_count,
        }

        # Save report to S3
        report_key = s3_utils.save_report(transcript_id, report)
        logger.info("Saved report to %s", report_key)

        # Mark transcript as COMPLETE — pipeline is done
        db.update_transcript_status(transcript_id, "COMPLETE")

        # Log audit entry
        audit = AuditEntry(
            transcript_id=transcript_id,
            actor="system",
            action="REPORT_GENERATED",
            details={
                "verificationId": report["verificationId"],
                "reportKey": report_key,
                "recommendation": report["recommendation"],
                "flagCount": flag_count,
                "passCount": pass_count,
            },
        )
        db.put_audit_entry(audit.to_dynamo())

        return {
            "transcriptId": transcript_id,
            "verificationId": report["verificationId"],
            "reportKey": report_key,
            "status": "COMPLETE",
            "recommendation": report["recommendation"],
        }

    except Exception as e:
        logger.exception("Report generation failed for transcript %s: %s", transcript_id, e)
        db.update_transcript_status(transcript_id, "REVIEW_REQUIRED")
        raise
