"""DynamoDB helper utilities."""

import os
import boto3
from boto3.dynamodb.conditions import Key


_dynamodb = boto3.resource("dynamodb", region_name="us-east-1")


def _table(name_env_var: str):
    return _dynamodb.Table(os.environ[name_env_var])


def put_transcript(item: dict) -> None:
    _table("TRANSCRIPTS_TABLE").put_item(Item=item)


def get_transcript(transcript_id: str) -> dict | None:
    resp = _table("TRANSCRIPTS_TABLE").get_item(Key={"transcriptId": transcript_id})
    return resp.get("Item")


def update_transcript_status(transcript_id: str, status: str, **extra_attrs) -> None:
    update_expr = "SET #s = :s"
    expr_names = {"#s": "status"}
    expr_values = {":s": status}
    for k, v in extra_attrs.items():
        update_expr += f", {k} = :{k}"
        expr_values[f":{k}"] = v
    _table("TRANSCRIPTS_TABLE").update_item(
        Key={"transcriptId": transcript_id},
        UpdateExpression=update_expr,
        ExpressionAttributeNames=expr_names,
        ExpressionAttributeValues=expr_values,
    )


def list_transcripts() -> list[dict]:
    resp = _table("TRANSCRIPTS_TABLE").scan()
    return resp.get("Items", [])


def put_verification(item: dict) -> None:
    _table("VERIFICATIONS_TABLE").put_item(Item=item)


def get_verifications_for_transcript(transcript_id: str) -> list[dict]:
    resp = _table("VERIFICATIONS_TABLE").query(
        IndexName="by-transcript",
        KeyConditionExpression=Key("transcriptId").eq(transcript_id),
    )
    return resp.get("Items", [])


def put_review(item: dict) -> None:
    _table("REVIEWS_TABLE").put_item(Item=item)


def get_reviews_for_transcript(transcript_id: str) -> list[dict]:
    resp = _table("REVIEWS_TABLE").query(
        IndexName="by-transcript",
        KeyConditionExpression=Key("transcriptId").eq(transcript_id),
    )
    return resp.get("Items", [])


def put_audit_entry(item: dict) -> None:
    _table("AUDIT_TABLE").put_item(Item=item)


def get_audit_log(transcript_id: str) -> list[dict]:
    resp = _table("AUDIT_TABLE").query(
        KeyConditionExpression=Key("transcriptId").eq(transcript_id),
    )
    return resp.get("Items", [])
