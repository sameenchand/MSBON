"""Lambda handler for generating verification reports via Bedrock Nova."""

import json
import sys

sys.path.insert(0, "/opt")
from models import AuditEntry
import db
import s3_utils
from bedrock_client import invoke_nova_json, NOVA_LITE


REPORT_SYSTEM_PROMPT = """You are a nursing board transcript verification analyst.
Generate a clear, structured verification report in JSON format with these fields:
- summary: A plain-language summary of the overall verification outcome.
- findings: A list of objects, each with {ruleId, status, description, recommendation}.
- riskAssessment: Overall risk level (LOW, MEDIUM, HIGH) with explanation.
- recommendedAction: What the board should do next (APPROVE, REVIEW, REJECT).
Be concise, factual, and cite specific transcript data where relevant."""


def handler(event, context):
    """Generate a human-readable verification report.

    Invoked by Step Functions with transcriptId and verificationId.
    """
    try:
        transcript_id = event["transcriptId"]
        verification_id = event.get("verificationId", "")

        # Load verification results from DynamoDB
        verifications = db.get_verifications_for_transcript(transcript_id)
        if not verifications:
            raise ValueError(f"No verification results found for transcript {transcript_id}")

        # Use the specific verification or the most recent one
        verification = None
        if verification_id:
            verification = next(
                (v for v in verifications if v.get("verificationId") == verification_id),
                None,
            )
        if not verification:
            verification = verifications[-1]

        # Load extracted transcript data from S3
        extracted_data = s3_utils.get_extracted_data(transcript_id)

        # Build the prompt for Nova
        prompt = f"""Given the following transcript verification results and extracted transcript data,
generate a comprehensive verification report.

## Verification Results
{json.dumps(verification, default=str, indent=2)}

## Extracted Transcript Data
{json.dumps(extracted_data, default=str, indent=2)}

Generate the report in the specified JSON format."""

        # Call Bedrock Nova Lite to generate the report
        report = invoke_nova_json(
            prompt=prompt,
            system_prompt=REPORT_SYSTEM_PROMPT,
            model_id=NOVA_LITE,
            max_tokens=4096,
            temperature=0.1,
        )

        # Attach metadata to the report
        report["transcriptId"] = transcript_id
        report["verificationId"] = verification.get("verificationId", verification_id)

        # Save report to S3
        report_key = s3_utils.save_report(transcript_id, report)

        # Determine final status based on report
        recommended_action = report.get("recommendedAction", "REVIEW")
        if recommended_action == "APPROVE":
            new_status = "VERIFIED"
        else:
            new_status = "REVIEW_REQUIRED"

        # Update transcript status
        db.update_transcript_status(transcript_id, new_status)

        # Log audit entry
        audit = AuditEntry(
            transcript_id=transcript_id,
            actor="ai",
            action="REPORT_GENERATED",
            details={
                "verificationId": verification.get("verificationId", verification_id),
                "reportKey": report_key,
                "recommendedAction": recommended_action,
                "newStatus": new_status,
            },
        )
        db.put_audit_entry(audit.to_dynamo())

        return {
            "transcriptId": transcript_id,
            "verificationId": verification.get("verificationId", verification_id),
            "reportKey": report_key,
            "status": new_status,
            "recommendedAction": recommended_action,
        }

    except Exception as e:
        print(f"Error generating report: {e}")
        raise
