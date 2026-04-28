# Data Notes

## What Data This Repository Contains

This repository contains **no real applicant data**.

- All test transcripts used during development were synthetic or anonymized
- No personally identifiable information (PII) from actual nursing license applicants is present
- No real names, Social Security numbers, dates of birth, or student IDs are included

## What Data the System Processes (When Deployed)

When deployed in a test environment, the system is designed to process only:
- Synthetic PDF transcripts created for testing purposes
- Anonymized or de-identified transcripts with all PII removed

**The system is not validated for use with real applicant data.** It is a Proof of Concept prototype.

## Reference Data Included

The `backend/rules/` directory contains reference data used by the verification rule engine:

- `approved_schools.json` — A list of nursing programs considered for accreditation checks. This list is representative and not exhaustive. It is based on publicly available information about accredited nursing programs and does not contain PII.
- `required_courses.json` — Minimum required nursing course categories by program type (ADN, BSN, MSN, LPN), based on general nursing education standards.
- `fraud_indicators.json` — Patterns associated with transcript anomalies, based on publicly reported information about nursing credential fraud cases (e.g., Operation Nightingale).

This reference data is illustrative for PoC purposes and should not be treated as authoritative for production licensing decisions.

## Data Excluded from This Repository

The following are excluded via `.gitignore` and are not present in any commit:

- `reference files/` — Internal project documents, PDFs, and reference materials used during development
- `.env` / `.env.local` — Environment-specific configuration (API endpoints, AWS resource names)
- `cdk-outputs*.json` — CDK deployment outputs containing live AWS account IDs and resource ARNs
- `DEPLOYMENT.md` — Internal deployment guide with account-specific configuration

## Data Governance Principles Applied

1. **Minimum data collection** — The system extracts only what is needed for the 18 verification rules
2. **Audit trail** — Every action on a transcript is logged with actor, action, and timestamp
3. **No automated decisions** — Extracted data informs human review; it does not drive automated licensing outcomes
4. **No external transmission** — In this PoC, extracted data stays within the AWS account and is never sent to external systems (NURSYS, NCSBN, schools, etc.)
5. **Prototype scope** — All data used is synthetic/anonymized; no production citizen data integration exists

## For Production Consideration

Before any production deployment, the following data governance steps would be required (out of scope for this PoC):
- Data Processing Agreement with MSBN
- Privacy Impact Assessment
- FERPA compliance review (for student transcript data)
- Retention and deletion policies
- Access control and role-based authorization
- Integration security review for any external data connections
