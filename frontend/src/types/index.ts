export interface Transcript {
  transcriptId: string;
  applicantId: string;
  uploadDate: string;
  status: TranscriptStatus;
  schoolName: string;
  programType: string;
  fileName: string;
  s3Key: string;
  extractedDataKey: string;
}

export type TranscriptStatus =
  | 'UPLOADED'
  | 'EXTRACTING'
  | 'EXTRACTED'
  | 'VERIFYING'
  | 'VERIFIED'
  | 'REVIEW_REQUIRED'
  | 'REVIEWED'
  | 'APPROVED'
  | 'NEEDS_FOLLOW_UP';

export interface RuleResult {
  ruleId: string;
  status: 'PASS' | 'FLAG' | 'UNABLE_TO_DETERMINE';
  explanation: string;
  sourceSection: string;
  confidence: 'HIGH' | 'MEDIUM' | 'LOW';
}

export interface AiAnalysis {
  summary: string;
  additionalFlags: string[];
  recommendation: string;
  reasoning: string;
}

export interface Verification {
  verificationId: string;
  transcriptId: string;
  overallStatus: 'CLEAR' | 'FLAGS_FOUND' | 'REVIEW_REQUIRED';
  riskLevel: 'LOW' | 'MEDIUM' | 'HIGH';
  ruleResults: RuleResult[];
  aiAnalysis: AiAnalysis;
  sourceCitations: string[];
  rulesApplied: string[];
  createdAt: string;
}

export interface ReviewAction {
  reviewId: string;
  transcriptId: string;
  reviewerId: string;
  action: 'CONFIRM' | 'OVERRIDE' | 'ANNOTATE';
  overrides: Override[];
  annotations: string;
  timestamp: string;
}

export interface Override {
  ruleId: string;
  originalStatus: string;
  newStatus: string;
  justification: string;
}

export interface AuditEntry {
  transcriptId: string;
  timestampEvent: string;
  actor: string;
  action: string;
  details: Record<string, unknown>;
  ruleApplied: string;
  sourceSection: string;
}

export interface ExtractedTranscript {
  student_id: string;
  institutions: string[];
  program_name: string;
  program_type: string;
  courses: Course[];
  transfer_credits: TransferCredit[];
  degree_conferral: string | null;
  graduation_date: string | null;
  graduation_confirmed: boolean;
  gpa_info: Record<string, number>;
  total_credit_hours: number;
  enrollment_terms: string[];
  raw_text: string;
  page_count: number;
}

export interface Course {
  name: string;
  number: string;
  credits: number;
  grade: string;
  term: string;
}

export interface TransferCredit {
  institution: string;
  courses: Course[];
}
