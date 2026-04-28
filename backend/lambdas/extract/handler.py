"""Lambda handler for extracting structured data from nursing school transcript PDFs.

Part of the MSBON Fraud-Sensitive Transcript Verification system.
Uses Amazon Textract (with TABLES feature) for OCR and Amazon Bedrock Nova Pro
for high-accuracy structured extraction.
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
from bedrock_client import invoke_nova_json, NOVA_PRO

logger = logging.getLogger()
logger.setLevel(logging.INFO)

_textract = boto3.client("textract", region_name="us-east-1")

EXTRACTION_SCHEMA = {
    "student_id": "string or empty string if redacted",
    "institutions": ["list of all institution names found on the transcript"],
    "document_issued_to": "who the transcript was officially issued to, e.g. 'Mississippi Board of Nursing' — extract verbatim if present, else empty string",
    "program_name": "full program name as written on transcript",
    "program_type": "one of: LPN, ADN, BSN, MSN, DNP — use best match based on program name and credential",
    "credential_type": "the awarded credential, e.g. 'Career Certificate', 'Associate of Applied Science', 'Bachelor of Science in Nursing', 'Diploma'",
    "enrollment_start": "the earliest term or date the student enrolled, e.g. 'Fall 2018' or '2018-08-01'",
    "courses": [
        {
            "name": "course title as written",
            "number": "course code/number, e.g. PNV 1115",
            "credits": "numeric credit hours",
            "grade": "grade as written including any suffix like (R) for repeated",
            "term": "the specific term this course was taken — be precise, do not guess",
            "repeated": "true if course is marked as repeated/retake (R suffix or explicit retake notation), else false",
        }
    ],
    "transfer_credits": [
        {
            "institution": "sending institution name",
            "courses": [
                {
                    "name": "course title",
                    "number": "course code",
                    "credits": "numeric credits",
                    "grade": "grade as written",
                }
            ],
        }
    ],
    "academic_standing_per_term": [
        {
            "term": "term name",
            "standing": "academic standing exactly as written, e.g. 'Good Standing', 'Scholastic Probation', 'President's List', 'Academic Suspension'",
        }
    ],
    "degree_conferral": "the degree/credential conferral statement as written, or null",
    "graduation_date": "completion or graduation date in YYYY-MM-DD format, or null",
    "graduation_confirmed": "true only if transcript explicitly states degree was conferred, awarded, or program was completed",
    "gpa_info": {
        "cumulative": "cumulative GPA as a number, or null",
        "program": "program-specific GPA if different from cumulative, or null",
        "by_term": [{"term": "term name", "gpa": "numeric GPA for that term"}],
    },
    "total_credit_hours": "total attempted credit hours as a number",
    "earned_credit_hours": "total earned/completed credit hours (may differ from attempted if courses were failed or withdrawn)",
    "enrollment_terms": ["list of all term strings in chronological order, e.g. 'Fall 2018', 'Spring 2019'"],
}

SYSTEM_PROMPT = (
    "You are a forensic data extraction specialist for a nursing board transcript verification system. "
    "Your job is to parse OCR text from official nursing school transcripts and return accurate structured JSON. "
    "Accuracy is critical — this data will be used to verify credentials and detect fraud. "
    "Rules: (1) Be precise and faithful to the source text. (2) Never invent or infer data not present. "
    "(3) Pay close attention to which TERM each course belongs to — do not mix up terms. "
    "(4) If a field cannot be determined, use null for optional fields or empty lists/strings. "
    "(5) Return ONLY valid JSON with no commentary or markdown."
)

USER_PROMPT_TEMPLATE = """Extract structured data from the following official nursing school transcript.

IMPORTANT: Pay close attention to course-term assignments. Each course belongs to a specific term
(semester/session). Read the term headers carefully and assign each course to the correct term.
Do NOT mix up which courses belong to which terms.

Return a JSON object matching this exact schema:
{schema}

Key extraction rules:
- program_type: LPN, ADN, BSN, MSN, or DNP only. Use best match from program name and credential type.
- graduation_confirmed: true ONLY if transcript explicitly states degree was conferred/awarded/completed.
- credential_type: extract the exact credential name (Career Certificate, Associate Degree, Diploma, etc.)
- document_issued_to: if transcript header says "Issued To:" capture that value verbatim.
- enrollment_start: find the earliest term/session header on the transcript.
- academic_standing_per_term: extract the standing shown after each term (Good Standing, Scholastic Probation, etc.)
- For courses marked (R): set repeated=true, keep the (R) in the grade field.
- earned_credit_hours: look for "Total Earned Credits" or similar — this may differ from attempted.
- Dates in YYYY-MM-DD format. Terms as written (e.g. "2018 Fall Session", "Spring 2019").

EXAMPLE — correct term-course assignment (the most critical part):
Input OCR: "2022 Fall Session | PNV 1115 Practical Nursing Foundations B 5 | PNV 1126 Nursing Pharmacology A 6 | Good Standing | 2023 Spring Session | PNV 1212 Practical Nursing II B 5 | PNV 1216 Advanced Practical Nursing F.S. A(R) 6"
Correct partial output:
  enrollment_terms: ["2022 Fall Session", "2023 Spring Session"]
  academic_standing_per_term: [{{"term": "2022 Fall Session", "standing": "Good Standing"}}]
  courses: [
    {{"name": "Practical Nursing Foundations", "number": "PNV 1115", "credits": 5, "grade": "B", "term": "2022 Fall Session", "repeated": false}},
    {{"name": "Nursing Pharmacology", "number": "PNV 1126", "credits": 6, "grade": "A", "term": "2022 Fall Session", "repeated": false}},
    {{"name": "Practical Nursing II", "number": "PNV 1212", "credits": 5, "grade": "B", "term": "2023 Spring Session", "repeated": false}},
    {{"name": "Advanced Practical Nursing F.S.", "number": "PNV 1216", "credits": 6, "grade": "A(R)", "term": "2023 Spring Session", "repeated": true}}
  ]
Note: PNV 1216 belongs to 2023 Spring — it appears AFTER the Spring header, not the Fall header.

Transcript text (LINE blocks followed by structured TABLE data):
{raw_text}"""


def _extract_tables_from_blocks(blocks: list[dict]) -> str:
    """Convert Textract TABLE blocks into pipe-delimited rows for cleaner parsing.

    Transcript course data is typically in tables. Extracting table structure
    preserves the column alignment (course | grade | credits | term) that raw
    LINE text loses, giving the AI model a much clearer signal.
    """
    block_map = {b["Id"]: b for b in blocks}
    table_texts: list[str] = []

    for block in blocks:
        if block["BlockType"] != "TABLE":
            continue

        rows: dict[int, dict[int, str]] = {}
        for rel in block.get("Relationships", []):
            if rel["Type"] != "CHILD":
                continue
            for cell_id in rel["Ids"]:
                cell = block_map.get(cell_id)
                if not cell or cell["BlockType"] != "CELL":
                    continue
                row_idx = cell["RowIndex"]
                col_idx = cell["ColumnIndex"]
                cell_words: list[str] = []
                for cell_rel in cell.get("Relationships", []):
                    if cell_rel["Type"] != "CHILD":
                        continue
                    for word_id in cell_rel["Ids"]:
                        word = block_map.get(word_id)
                        if word and word["BlockType"] == "WORD":
                            cell_words.append(word["Text"])
                rows.setdefault(row_idx, {})[col_idx] = " ".join(cell_words)

        if not rows:
            continue

        table_lines = []
        for row_idx in sorted(rows):
            row_data = rows[row_idx]
            table_lines.append(" | ".join(row_data.get(c, "") for c in sorted(row_data)))
        table_texts.append("\n".join(table_lines))

    if not table_texts:
        return ""
    return "\n\n[STRUCTURED TABLE DATA]\n" + "\n\n[TABLE]\n".join(table_texts)


def _extract_text_with_textract(pdf_bytes: bytes, s3_key: str) -> tuple[str, int]:
    """Extract text and table structure from a PDF using Textract async document analysis.

    Uses start_document_analysis with TABLES feature so course/grade/credit columns
    are captured with their structure intact. Polls until the job completes or
    the Lambda timeout approaches.
    """
    import time

    bucket = s3_utils.get_bucket_name()

    # Start async document analysis with TABLES and FORMS features
    response = _textract.start_document_analysis(
        DocumentLocation={"S3Object": {"Bucket": bucket, "Name": s3_key}},
        FeatureTypes=["TABLES", "FORMS"],
    )
    job_id = response["JobId"]
    logger.info("Textract analysis job started: %s", job_id)

    # Poll until complete (max 260s, staying within the 300s Lambda timeout)
    deadline = time.time() + 260
    while time.time() < deadline:
        result = _textract.get_document_analysis(JobId=job_id)
        status = result["JobStatus"]
        if status == "SUCCEEDED":
            break
        if status == "FAILED":
            raise RuntimeError(f"Textract job failed: {result.get('StatusMessage', 'unknown')}")
        time.sleep(5)
    else:
        raise TimeoutError("Textract job did not complete within 260 seconds")

    # Collect all blocks across paginated results
    blocks = list(result.get("Blocks", []))
    next_token = result.get("NextToken")
    while next_token:
        page_result = _textract.get_document_analysis(JobId=job_id, NextToken=next_token)
        blocks.extend(page_result.get("Blocks", []))
        next_token = page_result.get("NextToken")

    # Extract raw text from LINE blocks (preserves reading order)
    lines = [b["Text"] for b in blocks if b["BlockType"] == "LINE"]
    raw_text = "\n".join(lines)

    # Extract structured table text and append (gives AI model column-aligned data)
    table_text = _extract_tables_from_blocks(blocks)
    combined_text = raw_text + "\n" + table_text if table_text else raw_text

    page_count = sum(1 for b in blocks if b["BlockType"] == "PAGE")
    logger.info(
        "Textract extracted %d LINE blocks, %d TABLE blocks, %d page(s)",
        len(lines),
        sum(1 for b in blocks if b["BlockType"] == "TABLE"),
        page_count,
    )

    return combined_text, max(page_count, 1)


def _parse_with_bedrock(raw_text: str) -> dict:
    """Send transcript text to Nova Pro for high-accuracy structured extraction.

    Nova Pro is used here (instead of Nova Lite) because accurate field extraction
    is the most critical step — extraction errors propagate through all 18 rules
    and the AI fraud analysis. The higher cost is justified for fraud detection.

    Input is capped at 20,000 characters to handle multi-page transcripts while
    staying within Nova Pro's output token budget.
    """
    MAX_INPUT_CHARS = 20_000
    if len(raw_text) > MAX_INPUT_CHARS:
        raw_text = raw_text[:MAX_INPUT_CHARS] + "\n[... transcript truncated at 20,000 chars ...]"

    schema_str = json.dumps(EXTRACTION_SCHEMA, indent=2)
    prompt = USER_PROMPT_TEMPLATE.format(schema=schema_str, raw_text=raw_text)

    extracted = invoke_nova_json(
        prompt=prompt,
        system_prompt=SYSTEM_PROMPT,
        model_id=NOVA_PRO,
        max_tokens=6000,
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

        # Step 1: Extract raw text via Textract (reads directly from S3)
        logger.info("Running Textract async OCR on s3_key: %s", s3_key)
        raw_text, page_count = _extract_text_with_textract(None, s3_key)
        logger.info("Textract extracted %d characters across %d page(s)", len(raw_text), page_count)

        if not raw_text.strip():
            raise ValueError("Textract returned no text from the PDF. The document may be image-only or corrupt.")

        # Step 3: Parse raw text into structured JSON via Bedrock Nova Pro
        logger.info("Sending text to Bedrock Nova Pro for structured extraction")
        extracted_data = _parse_with_bedrock(raw_text)

        # Attach page count only — raw_text is excluded from the saved JSON to
        # keep S3 object size small and avoid sending 20K chars of OCR text to
        # every downstream Lambda that loads this extraction result.
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
