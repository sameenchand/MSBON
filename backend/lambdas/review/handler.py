"""Lambda handler for human review actions."""

import json

import sys
sys.path.insert(0, "/opt")
from models import ReviewAction, AuditEntry
import db


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


def _handle_create_review(body: dict) -> dict:
    """Create a new review action (confirm, override, annotate)."""
    transcript_id = body.get("transcriptId", "")
    if not transcript_id:
        return _response(400, {"error": "transcriptId is required"})

    # Verify the transcript exists
    transcript = db.get_transcript(transcript_id)
    if not transcript:
        return _response(404, {"error": "Transcript not found"})

    review = ReviewAction(
        transcript_id=transcript_id,
        reviewer_id=body.get("reviewerId", ""),
        action=body.get("action", ""),
        overrides=body.get("overrides", []),
        annotations=body.get("annotations", ""),
    )

    # Persist review
    db.put_review(review.to_dynamo())

    # Log audit entry
    audit = AuditEntry(
        transcript_id=transcript_id,
        actor=review.reviewer_id or "unknown",
        action=f"REVIEW_{review.action.upper()}",
        details={
            "reviewId": review.review_id,
            "overrides": review.overrides,
            "annotations": review.annotations,
        },
    )
    db.put_audit_entry(audit.to_dynamo())

    # Update transcript status based on review action
    action_upper = review.action.upper()
    if action_upper == "CONFIRM":
        db.update_transcript_status(transcript_id, "REVIEWED")
    elif action_upper == "OVERRIDE":
        # Update flag/undetermined counts to reflect staff overrides
        extra = {}
        if body.get("flagCount") is not None:
            extra["flagCount"] = int(body["flagCount"])
        if body.get("undeterminedCount") is not None:
            extra["undeterminedCount"] = int(body["undeterminedCount"])
        db.update_transcript_status(transcript_id, "REVIEWED", **extra)

    return _response(201, {
        "reviewId": review.review_id,
        "transcriptId": transcript_id,
        "action": review.action,
        "message": "Review action recorded",
    })


def _handle_get_reviews(transcript_id: str) -> dict:
    """Get all reviews for a transcript."""
    reviews = db.get_reviews_for_transcript(transcript_id)
    return _response(200, {"transcriptId": transcript_id, "reviews": reviews})


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

        # POST /reviews
        if http_method == "POST" and path == "/reviews":
            return _handle_create_review(body)

        # GET /reviews/{transcriptId}
        transcript_id = path_params.get("transcriptId")
        if http_method == "GET" and transcript_id:
            return _handle_get_reviews(transcript_id)

        return _response(400, {"error": f"Unsupported route: {http_method} {path}"})

    except Exception as e:
        print(f"Error: {e}")
        return _response(500, {"error": str(e)})
