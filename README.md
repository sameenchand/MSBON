# MSBON Transcript Verification

> Mississippi AI Innovation Hub — Proof of Concept

## Overview

This repository contains the code and documentation for a Mississippi AI Innovation Hub Proof of Concept focused on nursing transcript verification. The PoC was developed to explore whether AI-assisted document processing could help the Mississippi State Board of Nursing (MSBN) by standardizing transcript review, detecting fraud indicators, and surfacing anomalies — while keeping staff in the loop for every decision.

The project demonstrates feasibility within a limited prototype environment and is not a production-ready solution.

## Agency Problem

MSBN is legally responsible for verifying that nursing school transcripts submitted for licensure meet Mississippi's academic requirements. This review is currently manual, inconsistent across reviewers, and vulnerable to fraudulent credentials — an ongoing national concern highlighted by federal investigations such as Operation Nightingale, which uncovered fraudulent nursing credentials at scale.

The PoC explores how AI can **augment** — not replace — staff review by:
- Standardizing what gets checked on every transcript
- Flagging anomalies and fraud indicators automatically
- Producing auditable, explainable outputs for every decision

## PoC Scope and Demonstrated Capabilities

This PoC covers:
- PDF transcript upload and secure storage
- OCR text extraction via Amazon Textract (with TABLES and FORMS analysis for structured column data)
- Structured data extraction via Amazon Bedrock Nova Pro (16 fields including academic standing, credential type, enrollment timeline, and per-course repeat indicators)
- 18 deterministic verification rules across graduation, program completion, accreditation, and fraud indicators
- Holistic AI fraud analysis via Amazon Bedrock Nova Pro
- Human review and annotation workflow
- Immutable audit trail for every action

**Applicant types in scope:** First-time licensure applicants and endorsement applicants.

**Out of scope:** Automated licensing decisions, real applicant data, integration with external systems (NURSYS, NCSBN, schools), international transcripts, predictive risk scoring, or any replacement of human judgment.

## Architecture Overview

![Architecture Overview](docs/images/architecture-overview.png?v=4)

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
  Pro       (verify)    (report)
(extract)
```

**Key principle:** Advisory outputs only. The system never approves or denies a license — it surfaces findings for human review.

See [docs/architecture.md](docs/architecture.md) for a full description of each component.

## Repository Structure

```
MSBON/
├── README.md
├── LICENSE
├── .gitignore
├── .env.example
├── CHANGELOG.md
├── docs/
│   ├── architecture.md      # Component descriptions and data flow
│   ├── setup.md             # Step-by-step deployment guide
│   ├── testing.md           # Validation steps and test scenarios
│   ├── data-notes.md        # Data used, excluded, and governance notes
│   └── limitations.md       # What the PoC does not do
├── backend/
│   ├── lambdas/
│   │   ├── upload/          # Transcript upload + presigned URL generation
│   │   ├── extract/         # Textract OCR + Nova Pro structured extraction
│   │   ├── verify/          # Rules engine + Nova Pro AI analysis
│   │   ├── report/          # Verification report generation
│   │   ├── review/          # Human review actions
│   │   └── audit/           # Audit trail queries
│   ├── shared/              # Lambda layer: models, DB, S3, Bedrock helpers
│   └── rules/               # Verification data (approved schools, requirements)
├── frontend/
│   ├── src/
│   │   ├── pages/           # Dashboard, Upload, VerificationDetail, Review, AuditLog
│   │   ├── components/      # FlagCard, StatusBadge, RuleExplanation, TranscriptViewer
│   │   ├── services/        # API client
│   │   └── types/           # TypeScript interfaces
│   └── mock-server.cjs      # Local development mock API
├── infrastructure/
│   └── stacks/              # CDK stacks: storage, verification pipeline, API, frontend
└── tests/                   # Test suite
```

## Setup

See [docs/setup.md](docs/setup.md) for full deployment instructions.

**Quick start (local development, no AWS required):**

```bash
cd frontend
npm install
npm run dev:full        # Starts mock API on :3001 and frontend on :3000
```

Open **http://localhost:3000** — the dashboard loads with 5 sample transcripts covering clean, flagged, high-risk, approved, and in-progress scenarios.

**AWS deployment prerequisites:**
- AWS CLI configured with appropriate credentials
- AWS CDK CLI (`npm install -g aws-cdk`)
- Python 3.11+
- Amazon Bedrock Nova Lite and Nova Pro enabled in `us-east-1`
- Amazon Textract access enabled in `us-east-1`

## Configuration

Copy `.env.example` to `.env.local` and fill in the values after deploying the CDK stacks:

```bash
cp .env.example .env.local
```

Key variable:
```
VITE_API_URL=https://<your-api-id>.execute-api.us-east-1.amazonaws.com
```

All Lambda environment variables (DynamoDB table names, S3 bucket, Step Functions ARN) are injected automatically by CDK at deploy time.

## Data Notes

See [docs/data-notes.md](docs/data-notes.md) for full details.

This repository does not include real applicant data. Any data used during development was anonymized or synthetic. Test transcripts are not included in this public repository.

## Usage

1. Upload a transcript PDF via the **Upload** page
2. The pipeline runs automatically: Textract OCR → Nova Pro extraction → 18-rule engine → Nova Pro AI analysis
3. View flagged items, AI analysis summary, and rule-by-rule results on the **Verification Detail** page
4. Staff review and annotate findings via the **Review** page
5. All actions are recorded in the **Audit Log**

## Testing and Evaluation

See [docs/testing.md](docs/testing.md) for step-by-step validation instructions.

Key scenarios to test:
- Upload a multi-page nursing transcript PDF → verify extraction and rule results appear
- Check that a transcript with missing required courses is flagged
- Confirm that the audit log records all actions
- Verify the "Start Review" flow saves a human decision with a timestamp

## Limitations

See [docs/limitations.md](docs/limitations.md) for a full list.

This PoC was developed within a limited timeline and controlled environment. It contains simplified workflows, prototype UI, and is not validated for production use. Key limitations include no real applicant data integration, no external system connections, and no production security hardening.

## Disclaimer

This repository contains code and supporting materials developed as part of a Mississippi Artificial Intelligence Innovation Hub Proof of Concept project. The contents are provided for prototype demonstration purposes only. They are not production-ready and may include simplified workflows, incomplete security guardrails, placeholder integrations, or reduced controls appropriate only for a Proof-of-Concept environment. All outputs are advisory only and require human review before any action is taken.

## License

This project is licensed under the MIT License. See [LICENSE](LICENSE) for details.

## Contributors

Developed as part of the **Mississippi AI Innovation Hub** — a partnership between the Mississippi Department of Information Technology Services (MS ITS), the Mississippi Artificial Intelligence Network (MAIN), and Amazon Web Services (AWS).

- **Agency Partner:** Mississippi State Board of Nursing (MSBN)
- **Student Team / Institution:** Sameen Chand, Pramish Pandey — University of Southern Mississippi
- **Faculty Advisor / Mentor:** Brycie Wiseman
- **Repository:** https://github.com/sameenchand/MSBON
