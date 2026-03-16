# MSBON Transcript Verification POC

AI-assisted transcript verification system for the **Mississippi State Board of Nursing (MSBN)**. Built as a proof-of-concept for the MS AI Innovation Hub.

This system helps MSBN staff verify nursing school transcripts for licensure applicants by combining deterministic rule-based checks with AI-powered analysis to detect fraud, verify program completion, and flag anomalies — while keeping humans in the loop for all decisions.

## Architecture

```
┌─────────────────────────────────┐
│   React SPA (S3 + CloudFront)   │
│   Upload → Review → Audit       │
└──────────────┬──────────────────┘
               │
┌──────────────▼──────────────────┐
│   API Gateway (HTTP API)         │
│   /transcripts  /reviews  /audit │
└──────────────┬──────────────────┘
               │
┌──────────────▼──────────────────┐
│   Step Functions Workflow        │
│   Extract → Verify → Report     │
└──┬───────────┬──────────┬───────┘
   │           │          │
   ▼           ▼          ▼
Textract    Bedrock     Bedrock
+ Nova      Nova Pro    Nova Lite
  Lite      (verify)    (report)
(extract)
```

**Key principle:** Advisory outputs only. The system never approves or denies — it surfaces findings for human review.

## How It Works

1. **Upload** — Staff uploads a transcript PDF
2. **Extract** — Amazon Textract + Bedrock Nova Lite parse the PDF into structured data (courses, grades, dates, GPA)
3. **Verify** — Two-layer verification:
   - **13 deterministic rules** check graduation, program hours, required courses, accreditation, and fraud indicators
   - **Bedrock Nova Pro** performs holistic AI analysis for patterns rules can't catch
4. **Report** — Findings are compiled into a structured report
5. **Review** — Staff reviews flags, confirms or overrides findings, adds notes
6. **Audit** — Every action is logged to an immutable audit trail

### Verification Rules

| Category | Rules |
|----------|-------|
| **Graduation** | Degree conferral confirmed, graduation date present |
| **Program Completion** | Credit hours met, required courses present, passing grades, clinical hours |
| **Accreditation** | School on approved list, valid accreditation type (ACEN/CCNE) |
| **Fraud Indicators** | Compressed timeline, enrollment gaps, excessive transfers, GPA mismatch, duplicate courses |

### Safety Override

If the AI recommends APPROVE but 3+ rules are flagged, the system automatically escalates to REVIEW_REQUIRED. The AI never gets the final say.

## Tech Stack

| Layer | Technology |
|-------|-----------|
| **Frontend** | React 18, TypeScript, Vite, TailwindCSS |
| **API** | API Gateway (HTTP API) |
| **Compute** | AWS Lambda (Python 3.11) |
| **Workflow** | AWS Step Functions (Express) |
| **AI/ML** | Amazon Bedrock (Nova Lite, Nova Pro), Amazon Textract |
| **Storage** | S3 (transcripts), DynamoDB (metadata, verifications, reviews, audit) |
| **Infrastructure** | AWS CDK (Python) |
| **Hosting** | S3 + CloudFront |

## Project Structure

```
MSBON/
├── backend/
│   ├── lambdas/
│   │   ├── upload/          # Transcript upload + presigned URLs
│   │   ├── extract/         # Textract + Nova Lite extraction
│   │   ├── verify/          # Rules engine + Nova Pro analysis
│   │   ├── report/          # Report generation
│   │   ├── review/          # Human review actions
│   │   └── audit/           # Audit trail queries
│   ├── shared/              # Lambda layer (models, DB, S3, Bedrock helpers)
│   └── rules/               # Verification data (approved schools, requirements)
├── frontend/
│   ├── src/
│   │   ├── pages/           # Dashboard, Upload, VerificationDetail, Review, AuditLog
│   │   ├── components/      # FlagCard, StatusBadge, RuleExplanation, TranscriptViewer
│   │   ├── services/        # API client
│   │   └── types/           # TypeScript interfaces
│   └── mock-server.cjs      # Mock API for local development
└── infrastructure/
    └── stacks/              # CDK stacks (storage, API, verification, frontend)
```

## Local Development

Run the frontend locally with mock data (no AWS required):

```bash
# Install dependencies
cd frontend
npm install

# Option 1: Run both servers at once
npm run dev:full

# Option 2: Run separately
npm run mock-api    # Terminal 1 — Mock API on :3001
npm run dev         # Terminal 2 — Frontend on :3000
```

Open **http://localhost:3000** to see the dashboard with 5 sample transcripts covering different scenarios:
- Clean transcript (all rules pass, LOW risk)
- Moderate flags (missing course, compressed timeline, MEDIUM risk)
- High-risk fraud indicators (unrecognized school, GPA mismatch, HIGH risk)
- Approved transcript (reviewed by staff)
- In-progress extraction

## AWS Deployment

### Prerequisites

- AWS CLI configured with credentials (`aws configure`)
- AWS CDK CLI installed (`npm install -g aws-cdk`)
- Python 3.11+
- Bedrock model access enabled for Nova Lite and Nova Pro in us-east-1

### Deploy

```bash
cd infrastructure
python -m venv .venv
source .venv/bin/activate
pip install -r requirements.txt

# First time only
cdk bootstrap

# Deploy all stacks
cdk deploy --all
```

### Deploy Frontend

```bash
cd frontend
npm run build
aws s3 sync dist/ s3://<frontend-bucket-from-cdk-output>
```

### Estimated Cost

| Service | Estimated Monthly Cost |
|---------|----------------------|
| Lambda, API Gateway, Step Functions | ~$5-10 |
| DynamoDB (on-demand) | ~$2-5 |
| S3 + CloudFront | ~$2-3 |
| Textract | ~$1.50/1000 pages |
| Bedrock (Nova Lite + Pro) | ~$5-20 (usage dependent) |
| **Total** | **~$20-50 for POC usage** |

## Data Governance

- All test data is anonymized — no real PII or citizen data
- Transcripts used for development are de-identified
- System produces advisory outputs only; no automated approvals
- Full audit trail for every action

## License

This project is open source, built for the MS AI Innovation Hub.
