# Architecture

## Overview

The MSBON Transcript Verification system is a serverless AWS application built with the AWS CDK. It processes nursing school transcript PDFs through an automated pipeline that extracts structured data, applies deterministic verification rules, and surfaces findings for human review. All outputs are advisory only — the system never makes licensing decisions.

## System Diagram

```
┌─────────────────────────────────┐
│   React SPA (S3 + CloudFront)   │
│   Upload → Review → Audit       │
└──────────────┬──────────────────┘
               │ HTTPS
┌──────────────▼──────────────────┐
│   API Gateway (HTTP API)         │
│   /transcripts  /reviews  /audit │
└──────────────┬──────────────────┘
               │
┌──────────────▼──────────────────┐
│   AWS Step Functions (Express)   │
│   Extract → Verify → Report     │
└──┬───────────┬──────────┬───────┘
   │           │          │
   ▼           ▼          ▼
Textract    Bedrock     Bedrock
(async)    Nova Pro     Nova Lite
(extract)  (verify)     (report)
```

## Components

### Frontend (React SPA)

- Built with React 18, TypeScript, Vite, and TailwindCSS
- Hosted on S3 with CloudFront distribution for HTTPS and caching
- Five pages: Dashboard, Upload, Verification Detail, Review, Audit Log
- Communicates with API Gateway via a typed API client (`frontend/src/services/api.ts`)
- Mock server (`frontend/mock-server.cjs`) enables full local development without AWS

### API Gateway (HTTP API)

- HTTP API with Lambda integrations (payload format v1.0 for compatibility)
- Routes:
  - `POST /transcripts` — create transcript record, return presigned S3 upload URL
  - `GET /transcripts` — list all transcripts
  - `GET /transcripts/{id}` — get transcript with verification results
  - `POST /transcripts/{id}/verify` — trigger Step Functions pipeline
  - `POST /reviews` — submit human review decision
  - `GET /transcripts/{id}/audit` — retrieve audit log entries

### Upload Lambda

- Handles `POST /transcripts`: creates a DynamoDB record and generates a presigned S3 URL
- Handles `POST /transcripts/{id}/verify`: starts the Step Functions Express workflow
- Handles `GET /transcripts` and `GET /transcripts/{id}`: returns transcript records with verification data

### Step Functions Workflow (Express)

Orchestrates three Lambda functions in sequence:

1. **Extract** — Runs Textract (with TABLES + FORMS features), then sends structured text to Nova Pro for extraction
2. **Verify** — Applies 18 deterministic rules and calls Nova Pro for holistic fraud analysis
3. **Report** — Generates a structured verification report and saves it to S3

### Extract Lambda

- Calls Textract `StartDocumentAnalysis` (async API) with `TABLES` and `FORMS` feature types, referencing the S3 object
- Parses TABLE blocks into pipe-delimited rows to preserve course/grade/credit column alignment
- Combines raw LINE text with structured TABLE text before sending to the model
- Polls until the job completes (up to 260 seconds, within the 300-second Lambda timeout)
- Uses **Nova Pro** for structured extraction (not Nova Lite) — accuracy is critical since extraction errors propagate through all 18 rules
- Input capped at 20,000 characters (handles multi-page transcripts without truncation)
- Extracts 16 fields: institutions, program type, credential type, courses with repeat flags, transfer credits, academic standing per term, graduation info, GPA, enrollment timeline, document issuance target
- Saves structured JSON to S3

### Verify Lambda

- Loads extracted data from S3
- Normalizes field names (bridges extraction schema to rules engine schema)
- Applies 18 deterministic rules (see below)
- Calls Nova Pro for holistic transcript fraud analysis with plain-language explanation
- Saves verification result to DynamoDB and S3
- Updates transcript status to `REVIEW_REQUIRED`

### Report Lambda

- Assembles a final verification report combining rule results and AI analysis
- Saves report JSON to S3
- Updates transcript status to `COMPLETE`

### Review Lambda

- Handles `POST /reviews`: records human reviewer decisions (approve, flag, request-info, override)
- Stores review records in DynamoDB with reviewer ID and timestamp
- Writes audit entry for every review action

### Audit Lambda

- Handles `GET /transcripts/{id}/audit`: queries the audit table for all events related to a transcript
- Audit entries are append-only (never updated or deleted)

## Storage

### S3 Bucket

All objects are organized by prefix:

| Prefix | Contents |
|--------|----------|
| `uploads/` | Original PDF transcripts |
| `extracted/` | Nova Pro structured extraction JSON |
| `verifications/` | Rule engine + Nova Pro verification JSON |
| `reports/` | Final verification reports |

### DynamoDB Tables

| Table | Primary Key | Description |
|-------|-------------|-------------|
| Transcripts | `transcriptId` (String) | Transcript metadata and pipeline status |
| Verifications | `verificationId` (String) | Rule results and AI analysis per transcript |
| Reviews | `reviewId` (String) | Human review decisions |
| Audit | `transcriptId` (String) + `timestamp` (String) | Immutable audit trail |

## Verification Rules

The rule engine applies 18 deterministic checks organized into four categories:

**Graduation & Conferral**
1. Graduation confirmed — degree explicitly conferred or completion date present
2. Graduation date present and not in the future

**Program Completion**
3. Minimum credit hours met (LPN: 40, ADN: 60, BSN: 120, MSN: 36, DNP: 70)
4. Required nursing core courses present (keyword match + nursing course code prefix detection)
5. No failing grades in any course (handles community college repeat notation)
6. Clinical hours or practicum courses identified

**Accreditation**
7. Institution on the approved Mississippi nursing school list
8. Accreditation type recognized (ACEN, CCNE, CNEA, etc.)

**Fraud Indicators**
9. Program timeline not suspiciously compressed (semester strings parsed to dates)
10. Enrollment periods consistent — no unexplained large gaps or overlaps
11. Transfer credits within reasonable proportion of total hours
12. Reported GPA consistent with calculated GPA from course grades
13. No suspicious duplicate course entries

**Extended Rules**
14. Academic standing per term — flags Scholastic Probation or Academic Suspension
15. Transcript officially issued to Mississippi Board of Nursing
16. Cumulative GPA meets minimum standard (2.0 undergraduate, 3.0 graduate)
17. Credential type matches program (Career Certificate for LPN, Associate Degree for ADN, etc.)
18. Fraud pattern detection — flags perfect 4.0 across many courses, all-identical grades, unexplained credit discrepancies

Each rule returns: `ruleId`, `status` (PASS / FLAG / UNABLE_TO_DETERMINE), `explanation`, `sourceSection`, `confidence` (HIGH / MEDIUM / LOW).

## AI Models

| Model | Use | Reason |
|-------|-----|--------|
| Nova Pro | Structured data extraction, holistic fraud analysis | High accuracy required — extraction errors propagate through all 18 rules |
| Nova Lite | Verification report generation | Fast and cost-effective for structured JSON assembly |

All AI outputs include source citations and plain-language explanations. No AI output results in an automated decision.

## Data Flow

```
1. User uploads PDF via browser
2. Browser PUTs file to presigned S3 URL
3. Frontend calls POST /transcripts/{id}/verify
4. Upload Lambda starts Step Functions Express workflow
5. Extract Lambda:
   a. Calls Textract async (polls until complete)
   b. Sends OCR text to Nova Pro
   c. Saves structured JSON to S3
6. Verify Lambda:
   a. Loads extraction from S3
   b. Runs 18 deterministic rules
   c. Calls Nova Pro for holistic analysis
   d. Saves verification result to DynamoDB + S3
7. Report Lambda:
   a. Assembles final report
   b. Saves to S3
   c. Updates transcript status → COMPLETE
8. Staff reviews findings in the UI
9. Staff submits decision → Review Lambda records it
10. All actions logged to Audit table
```

## Security Notes (PoC Scope)

- All S3 objects are private; access is via presigned URLs or Lambda IAM roles only
- API Gateway has no authentication in this PoC (out of scope for prototype)
- IAM roles follow least-privilege per Lambda function
- No real applicant PII is processed or stored
- CloudFront serves the frontend over HTTPS
