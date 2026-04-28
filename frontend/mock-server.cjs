/**
 * MSBON Mock API Server
 * Serves realistic sample data so the frontend can run locally without AWS.
 * Run: node mock-server.cjs
 */
const express = require('express');
const cors = require('cors');
const crypto = require('crypto');

const app = express();
app.use(cors());
app.use(express.json());

// ---------------------------------------------------------------------------
// In-memory data stores
// ---------------------------------------------------------------------------

const transcripts = new Map();
const verifications = new Map();
const reviews = new Map();
const auditEntries = new Map();

// ---------------------------------------------------------------------------
// Seed realistic sample data
// ---------------------------------------------------------------------------

function uuid() {
  return crypto.randomUUID();
}

const now = new Date().toISOString();
const yesterday = new Date(Date.now() - 86400000).toISOString();
const twoDaysAgo = new Date(Date.now() - 172800000).toISOString();
const threeDaysAgo = new Date(Date.now() - 259200000).toISOString();

// Transcript 1 — Clean, passes all checks
const t1Id = uuid();
transcripts.set(t1Id, {
  transcriptId: t1Id,
  applicantId: 'ANON-2024-001',
  uploadDate: threeDaysAgo,
  status: 'VERIFIED',
  schoolName: 'Hinds Community College',
  programType: 'ADN',
  fileName: 'hinds_cc_transcript_001.pdf',
  s3Key: `raw/${t1Id}.pdf`,
  extractedDataKey: `extracted/${t1Id}.json`,
});

verifications.set(t1Id, [{
  verificationId: uuid(),
  transcriptId: t1Id,
  overallStatus: 'CLEAR',
  riskLevel: 'LOW',
  ruleResults: [
    { ruleId: 'check_graduation_confirmed', status: 'PASS', explanation: 'Degree conferral statement found: Associate Degree in Nursing conferred on 05/15/2024.', sourceSection: 'Page 1, Degrees Awarded', confidence: 'HIGH' },
    { ruleId: 'check_graduation_date_present', status: 'PASS', explanation: 'Graduation date clearly stated: May 15, 2024.', sourceSection: 'Page 1, Degrees Awarded', confidence: 'HIGH' },
    { ruleId: 'check_program_hours_met', status: 'PASS', explanation: 'Total program hours: 72 credit hours. ADN minimum requirement: 60 hours. Requirement met.', sourceSection: 'Page 2, Academic Summary', confidence: 'HIGH' },
    { ruleId: 'check_required_courses_present', status: 'PASS', explanation: 'All required nursing courses identified: Fundamentals, Med-Surg I & II, Pediatrics, OB, Mental Health, Pharmacology.', sourceSection: 'Pages 1-3, Course History', confidence: 'HIGH' },
    { ruleId: 'check_passing_grades', status: 'PASS', explanation: 'All nursing courses have passing grades (C or above). Lowest grade: C in NUR 2113 Pharmacology.', sourceSection: 'Pages 1-3, Course History', confidence: 'HIGH' },
    { ruleId: 'check_clinical_hours_present', status: 'PASS', explanation: 'Clinical practicum courses identified: NUR 1144 Clinical I (4 cr), NUR 2244 Clinical II (4 cr), NUR 2344 Clinical III (4 cr).', sourceSection: 'Pages 2-3, Course History', confidence: 'HIGH' },
    { ruleId: 'check_school_accredited', status: 'PASS', explanation: 'Hinds Community College is on the MSBON approved schools list.', sourceSection: 'Transcript Header', confidence: 'HIGH' },
    { ruleId: 'check_accreditation_type', status: 'PASS', explanation: 'Program accredited by ACEN (Accreditation Commission for Education in Nursing).', sourceSection: 'Transcript Header', confidence: 'HIGH' },
    { ruleId: 'check_compressed_timeline', status: 'PASS', explanation: 'Program completed over 5 semesters (Fall 2022 - Spring 2024). Normal timeline for ADN.', sourceSection: 'Course History dates', confidence: 'HIGH' },
    { ruleId: 'check_consistent_enrollment', status: 'PASS', explanation: 'Consistent enrollment across all semesters with no unexplained gaps.', sourceSection: 'Term enrollment records', confidence: 'HIGH' },
    { ruleId: 'check_transfer_credits_reasonable', status: 'PASS', explanation: '12 transfer credits from general education prerequisites. Within normal range.', sourceSection: 'Transfer Credits section', confidence: 'HIGH' },
    { ruleId: 'check_gpa_consistency', status: 'PASS', explanation: 'Reported cumulative GPA 3.21 matches calculated GPA from course grades (3.19). Difference within acceptable margin.', sourceSection: 'Academic Summary', confidence: 'MEDIUM' },
    { ruleId: 'check_duplicate_courses', status: 'PASS', explanation: 'No duplicate course entries found.', sourceSection: 'Full course history', confidence: 'HIGH' },
    { ruleId: 'check_academic_standing', status: 'PASS', explanation: 'Academic standing satisfactory across all 5 recorded terms. No probation or suspension found.', sourceSection: 'academic_standing_per_term', confidence: 'HIGH' },
    { ruleId: 'check_issued_to_msbn', status: 'PASS', explanation: "Transcript officially issued to: 'Mississippi Board of Nursing'. Matches Mississippi Board of Nursing.", sourceSection: 'document_issued_to', confidence: 'HIGH' },
    { ruleId: 'check_gpa_minimum', status: 'PASS', explanation: 'Cumulative GPA of 3.210 meets the 2.0 minimum nursing program standard.', sourceSection: 'gpa', confidence: 'HIGH' },
    { ruleId: 'check_credential_type_valid', status: 'PASS', explanation: "Credential 'Associate of Applied Science in Nursing' is consistent with an ADN program.", sourceSection: 'credential_type', confidence: 'HIGH' },
    { ruleId: 'check_fraud_indicators', status: 'PASS', explanation: 'No statistical fraud indicators detected (GPA distribution, grade uniformity, credit hour consistency).', sourceSection: 'courses / gpa', confidence: 'MEDIUM' },
  ],
  aiAnalysis: {
    summary: 'This transcript from Hinds Community College shows a well-documented ADN program completion. The applicant completed 72 credit hours over a standard 5-semester timeline with consistent enrollment. All required nursing courses are present with passing grades. The institution is ACEN-accredited and on the MSBON approved list. No anomalies or fraud indicators detected.',
    additionalFlags: [],
    recommendation: 'APPROVE - This transcript meets all MSBON requirements for ADN licensure eligibility.',
    reasoning: 'All 18 verification rules passed. The timeline is consistent with a standard 2-year ADN program. Course sequence follows the expected progression. GPA calculation aligns with reported values. No transfer credit anomalies. The institution has a well-established nursing program with proper accreditation.',
  },
  sourceCitations: ['Page 1: Degree conferral statement', 'Pages 1-3: Complete course history', 'Academic Summary: GPA and credit totals'],
  rulesApplied: ['check_graduation_confirmed', 'check_graduation_date_present', 'check_program_hours_met', 'check_required_courses_present', 'check_passing_grades', 'check_clinical_hours_present', 'check_school_accredited', 'check_accreditation_type', 'check_compressed_timeline', 'check_consistent_enrollment', 'check_transfer_credits_reasonable', 'check_gpa_consistency', 'check_duplicate_courses', 'check_academic_standing', 'check_issued_to_msbn', 'check_gpa_minimum', 'check_credential_type_valid', 'check_fraud_indicators'],
  createdAt: threeDaysAgo,
}]);

// Transcript 2 — Flags found, needs review
const t2Id = uuid();
transcripts.set(t2Id, {
  transcriptId: t2Id,
  applicantId: 'ANON-2024-002',
  uploadDate: twoDaysAgo,
  status: 'REVIEW_REQUIRED',
  schoolName: 'Mississippi Delta Community College',
  programType: 'LPN',
  fileName: 'ms_delta_cc_transcript_002.pdf',
  s3Key: `raw/${t2Id}.pdf`,
  extractedDataKey: `extracted/${t2Id}.json`,
});

verifications.set(t2Id, [{
  verificationId: uuid(),
  transcriptId: t2Id,
  overallStatus: 'FLAGS_FOUND',
  riskLevel: 'MEDIUM',
  ruleResults: [
    { ruleId: 'check_graduation_confirmed', status: 'PASS', explanation: 'Practical Nursing Certificate conferred on 12/11/2025.', sourceSection: 'Page 1, Degrees Earned', confidence: 'HIGH' },
    { ruleId: 'check_graduation_date_present', status: 'PASS', explanation: 'Graduation date present: December 11, 2025.', sourceSection: 'Page 1, Degrees Earned', confidence: 'HIGH' },
    { ruleId: 'check_program_hours_met', status: 'PASS', explanation: 'Total program hours: 48 credit hours. LPN minimum requirement: 40 hours. Requirement met.', sourceSection: 'Page 2, Academic Summary', confidence: 'HIGH' },
    { ruleId: 'check_required_courses_present', status: 'FLAG', explanation: 'Missing required course: PNV 1723 Mental Health Nursing. This course is typically required for LPN programs in Mississippi.', sourceSection: 'Pages 1-2, Course History', confidence: 'MEDIUM' },
    { ruleId: 'check_passing_grades', status: 'PASS', explanation: 'All present nursing courses have passing grades.', sourceSection: 'Pages 1-2, Course History', confidence: 'HIGH' },
    { ruleId: 'check_clinical_hours_present', status: 'PASS', explanation: 'Clinical practicum courses identified: PNV 1814 Clinical I, PNV 1824 Clinical II.', sourceSection: 'Pages 1-2, Course History', confidence: 'HIGH' },
    { ruleId: 'check_school_accredited', status: 'PASS', explanation: 'Mississippi Delta Community College is on the MSBON approved schools list.', sourceSection: 'Transcript Header', confidence: 'HIGH' },
    { ruleId: 'check_accreditation_type', status: 'PASS', explanation: 'Program accredited by ACEN.', sourceSection: 'Transcript Header', confidence: 'HIGH' },
    { ruleId: 'check_compressed_timeline', status: 'FLAG', explanation: 'Program completed in 2 semesters (Fall 2025 - Dec 2025). Typical LPN programs take 3-4 semesters. Timeline appears compressed.', sourceSection: 'Course History dates', confidence: 'MEDIUM' },
    { ruleId: 'check_consistent_enrollment', status: 'PASS', explanation: 'Enrollment consistent within the compressed timeframe.', sourceSection: 'Term enrollment records', confidence: 'MEDIUM' },
    { ruleId: 'check_transfer_credits_reasonable', status: 'FLAG', explanation: '24 transfer credits from an unrecognized institution: "National Health Academy". Transfer volume is high relative to program length.', sourceSection: 'Transfer Credits section', confidence: 'LOW' },
    { ruleId: 'check_gpa_consistency', status: 'PASS', explanation: 'Reported GPA 3.45 matches calculated GPA.', sourceSection: 'Academic Summary', confidence: 'HIGH' },
    { ruleId: 'check_duplicate_courses', status: 'PASS', explanation: 'No duplicate course entries found.', sourceSection: 'Full course history', confidence: 'HIGH' },
    { ruleId: 'check_academic_standing', status: 'PASS', explanation: 'Academic standing satisfactory across all recorded terms. No probation or suspension found.', sourceSection: 'academic_standing_per_term', confidence: 'HIGH' },
    { ruleId: 'check_issued_to_msbn', status: 'UNABLE_TO_DETERMINE', explanation: 'Could not determine who the transcript was issued to. Confirm the transcript was officially requested by MSBN.', sourceSection: 'document_issued_to', confidence: 'LOW' },
    { ruleId: 'check_gpa_minimum', status: 'PASS', explanation: 'Cumulative GPA of 3.450 meets the 2.0 minimum nursing program standard.', sourceSection: 'gpa', confidence: 'HIGH' },
    { ruleId: 'check_credential_type_valid', status: 'PASS', explanation: "Credential 'Career Certificate' is consistent with an LPN program.", sourceSection: 'credential_type', confidence: 'HIGH' },
    { ruleId: 'check_fraud_indicators', status: 'PASS', explanation: 'No statistical fraud indicators detected.', sourceSection: 'courses / gpa', confidence: 'MEDIUM' },
  ],
  aiAnalysis: {
    summary: 'This LPN transcript from Mississippi Delta Community College raises several concerns. While the institution itself is approved and accredited, the program was completed in an unusually short timeframe (2 semesters vs. typical 3-4). Additionally, a required mental health nursing course appears to be missing, and there are 24 transfer credits from "National Health Academy" which is not a recognized institution. These factors combined warrant human review.',
    additionalFlags: [
      { issue: 'Unrecognized transfer institution', details: '"National Health Academy" not found in any recognized accreditation database.', severity: 'HIGH' },
      { issue: 'High transfer credit ratio', details: '24 transfer credits vs 24 direct credits is unusual for LPN programs.', severity: 'MEDIUM' },
    ],
    recommendation: 'REVIEW - Multiple flags detected that require human verification before proceeding.',
    reasoning: 'Three deterministic rules flagged issues: missing required course, compressed timeline, and questionable transfer credits. The combination of these flags, particularly the unrecognized transfer institution, elevates the risk level. While each flag individually might have a reasonable explanation, the pattern warrants careful review by MSBON staff.',
  },
  sourceCitations: ['Page 1: Degree conferral', 'Pages 1-2: Course history with timeline', 'Transfer Credits: National Health Academy entries'],
  rulesApplied: ['check_graduation_confirmed', 'check_graduation_date_present', 'check_program_hours_met', 'check_required_courses_present', 'check_passing_grades', 'check_clinical_hours_present', 'check_school_accredited', 'check_accreditation_type', 'check_compressed_timeline', 'check_consistent_enrollment', 'check_transfer_credits_reasonable', 'check_gpa_consistency', 'check_duplicate_courses', 'check_academic_standing', 'check_issued_to_msbn', 'check_gpa_minimum', 'check_credential_type_valid', 'check_fraud_indicators'],
  createdAt: twoDaysAgo,
}]);

// Transcript 3 — High risk, many flags
const t3Id = uuid();
transcripts.set(t3Id, {
  transcriptId: t3Id,
  applicantId: 'ANON-2024-003',
  uploadDate: yesterday,
  status: 'REVIEW_REQUIRED',
  schoolName: 'Southern Regional Technical College',
  programType: 'BSN',
  fileName: 'southern_regional_transcript_003.pdf',
  s3Key: `raw/${t3Id}.pdf`,
  extractedDataKey: `extracted/${t3Id}.json`,
});

verifications.set(t3Id, [{
  verificationId: uuid(),
  transcriptId: t3Id,
  overallStatus: 'REVIEW_REQUIRED',
  riskLevel: 'HIGH',
  ruleResults: [
    { ruleId: 'check_graduation_confirmed', status: 'PASS', explanation: 'BSN degree conferral statement present dated 08/20/2024.', sourceSection: 'Page 1, Degrees Awarded', confidence: 'MEDIUM' },
    { ruleId: 'check_graduation_date_present', status: 'PASS', explanation: 'Graduation date: August 20, 2024.', sourceSection: 'Page 1, Degrees Awarded', confidence: 'MEDIUM' },
    { ruleId: 'check_program_hours_met', status: 'FLAG', explanation: 'Total program hours: 98 credit hours. BSN minimum requirement: 120 hours. Requirement NOT met. Missing 22 credit hours.', sourceSection: 'Page 3, Academic Summary', confidence: 'HIGH' },
    { ruleId: 'check_required_courses_present', status: 'FLAG', explanation: 'Missing multiple required courses: Community Health Nursing, Nursing Research, Nursing Leadership/Management.', sourceSection: 'Pages 1-3, Course History', confidence: 'HIGH' },
    { ruleId: 'check_passing_grades', status: 'FLAG', explanation: 'Failing grade found: F in NUR 3203 Pathophysiology. Course does not appear to have been retaken.', sourceSection: 'Page 2, Course History', confidence: 'HIGH' },
    { ruleId: 'check_clinical_hours_present', status: 'FLAG', explanation: 'Only 2 clinical practicum courses found. BSN programs typically require 4-6 clinical courses.', sourceSection: 'Pages 1-3, Course History', confidence: 'MEDIUM' },
    { ruleId: 'check_school_accredited', status: 'FLAG', explanation: '"Southern Regional Technical College" is NOT on the MSBON approved schools list. Institution could not be verified.', sourceSection: 'Transcript Header', confidence: 'HIGH' },
    { ruleId: 'check_accreditation_type', status: 'UNABLE_TO_DETERMINE', explanation: 'No accreditation information found on transcript. Could not verify ACEN or CCNE accreditation.', sourceSection: 'Transcript Header', confidence: 'LOW' },
    { ruleId: 'check_compressed_timeline', status: 'FLAG', explanation: 'BSN program completed in 3 semesters (Jan 2024 - Aug 2024). Standard BSN programs require 4 years. Extremely compressed timeline.', sourceSection: 'Course History dates', confidence: 'HIGH' },
    { ruleId: 'check_consistent_enrollment', status: 'FLAG', explanation: 'All courses appear in a single academic year. No evidence of prerequisite completion in prior terms.', sourceSection: 'Term enrollment records', confidence: 'HIGH' },
    { ruleId: 'check_transfer_credits_reasonable', status: 'FLAG', explanation: '62 transfer credits from multiple unverified institutions. Extremely high transfer volume.', sourceSection: 'Transfer Credits section', confidence: 'HIGH' },
    { ruleId: 'check_gpa_consistency', status: 'FLAG', explanation: 'Reported GPA 3.78 does not match calculated GPA of 2.41. Significant discrepancy of 1.37 points.', sourceSection: 'Academic Summary', confidence: 'HIGH' },
    { ruleId: 'check_duplicate_courses', status: 'FLAG', explanation: 'Duplicate entries found: NUR 2113 Pharmacology appears twice in same semester with different grades (A and B).', sourceSection: 'Page 2, Course History', confidence: 'HIGH' },
    { ruleId: 'check_academic_standing', status: 'UNABLE_TO_DETERMINE', explanation: 'No per-term academic standing data found in transcript.', sourceSection: 'academic_standing_per_term', confidence: 'LOW' },
    { ruleId: 'check_issued_to_msbn', status: 'FLAG', explanation: "Transcript shows 'Issued To: Applicant Copy' — does not match Mississippi Board of Nursing. Official transcripts must be sent directly from the institution to MSBN.", sourceSection: 'document_issued_to', confidence: 'HIGH' },
    { ruleId: 'check_gpa_minimum', status: 'PASS', explanation: 'Reported GPA of 3.780 meets the 2.0 minimum. Note: GPA consistency rule flagged a 1.37-point discrepancy from calculated GPA — the true GPA may not meet standards.', sourceSection: 'gpa', confidence: 'LOW' },
    { ruleId: 'check_credential_type_valid', status: 'FLAG', explanation: "Credential 'Bachelor of Science in Nursing' from an institution not in the approved school list — cannot verify the credential is legitimately awarded.", sourceSection: 'credential_type', confidence: 'MEDIUM' },
    { ruleId: 'check_fraud_indicators', status: 'FLAG', explanation: 'Duplicate course entries with different grades in the same term, combined with a 1.37-point GPA discrepancy, match known transcript fabrication patterns.', sourceSection: 'courses / gpa / total_credit_hours', confidence: 'HIGH' },
  ],
  aiAnalysis: {
    summary: 'This transcript exhibits multiple serious red flags consistent with known fraud patterns. The institution "Southern Regional Technical College" cannot be verified as an accredited nursing school. The BSN program was purportedly completed in only 3 semesters, which is impossible for a legitimate 4-year program. Credit hours fall significantly short of BSN requirements, there are missing core courses, a failing grade in a required course, and a large GPA discrepancy. The pattern of 62 transfer credits from unverified institutions combined with the compressed timeline closely matches characteristics identified in Operation Nightingale-style fraud schemes.',
    additionalFlags: [
      { issue: 'Institution not in any accreditation database', details: '"Southern Regional Technical College" does not appear in NCSBN or US DOE records for nursing programs.', severity: 'HIGH' },
      { issue: 'Document formatting inconsistencies', details: 'Multiple font styles detected in the transcript — may indicate document manipulation.', severity: 'HIGH' },
      { issue: 'Non-standard course numbering', details: 'Course numbering system does not follow conventions expected for the claimed institution type.', severity: 'MEDIUM' },
      { issue: 'Pattern matches Operation Nightingale fraud indicators', details: 'Combination of compressed timeline, high transfer credits, and unverified institution matches known fraud patterns from federal nursing credential investigations.', severity: 'HIGH' },
    ],
    recommendation: 'REJECT - This transcript exhibits multiple characteristics consistent with fraudulent credentials. Recommend referral for investigation.',
    reasoning: 'Thirteen out of 18 verification rules flagged issues or were unable to determine. The combination of unrecognized institution, impossible timeline, massive GPA discrepancy, duplicate courses, high transfer credit volume from unverified sources, applicant-copy issuance, and fraud pattern indicators creates a pattern highly indicative of fabrication. No legitimate explanation could account for all these anomalies simultaneously. This transcript should be flagged for MSBON enforcement review.',
  },
  sourceCitations: ['Transcript Header: Unrecognized institution', 'Pages 1-3: Compressed timeline evidence', 'Academic Summary: GPA discrepancy', 'Page 2: Duplicate course entries', 'Transfer Credits: 62 hours from unverified sources'],
  rulesApplied: ['check_graduation_confirmed', 'check_graduation_date_present', 'check_program_hours_met', 'check_required_courses_present', 'check_passing_grades', 'check_clinical_hours_present', 'check_school_accredited', 'check_accreditation_type', 'check_compressed_timeline', 'check_consistent_enrollment', 'check_transfer_credits_reasonable', 'check_gpa_consistency', 'check_duplicate_courses', 'check_academic_standing', 'check_issued_to_msbn', 'check_gpa_minimum', 'check_credential_type_valid', 'check_fraud_indicators'],
  createdAt: yesterday,
}]);

// Transcript 4 — Recently uploaded, still processing
const t4Id = uuid();
transcripts.set(t4Id, {
  transcriptId: t4Id,
  applicantId: 'ANON-2024-004',
  uploadDate: now,
  status: 'EXTRACTING',
  schoolName: '',
  programType: '',
  fileName: 'university_of_ms_transcript_004.pdf',
  s3Key: `raw/${t4Id}.pdf`,
  extractedDataKey: '',
});

// Transcript 5 — Reviewed and approved
const t5Id = uuid();
transcripts.set(t5Id, {
  transcriptId: t5Id,
  applicantId: 'ANON-2024-005',
  uploadDate: threeDaysAgo,
  status: 'APPROVED',
  schoolName: 'University of Mississippi Medical Center',
  programType: 'BSN',
  fileName: 'ummc_bsn_transcript_005.pdf',
  s3Key: `raw/${t5Id}.pdf`,
  extractedDataKey: `extracted/${t5Id}.json`,
});

verifications.set(t5Id, [{
  verificationId: uuid(),
  transcriptId: t5Id,
  overallStatus: 'CLEAR',
  riskLevel: 'LOW',
  ruleResults: [
    { ruleId: 'check_graduation_confirmed', status: 'PASS', explanation: 'BSN degree conferred May 2024.', sourceSection: 'Page 1', confidence: 'HIGH' },
    { ruleId: 'check_graduation_date_present', status: 'PASS', explanation: 'Graduation date: May 10, 2024.', sourceSection: 'Page 1', confidence: 'HIGH' },
    { ruleId: 'check_program_hours_met', status: 'PASS', explanation: 'Total hours: 128. BSN requirement: 120. Met.', sourceSection: 'Academic Summary', confidence: 'HIGH' },
    { ruleId: 'check_required_courses_present', status: 'PASS', explanation: 'All required BSN courses present.', sourceSection: 'Course History', confidence: 'HIGH' },
    { ruleId: 'check_passing_grades', status: 'PASS', explanation: 'All nursing courses passed with C or above.', sourceSection: 'Course History', confidence: 'HIGH' },
    { ruleId: 'check_clinical_hours_present', status: 'PASS', explanation: '6 clinical practicum courses found.', sourceSection: 'Course History', confidence: 'HIGH' },
    { ruleId: 'check_school_accredited', status: 'PASS', explanation: 'UMMC is on the MSBON approved list.', sourceSection: 'Header', confidence: 'HIGH' },
    { ruleId: 'check_accreditation_type', status: 'PASS', explanation: 'CCNE accredited.', sourceSection: 'Header', confidence: 'HIGH' },
    { ruleId: 'check_compressed_timeline', status: 'PASS', explanation: 'Completed over 8 semesters. Standard BSN timeline.', sourceSection: 'Course dates', confidence: 'HIGH' },
    { ruleId: 'check_consistent_enrollment', status: 'PASS', explanation: 'Continuous enrollment across all semesters.', sourceSection: 'Enrollment records', confidence: 'HIGH' },
    { ruleId: 'check_transfer_credits_reasonable', status: 'PASS', explanation: 'No transfer credits. All coursework at UMMC.', sourceSection: 'Course History', confidence: 'HIGH' },
    { ruleId: 'check_gpa_consistency', status: 'PASS', explanation: 'Reported GPA 3.67 matches calculated GPA.', sourceSection: 'Academic Summary', confidence: 'HIGH' },
    { ruleId: 'check_duplicate_courses', status: 'PASS', explanation: 'No duplicates found.', sourceSection: 'Course History', confidence: 'HIGH' },
    { ruleId: 'check_academic_standing', status: 'PASS', explanation: 'Academic standing satisfactory across all 8 recorded semesters. No probation or suspension found.', sourceSection: 'academic_standing_per_term', confidence: 'HIGH' },
    { ruleId: 'check_issued_to_msbn', status: 'PASS', explanation: "Transcript officially issued to: 'Mississippi State Board of Nursing'. Matches Mississippi Board of Nursing.", sourceSection: 'document_issued_to', confidence: 'HIGH' },
    { ruleId: 'check_gpa_minimum', status: 'PASS', explanation: 'Cumulative GPA of 3.670 meets the 2.0 minimum nursing program standard.', sourceSection: 'gpa', confidence: 'HIGH' },
    { ruleId: 'check_credential_type_valid', status: 'PASS', explanation: "Credential 'Bachelor of Science in Nursing' is consistent with a BSN program.", sourceSection: 'credential_type', confidence: 'HIGH' },
    { ruleId: 'check_fraud_indicators', status: 'PASS', explanation: 'No statistical fraud indicators detected (GPA distribution, grade uniformity, credit hour consistency).', sourceSection: 'courses / gpa', confidence: 'MEDIUM' },
  ],
  aiAnalysis: {
    summary: 'Exemplary transcript from UMMC BSN program. All requirements met with no anomalies. Standard 4-year completion timeline with strong academic performance.',
    additionalFlags: [],
    recommendation: 'APPROVE - Meets all requirements.',
    reasoning: 'All 18 rules passed with high confidence. Well-documented academic record from a top Mississippi nursing program with CCNE accreditation.',
  },
  sourceCitations: ['All pages reviewed'],
  rulesApplied: ['check_graduation_confirmed', 'check_graduation_date_present', 'check_program_hours_met', 'check_required_courses_present', 'check_passing_grades', 'check_clinical_hours_present', 'check_school_accredited', 'check_accreditation_type', 'check_compressed_timeline', 'check_consistent_enrollment', 'check_transfer_credits_reasonable', 'check_gpa_consistency', 'check_duplicate_courses', 'check_academic_standing', 'check_issued_to_msbn', 'check_gpa_minimum', 'check_credential_type_valid', 'check_fraud_indicators'],
  createdAt: threeDaysAgo,
}]);

reviews.set(t5Id, [{
  reviewId: uuid(),
  transcriptId: t5Id,
  reviewerId: 'staff-user',
  action: 'CONFIRM',
  overrides: [],
  annotations: 'All checks passed. Transcript verified and approved for licensure processing.',
  timestamp: twoDaysAgo,
}]);

// Seed audit entries
function seedAudit(transcriptId, events) {
  const entries = events.map((e, i) => ({
    transcriptId,
    timestampEvent: `${new Date(Date.now() - (events.length - i) * 600000).toISOString()}#${e.action}`,
    actor: e.actor,
    action: e.action,
    details: e.details || {},
    ruleApplied: e.ruleApplied || '',
    sourceSection: e.sourceSection || '',
  }));
  auditEntries.set(transcriptId, entries);
}

seedAudit(t1Id, [
  { actor: 'system', action: 'TRANSCRIPT_UPLOADED', details: { fileName: 'hinds_cc_transcript_001.pdf' } },
  { actor: 'system', action: 'EXTRACTION_STARTED' },
  { actor: 'ai', action: 'EXTRACTION_COMPLETED', details: { pageCount: 3, coursesFound: 28 } },
  { actor: 'system', action: 'VERIFICATION_STARTED' },
  { actor: 'ai', action: 'RULES_APPLIED', details: { totalRules: 18, passed: 18, flagged: 0 }, ruleApplied: 'all_rules' },
  { actor: 'ai', action: 'AI_ANALYSIS_COMPLETED', details: { recommendation: 'APPROVE', riskLevel: 'LOW' } },
  { actor: 'system', action: 'VERIFICATION_COMPLETED', details: { overallStatus: 'CLEAR' } },
]);

seedAudit(t2Id, [
  { actor: 'system', action: 'TRANSCRIPT_UPLOADED', details: { fileName: 'ms_delta_cc_transcript_002.pdf' } },
  { actor: 'system', action: 'EXTRACTION_STARTED' },
  { actor: 'ai', action: 'EXTRACTION_COMPLETED', details: { pageCount: 2, coursesFound: 18 } },
  { actor: 'system', action: 'VERIFICATION_STARTED' },
  { actor: 'ai', action: 'RULE_FLAG', ruleApplied: 'check_required_courses_present', sourceSection: 'Pages 1-2, Course History', details: { missingCourse: 'PNV 1723 Mental Health Nursing' } },
  { actor: 'ai', action: 'RULE_FLAG', ruleApplied: 'check_compressed_timeline', sourceSection: 'Course History dates', details: { semesters: 2, expected: '3-4' } },
  { actor: 'ai', action: 'RULE_FLAG', ruleApplied: 'check_transfer_credits_reasonable', sourceSection: 'Transfer Credits section', details: { transferCredits: 24, sourceInstitution: 'National Health Academy' } },
  { actor: 'ai', action: 'AI_ANALYSIS_COMPLETED', details: { recommendation: 'REVIEW', riskLevel: 'MEDIUM' } },
  { actor: 'system', action: 'VERIFICATION_COMPLETED', details: { overallStatus: 'FLAGS_FOUND', flagCount: 3 } },
]);

seedAudit(t3Id, [
  { actor: 'system', action: 'TRANSCRIPT_UPLOADED', details: { fileName: 'southern_regional_transcript_003.pdf' } },
  { actor: 'system', action: 'EXTRACTION_STARTED' },
  { actor: 'ai', action: 'EXTRACTION_COMPLETED', details: { pageCount: 3, coursesFound: 22 } },
  { actor: 'system', action: 'VERIFICATION_STARTED' },
  { actor: 'ai', action: 'RULE_FLAG', ruleApplied: 'check_school_accredited', sourceSection: 'Transcript Header', details: { institution: 'Southern Regional Technical College', status: 'NOT_FOUND' } },
  { actor: 'ai', action: 'RULE_FLAG', ruleApplied: 'check_compressed_timeline', sourceSection: 'Course History dates', details: { semesters: 3, expected: '8 for BSN' } },
  { actor: 'ai', action: 'RULE_FLAG', ruleApplied: 'check_gpa_consistency', sourceSection: 'Academic Summary', details: { reported: 3.78, calculated: 2.41, discrepancy: 1.37 } },
  { actor: 'ai', action: 'RULES_APPLIED', details: { totalRules: 18, passed: 2, flagged: 13, undetermined: 3 } },
  { actor: 'ai', action: 'AI_ANALYSIS_COMPLETED', details: { recommendation: 'REJECT', riskLevel: 'HIGH' } },
  { actor: 'system', action: 'SAFETY_OVERRIDE_APPLIED', details: { reason: 'More than 3 rules flagged — escalated to REVIEW_REQUIRED' } },
  { actor: 'system', action: 'VERIFICATION_COMPLETED', details: { overallStatus: 'REVIEW_REQUIRED', flagCount: 10 } },
]);

seedAudit(t5Id, [
  { actor: 'system', action: 'TRANSCRIPT_UPLOADED', details: { fileName: 'ummc_bsn_transcript_005.pdf' } },
  { actor: 'system', action: 'EXTRACTION_STARTED' },
  { actor: 'ai', action: 'EXTRACTION_COMPLETED', details: { pageCount: 4, coursesFound: 42 } },
  { actor: 'system', action: 'VERIFICATION_STARTED' },
  { actor: 'ai', action: 'RULES_APPLIED', details: { totalRules: 18, passed: 18, flagged: 0 } },
  { actor: 'ai', action: 'AI_ANALYSIS_COMPLETED', details: { recommendation: 'APPROVE', riskLevel: 'LOW' } },
  { actor: 'system', action: 'VERIFICATION_COMPLETED', details: { overallStatus: 'CLEAR' } },
  { actor: 'staff-user', action: 'REVIEW_SUBMITTED', details: { action: 'CONFIRM', overrideCount: 0 } },
  { actor: 'system', action: 'STATUS_UPDATED', details: { from: 'VERIFIED', to: 'APPROVED' } },
]);

// ---------------------------------------------------------------------------
// API Routes
// ---------------------------------------------------------------------------

// -- Transcripts --
app.get('/transcripts', (_req, res) => {
  const list = Array.from(transcripts.values()).sort(
    (a, b) => new Date(b.uploadDate).getTime() - new Date(a.uploadDate).getTime()
  );
  res.json({ transcripts: list });
});

app.get('/transcripts/:id', (req, res) => {
  const t = transcripts.get(req.params.id);
  if (!t) return res.status(404).json({ error: 'Transcript not found' });
  res.json(t);
});

app.post('/transcripts', (req, res) => {
  const id = uuid();
  const transcript = {
    transcriptId: id,
    applicantId: `ANON-${Date.now()}`,
    uploadDate: new Date().toISOString(),
    status: 'UPLOADED',
    schoolName: '',
    programType: '',
    fileName: req.body.fileName || 'transcript.pdf',
    s3Key: `raw/${id}.pdf`,
    extractedDataKey: '',
  };
  transcripts.set(id, transcript);

  // Seed audit entry
  auditEntries.set(id, [{
    transcriptId: id,
    timestampEvent: `${new Date().toISOString()}#TRANSCRIPT_UPLOADED`,
    actor: 'system',
    action: 'TRANSCRIPT_UPLOADED',
    details: { fileName: transcript.fileName },
    ruleApplied: '',
    sourceSection: '',
  }]);

  // Simulate async processing — after 3s set to EXTRACTING, after 6s simulate verification
  setTimeout(() => {
    const t = transcripts.get(id);
    if (t) {
      t.status = 'EXTRACTING';
      t.schoolName = 'Demo Nursing College';
      t.programType = 'ADN';
    }
  }, 3000);

  setTimeout(() => {
    const t = transcripts.get(id);
    if (t) {
      t.status = 'VERIFIED';
      t.extractedDataKey = `extracted/${id}.json`;

      // Create a mock verification
      verifications.set(id, [{
        verificationId: uuid(),
        transcriptId: id,
        overallStatus: 'FLAGS_FOUND',
        riskLevel: 'LOW',
        ruleResults: [
          { ruleId: 'check_graduation_confirmed', status: 'PASS', explanation: 'Graduation confirmed.', sourceSection: 'Page 1', confidence: 'HIGH' },
          { ruleId: 'check_graduation_date_present', status: 'PASS', explanation: 'Date present.', sourceSection: 'Page 1', confidence: 'HIGH' },
          { ruleId: 'check_program_hours_met', status: 'PASS', explanation: 'Hours met.', sourceSection: 'Academic Summary', confidence: 'HIGH' },
          { ruleId: 'check_required_courses_present', status: 'PASS', explanation: 'All courses present.', sourceSection: 'Course History', confidence: 'HIGH' },
          { ruleId: 'check_passing_grades', status: 'PASS', explanation: 'All passing.', sourceSection: 'Course History', confidence: 'HIGH' },
          { ruleId: 'check_clinical_hours_present', status: 'PASS', explanation: 'Clinical hours present.', sourceSection: 'Course History', confidence: 'HIGH' },
          { ruleId: 'check_school_accredited', status: 'PASS', explanation: 'School accredited.', sourceSection: 'Header', confidence: 'HIGH' },
          { ruleId: 'check_accreditation_type', status: 'PASS', explanation: 'ACEN accredited.', sourceSection: 'Header', confidence: 'HIGH' },
          { ruleId: 'check_compressed_timeline', status: 'PASS', explanation: 'Normal timeline.', sourceSection: 'Dates', confidence: 'HIGH' },
          { ruleId: 'check_consistent_enrollment', status: 'PASS', explanation: 'Consistent enrollment.', sourceSection: 'Records', confidence: 'HIGH' },
          { ruleId: 'check_transfer_credits_reasonable', status: 'FLAG', explanation: 'Demo flag: 18 transfer credits from out-of-state institution.', sourceSection: 'Transfer Credits', confidence: 'MEDIUM' },
          { ruleId: 'check_gpa_consistency', status: 'PASS', explanation: 'GPA consistent.', sourceSection: 'Summary', confidence: 'HIGH' },
          { ruleId: 'check_duplicate_courses', status: 'PASS', explanation: 'No duplicates.', sourceSection: 'Course History', confidence: 'HIGH' },
          { ruleId: 'check_academic_standing', status: 'PASS', explanation: 'Academic standing satisfactory across all recorded terms.', sourceSection: 'academic_standing_per_term', confidence: 'MEDIUM' },
          { ruleId: 'check_issued_to_msbn', status: 'UNABLE_TO_DETERMINE', explanation: 'Could not determine who the transcript was issued to. Confirm the transcript was officially requested by MSBN.', sourceSection: 'document_issued_to', confidence: 'LOW' },
          { ruleId: 'check_gpa_minimum', status: 'PASS', explanation: 'Cumulative GPA meets the minimum standard.', sourceSection: 'gpa', confidence: 'MEDIUM' },
          { ruleId: 'check_credential_type_valid', status: 'PASS', explanation: 'Credential type is consistent with the identified program.', sourceSection: 'credential_type', confidence: 'MEDIUM' },
          { ruleId: 'check_fraud_indicators', status: 'PASS', explanation: 'No statistical fraud indicators detected.', sourceSection: 'courses / gpa', confidence: 'MEDIUM' },
        ],
        aiAnalysis: {
          summary: 'This is a demo verification result for your uploaded transcript. In production, AI extraction and analysis would process the actual PDF content.',
          additionalFlags: [],
          recommendation: 'REVIEW - Demo transcript uploaded. Transfer credits require verification.',
          reasoning: 'One rule flagged for transfer credits. All other checks passed. This demo shows how the 18-rule verification pipeline works end-to-end.',
        },
        sourceCitations: ['Demo data'],
        rulesApplied: ['all 18 rules applied'],
        createdAt: new Date().toISOString(),
      }]);
    }
  }, 6000);

  // Return a fake presigned URL (mock upload just accepts it)
  res.json({ transcriptId: id, uploadUrl: `http://localhost:3001/mock-upload/${id}` });
});

// Mock S3 upload endpoint
app.put('/mock-upload/:id', (_req, res) => {
  res.sendStatus(200);
});

app.post('/transcripts/:id/verify', (req, res) => {
  const t = transcripts.get(req.params.id);
  if (!t) return res.status(404).json({ error: 'Transcript not found' });
  t.status = 'VERIFYING';
  res.json({ executionArn: `arn:aws:states:us-east-1:mock:execution:${req.params.id}` });
});

// -- Verifications --
app.get('/verifications/:transcriptId', (req, res) => {
  const v = verifications.get(req.params.transcriptId);
  res.json(v || []);
});

// -- Reviews --
app.post('/reviews', (req, res) => {
  const review = {
    reviewId: uuid(),
    transcriptId: req.body.transcriptId,
    reviewerId: req.body.reviewerId || 'staff-user',
    action: req.body.action,
    overrides: req.body.overrides || [],
    annotations: req.body.annotations || '',
    timestamp: new Date().toISOString(),
  };

  const existing = reviews.get(review.transcriptId) || [];
  existing.push(review);
  reviews.set(review.transcriptId, existing);

  // Update transcript status based on review action
  const t = transcripts.get(review.transcriptId);
  if (t && review.action === 'CONFIRM') {
    t.status = 'APPROVED';
  } else if (t && review.action === 'OVERRIDE') {
    t.status = 'REVIEWED';
  }

  // Add audit entry
  const auditList = auditEntries.get(review.transcriptId) || [];
  auditList.push({
    transcriptId: review.transcriptId,
    timestampEvent: `${new Date().toISOString()}#REVIEW_SUBMITTED`,
    actor: review.reviewerId,
    action: 'REVIEW_SUBMITTED',
    details: { action: review.action, overrideCount: review.overrides.length },
    ruleApplied: '',
    sourceSection: '',
  });
  auditEntries.set(review.transcriptId, auditList);

  res.json(review);
});

app.get('/reviews/:transcriptId', (req, res) => {
  res.json(reviews.get(req.params.transcriptId) || []);
});

// -- Audit --
app.get('/audit/:transcriptId', (req, res) => {
  res.json({
    transcriptId: req.params.transcriptId,
    auditLog: auditEntries.get(req.params.transcriptId) || [],
  });
});

// ---------------------------------------------------------------------------
// Start server
// ---------------------------------------------------------------------------
const PORT = 3001;
app.listen(PORT, () => {
  console.log(`\n  MSBON Mock API Server running at http://localhost:${PORT}`);
  console.log(`  Seeded ${transcripts.size} sample transcripts\n`);
  console.log('  Sample transcripts:');
  for (const [id, t] of transcripts) {
    console.log(`    ${t.status.padEnd(18)} ${t.fileName.padEnd(40)} ${t.schoolName}`);
  }
  console.log('\n  Start the frontend:  cd frontend && npm run dev\n');
});
