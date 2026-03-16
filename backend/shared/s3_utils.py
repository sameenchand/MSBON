"""S3 helper utilities."""

import os
import json
import boto3


_s3 = boto3.client("s3", region_name="us-east-1")


def get_bucket_name() -> str:
    return os.environ["TRANSCRIPT_BUCKET"]


def upload_pdf(key: str, body: bytes) -> str:
    bucket = get_bucket_name()
    _s3.put_object(Bucket=bucket, Key=key, Body=body, ContentType="application/pdf")
    return key


def get_pdf_bytes(key: str) -> bytes:
    bucket = get_bucket_name()
    resp = _s3.get_object(Bucket=bucket, Key=key)
    return resp["Body"].read()


def save_extracted_data(transcript_id: str, data: dict) -> str:
    key = f"extracted/{transcript_id}.json"
    bucket = get_bucket_name()
    _s3.put_object(
        Bucket=bucket,
        Key=key,
        Body=json.dumps(data, default=str),
        ContentType="application/json",
    )
    return key


def get_extracted_data(transcript_id: str) -> dict:
    key = f"extracted/{transcript_id}.json"
    bucket = get_bucket_name()
    resp = _s3.get_object(Bucket=bucket, Key=key)
    return json.loads(resp["Body"].read().decode("utf-8"))


def save_report(transcript_id: str, report: dict) -> str:
    key = f"reports/{transcript_id}.json"
    bucket = get_bucket_name()
    _s3.put_object(
        Bucket=bucket,
        Key=key,
        Body=json.dumps(report, default=str),
        ContentType="application/json",
    )
    return key


def get_report(transcript_id: str) -> dict:
    key = f"reports/{transcript_id}.json"
    bucket = get_bucket_name()
    resp = _s3.get_object(Bucket=bucket, Key=key)
    return json.loads(resp["Body"].read().decode("utf-8"))


def generate_presigned_upload_url(key: str, content_type: str = "application/pdf", expires: int = 300) -> str:
    bucket = get_bucket_name()
    return _s3.generate_presigned_url(
        "put_object",
        Params={"Bucket": bucket, "Key": key, "ContentType": content_type},
        ExpiresIn=expires,
    )


def generate_presigned_download_url(key: str, expires: int = 300) -> str:
    bucket = get_bucket_name()
    return _s3.generate_presigned_url(
        "get_object",
        Params={"Bucket": bucket, "Key": key},
        ExpiresIn=expires,
    )
