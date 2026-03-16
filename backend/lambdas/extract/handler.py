"""Lambda handler for extracting structured data from nursing school transcript PDFs.

Part of the MSBON Fraud-Sensitive Transcript Verification system.
Uses Amazon Textract for OCR and Amazon Bedrock (Nova Lite) for structured parsing.
"""

import json
import logging
import sys
from datetime import datetime

import boto3

# Lambda layer shared modules
sys.path.insert(0, "/opt")
from models import AuditEntry
import db
import s3_utils
from bedrock_client import invoke_nova_json, NOVA_LITE

logger = logging.getLogger()
logger.setLevel(logging.INFO)

_textract = boto3.client("textract", region_name="us-east-1")

EXTRACTION_SCHEMA = {
    "student_id": "string",
    "institutions": ["list of institution names"],
    "program_name": "string",
    "program_type": "one of: ADN, BSN, MSN, LPN",
    "courses": [
        {
            "name": "string",
            "number": "string",
            "credits": "number",
            "grade": "string",
            "term": "string",
        }
    ],
    "transfer_credits": [
        {
            "institution": "string",
            "courses": [
                {
                    "name": "string",
                    "number": "string",
                    "credits": "number",
                    "grade": "string",
                }
            ],
        }
    ],
    "degree_conferral": "string or null",
    "graduation_date": "string (YYYY-MM-DD) or null",
    "graduation_confirmed": "boolean",
    "gpa_info": {
        "cumulative": "number or null",
        "program": "number or null",
        "by_term": [{"term": "string", "gpa": "number"}],
    },
    "total_credit_hours": "number",
    "enrollment_terms": ["list of term strings, e.g. 'Fall 2023'"],
}

SYSTEM_PROMPT = (
    "You are a data extraction assistant for a nursing board transcript verification system. "
    "Your job is to parse raw OCR text from nursing school transcripts and return structured JSON. "
    "Be precise and faithful to the source text. Do not invent data that is not present. "
    "If a field cannot be determined from the text, use null for optional fields or empty "
    "lists/strings for required fields. Return ONLY valid JSON, no commentary."
)

USER_PROMPT_TEMPLATE = """Extract structured data from the following nursing school transcript text.

Return a JSON object matching this exact schema:
{schema}

Important instructions:
- program_type must be one of: ADN, BSN, MSN, LPN. If unclear, use the best match or empty string.
- graduation_confirmed should be true only if the transcript explicitly states the degree was conferred/awarded.
- For courses, extract every course listed with as much detail as available.
- For transfer_credits, group courses by their originating institution.
- For gpa_info, extract cumulative GPA, program-specific GPA, and per-term GPA if available.
- Dates should be in YYYY-MM-DD format when possible.
- If the transcript spans multiple institutions, list all in the institutions array.

Transcript text:
{raw_text}"""


def _extract_text_with_textract(pdf_bytes: bytes) -> str:
    """Use Amazon Textract synchronous API to extract text from PDF bytes.

    The synchronous detect_document_text API supports documents up to 5MB
    and handles single and multi-page PDFs passed as raw bytes.
    """
    response = _textract.detect_document_text(
        Document={"Bytes": pdf_bytes}
    )

    lines = []
    for block in response.get("Blocks", []):
        if block["BlockType"] == "LINE":
            lines.append(block["Text"])

    page_count = 0
    for block in response.get("Blocks", []):
        if block["BlockType"] == "PAGE":
            page_count += 1

    return "\n".join(lines), max(page_count, 1)


def _parse_with_bedrock(raw_text: str) -> dict:
    """Send raw transcript text to Nova Lite for structured extraction."""
    schema_str = json.dumps(EXTRACTION_SCHEMA, indent=2)
    prompt = USER_PROMPT_TEMPLATE.format(schema=schema_str, raw_text=raw_text)

    extracted = invoke_nova_json(
        prompt=prompt,
        system_prompt=SYSTEM_PROMPT,
        model_id=NOVA_LITE,
        max_tokens=8192,
        temperature=0.0,
    )

    return extracted


def handler(event, context):
    """Lambda entry point. Invoked by Step Functions.

    Expected event:
        {
            "transcriptId": "uuid-string",
            "s3Key": "uploads/uuid-string.pdf"
        }

    Returns:
        {
            "transcriptId": "uuid-string",
            "extractedDataKey": "extracted/uuid-string.json"
        }
    """
    transcript_id = event["transcriptId"]
    s3_key = event["s3Key"]

    logger.info("Starting extraction for transcript %s from %s", transcript_id, s3_key)

    try:
        # Update status to EXTRACTING
        db.update_transcript_status(transcript_id, "EXTRACTING")

        # Step 1: Download PDF from S3
        logger.info("Downloading PDF from S3: %s", s3_key)
        pdf_bytes = s3_utils.get_pdf_bytes(s3_key)
        logger.info("Downloaded PDF, size: %d bytes", len(pdf_bytes))

        # Step 2: Extract raw text via Textract
        logger.info("Running Textract OCR")
        raw_text, page_count = _extract_text_with_textract(pdf_bytes)
        logger.info("Textract extracted %d characters across %d page(s)", len(raw_text), page_count)

        if not raw_text.strip():
            raise ValueError("Textract returned no text from the PDF. The document may be image-only or corrupt.")

        # Step 3: Parse raw text into structured JSON via Bedrock
        logger.info("Sending text to Bedrock Nova Lite for structured extraction")
        extracted_data = _parse_with_bedrock(raw_text)

        # Attach raw text and page count to the extracted data
        extracted_data["raw_text"] = raw_text
        extracted_data["page_count"] = page_count

        # Step 4: Save extracted data to S3
        extracted_data_key = s3_utils.save_extracted_data(transcript_id, extracted_data)
        logger.info("Saved extracted data to %s", extracted_data_key)

        # Step 5: Update transcript status in DynamoDB
        db.update_transcript_status(
            transcript_id,
            "EXTRACTED",
            extractedDataKey=extracted_data_key,
        )

        # Step 6: Log audit entry
        audit = AuditEntry(
            transcript_id=transcript_id,
            actor="system",
            action="EXTRACTION_COMPLETE",
            details={
                "page_count": page_count,
                "text_length": len(raw_text),
                "courses_found": len(extracted_data.get("courses", [])),
                "institutions_found": len(extracted_data.get("institutions", [])),
                "extracted_data_key": extracted_data_key,
            },
        )
        db.put_audit_entry(audit.to_dynamo())

        logger.info("Extraction complete for transcript %s", transcript_id)

        return {
            "transcriptId": transcript_id,
            "extractedDataKey": extracted_data_key,
        }

    except Exception as e:
        logger.exception("Extraction failed for transcript %s: %s", transcript_id, str(e))

        # Update status to reflect failure
        db.update_transcript_status(transcript_id, "EXTRACTION_FAILED")

        # Log failure audit entry
        audit = AuditEntry(
            transcript_id=transcript_id,
            actor="system",
            action="EXTRACTION_FAILED",
            details={"error": str(e)},
        )
        db.put_audit_entry(audit.to_dynamo())

        raise
