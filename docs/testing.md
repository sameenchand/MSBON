# Testing

## Local Testing (Mock API)

The fastest way to validate the UI and workflows is against the mock API server, which requires no AWS credentials.

```bash
cd frontend
npm install
npm run dev:full
```

Open **http://localhost:3000**.

The mock server pre-loads five sample transcripts:

| Scenario | Status | UI Label | Description |
|----------|--------|----------|-------------|
| Clean transcript | COMPLETE | Pending Review | All 18 rules pass, no flags |
| Flagged transcript | REVIEW_REQUIRED | Review Required | Missing required courses flagged |
| High-risk transcript | REVIEW_REQUIRED | Review Required | Multiple fraud indicators flagged |
| Approved transcript | APPROVED | Approved | Human reviewer approved |
| In-progress transcript | EXTRACTING | Extracting… | Pipeline still running |

### UI Scenarios to Verify

- [ ] Dashboard loads and displays all 5 sample transcripts with correct status badges
- [ ] Clicking a transcript navigates to Verification Detail
- [ ] Verification Detail shows rule results (PASS/FLAG/UNABLE_TO_DETERMINE) with explanations
- [ ] AI analysis summary is displayed
- [ ] "Start Review" button navigates to the Review page
- [ ] Review page allows submitting a decision (Agree with AI Findings, Submit Overrides, Save Notes Only)
- [ ] Audit Log page loads and shows all events for a transcript
- [ ] Upload page accepts a PDF file
- [ ] Clicking the header logo/title navigates to the dashboard

## Backend Unit Tests

```bash
cd tests
pip install pytest boto3 moto
pytest
```

Test coverage includes rule engine logic (all 18 rules), extraction parsing, and model utilities.

## End-to-End Testing (AWS Required)

These steps validate the full pipeline against a deployed AWS environment.

### Prerequisites

- Stacks deployed (see [setup.md](setup.md))
- Frontend built with `VITE_API_URL` set
- A test nursing transcript PDF (synthetic/anonymized — no real PII)

### Pipeline Validation Steps

**1. Upload a transcript**
- Navigate to the Upload page
- Select a multi-page nursing transcript PDF
- Submit the upload
- Confirm the dashboard shows the transcript with status `UPLOADED` → `EXTRACTING` → `VERIFYING` → `REPORTING` → `COMPLETE` (displayed as "Pending Review")

**2. Verify extraction results**
- Open the Verification Detail page for the uploaded transcript
- Confirm extracted fields are present: courses, GPA, graduation date, institution name
- If any field shows "Unable to determine," check that the PDF is text-selectable (not a scanned image)

**3. Check rule results**
- Verify all 18 rules appear in the results
- A transcript with a missing required course should produce a FLAG result for the relevant rule
- A transcript from an unapproved institution should produce a FLAG on the accreditation rule

**4. Review AI analysis**
- Confirm the Nova Pro summary appears and is coherent
- Verify source citations reference actual transcript sections

**5. Human review flow**
- Click "Start Review"
- In the Review workspace, choose one of:
  - **Agree with AI Findings** (CONFIRM) — accepts all AI results as-is
  - **Submit Overrides** (OVERRIDE) — changes the status of one or more rules via the dropdowns; enter a justification in Reviewer Notes
  - **Save Notes Only** (ANNOTATE) — saves a comment without changing findings
- Confirm the transcript status updates to "Reviewed" in the dashboard
- Confirm flag/undetermined counts in the dashboard reflect any overrides
- Confirm the decision appears in the audit log

**6. Audit log**
- Open the Audit Log for the transcript
- Confirm entries exist for: upload, extraction complete, verification complete, human review
- Entries are displayed newest-first
- Expand "View details" on any entry to see human-readable key-value pairs (not raw JSON)

### Failure Scenarios to Test

- Upload a scanned-image PDF (no selectable text): pipeline should fail at extraction with a descriptive error, not crash silently
- Upload a non-PDF file: the Upload page should reject it before submission
- Refresh the page mid-pipeline: status should reflect the current pipeline state

## Known Limitations During Testing

See [limitations.md](limitations.md) for a full list. Key points relevant to testing:

- Textract async jobs can take 1–3 minutes for multi-page PDFs; the pipeline status will show `EXTRACTING` during this time
- Nova Pro input is capped at 20,000 characters; extremely long or dense transcripts may have later pages truncated before extraction
- The mock server does not simulate pipeline failures or timeouts
