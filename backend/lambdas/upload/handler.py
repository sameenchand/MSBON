"""Lambda handler for transcript upload and listing."""

import json
import os
import uuid

import sys
sys.path.insert(0, "/opt")
from models import TranscriptRecord, AuditEntry
import db
import s3_utils

import boto3

sfn_client = boto3.client("stepfunctions", region_name="us-east-1")

CORS_HEADERS = {
    "Content-Type": "application/json",
    "Access-Control-Allow-Origin": "*",
    "Access-Control-Allow-Headers": "Content-Type,Authorization",
    "Access-Control-Allow-Methods": "GET,POST,OPTIONS",
}


def _response(status_code: int, body: dict) -> dict:
    return {
        "statusCode": status_code,
        "headers": CORS_HEADERS,
        "body": json.dumps(body, default=str),
    }


def _start_step_functions(transcript_id: str) -> str:
    """Start the verification state machine for a transcript."""
    execution = sfn_client.start_execution(
        stateMachineArn=os.environ["STATE_MACHINE_ARN"],
        name=f"verify-{transcript_id}-{uuid.uuid4().hex[:8]}",
        input=json.dumps({"transcriptId": transcript_id}),
    )
    return execution["executionArn"]


def _handle_post_transcript(body: dict) -> dict:
    """Generate a presigned upload URL, create transcript record, start Step Functions."""
    applicant_id = body.get("applicantId", "")
    file_name = body.get("fileName", "transcript.pdf")
    school_name = body.get("schoolName", "")
    program_type = body.get("programType", "")

    record = TranscriptRecord(
        applicant_id=applicant_id,
        school_name=school_name,
        program_type=program_type,
        file_name=file_name,
    )
    s3_key = f"uploads/{record.transcript_id}/{file_name}"
    record.s3_key = s3_key

    # Generate presigned URL for client-side upload
    upload_url = s3_utils.generate_presigned_upload_url(s3_key)

    # Persist transcript record
    db.put_transcript(record.to_dynamo())

    # Start the verification pipeline
    execution_arn = _start_step_functions(record.transcript_id)

    # Log audit entry
    audit = AuditEntry(
        transcript_id=record.transcript_id,
        actor="system",
        action="TRANSCRIPT_UPLOADED",
        details={
            "fileName": file_name,
            "applicantId": applicant_id,
            "executionArn": execution_arn,
        },
    )
    db.put_audit_entry(audit.to_dynamo())

    return _response(201, {
        "transcriptId": record.transcript_id,
        "uploadUrl": upload_url,
        "s3Key": s3_key,
        "status": record.status,
    })


def _handle_list_transcripts() -> dict:
    """List all transcripts."""
    items = db.list_transcripts()
    return _response(200, {"transcripts": items})


def _handle_get_transcript(transcript_id: str) -> dict:
    """Get a single transcript by ID."""
    item = db.get_transcript(transcript_id)
    if not item:
        return _response(404, {"error": "Transcript not found"})
    return _response(200, item)


def _handle_verify_transcript(transcript_id: str) -> dict:
    """Trigger verification for an existing transcript."""
    item = db.get_transcript(transcript_id)
    if not item:
        return _response(404, {"error": "Transcript not found"})

    execution_arn = _start_step_functions(transcript_id)

    audit = AuditEntry(
        transcript_id=transcript_id,
        actor="system",
        action="VERIFICATION_TRIGGERED",
        details={"executionArn": execution_arn},
    )
    db.put_audit_entry(audit.to_dynamo())

    return _response(200, {
        "transcriptId": transcript_id,
        "executionArn": execution_arn,
        "message": "Verification started",
    })


def handler(event, context):
    """Main Lambda entry point routed by API Gateway."""
    try:
        http_method = event.get("httpMethod", "")
        path = event.get("path", "")
        path_params = event.get("pathParameters") or {}
        body = {}
        if event.get("body"):
            body = json.loads(event["body"])

        # OPTIONS (CORS preflight)
        if http_method == "OPTIONS":
            return _response(200, {})

        # POST /transcripts
        if http_method == "POST" and path == "/transcripts":
            return _handle_post_transcript(body)

        # GET /transcripts
        if http_method == "GET" and path == "/transcripts":
            return _handle_list_transcripts()

        # GET /transcripts/{transcriptId}
        transcript_id = path_params.get("transcriptId")
        if http_method == "GET" and transcript_id:
            return _handle_get_transcript(transcript_id)

        # POST /transcripts/{transcriptId}/verify
        if http_method == "POST" and transcript_id and path.endswith("/verify"):
            return _handle_verify_transcript(transcript_id)

        return _response(400, {"error": f"Unsupported route: {http_method} {path}"})

    except Exception as e:
        print(f"Error: {e}")
        return _response(500, {"error": str(e)})
