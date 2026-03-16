"""Lambda handler for audit log queries."""

import json

import sys
sys.path.insert(0, "/opt")
import db


CORS_HEADERS = {
    "Content-Type": "application/json",
    "Access-Control-Allow-Origin": "*",
    "Access-Control-Allow-Headers": "Content-Type,Authorization",
    "Access-Control-Allow-Methods": "GET,OPTIONS",
}


def _response(status_code: int, body: dict) -> dict:
    return {
        "statusCode": status_code,
        "headers": CORS_HEADERS,
        "body": json.dumps(body, default=str),
    }


def handler(event, context):
    """Main Lambda entry point routed by API Gateway."""
    try:
        http_method = event.get("httpMethod", "")
        path = event.get("path", "")
        path_params = event.get("pathParameters") or {}

        # OPTIONS (CORS preflight)
        if http_method == "OPTIONS":
            return _response(200, {})

        # GET /audit/{transcriptId}
        transcript_id = path_params.get("transcriptId")
        if http_method == "GET" and transcript_id:
            entries = db.get_audit_log(transcript_id)
            return _response(200, {
                "transcriptId": transcript_id,
                "auditLog": entries,
            })

        return _response(400, {"error": f"Unsupported route: {http_method} {path}"})

    except Exception as e:
        print(f"Error: {e}")
        return _response(500, {"error": str(e)})
