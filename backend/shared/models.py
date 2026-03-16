"""Data models for the MSBON transcript verification system."""

from dataclasses import dataclass, field, asdict
from typing import Optional
from datetime import datetime
import uuid


@dataclass
class TranscriptRecord:
    transcript_id: str = field(default_factory=lambda: str(uuid.uuid4()))
    applicant_id: str = ""
    upload_date: str = field(default_factory=lambda: datetime.utcnow().isoformat())
    status: str = "UPLOADED"  # UPLOADED, EXTRACTING, EXTRACTED, VERIFYING, VERIFIED, REVIEW_REQUIRED, REVIEWED
    school_name: str = ""
    program_type: str = ""  # ADN, BSN, MSN, LPN, etc.
    s3_key: str = ""
    extracted_data_key: str = ""
    file_name: str = ""

    def to_dynamo(self) -> dict:
        return {
            "transcriptId": self.transcript_id,
            "applicantId": self.applicant_id,
            "uploadDate": self.upload_date,
            "status": self.status,
            "schoolName": self.school_name,
            "programType": self.program_type,
            "s3Key": self.s3_key,
            "extractedDataKey": self.extracted_data_key,
            "fileName": self.file_name,
        }


@dataclass
class ExtractedTranscript:
    """Structured data extracted from a transcript PDF."""
    student_id: str = ""
    institutions: list = field(default_factory=list)
    program_name: str = ""
    program_type: str = ""  # ADN, BSN, MSN, LPN, etc.
    courses: list = field(default_factory=list)
    transfer_credits: list = field(default_factory=list)
    degree_conferral: Optional[str] = None
    graduation_date: Optional[str] = None
    graduation_confirmed: bool = False
    gpa_info: dict = field(default_factory=dict)
    total_credit_hours: float = 0.0
    enrollment_terms: list = field(default_factory=list)
    raw_text: str = ""
    page_count: int = 0

    def to_dict(self) -> dict:
        return asdict(self)


@dataclass
class RuleResult:
    """Result from a single verification rule."""
    rule_id: str = ""
    status: str = "UNABLE_TO_DETERMINE"  # PASS, FLAG, UNABLE_TO_DETERMINE
    explanation: str = ""
    source_section: str = ""
    confidence: str = "LOW"  # HIGH, MEDIUM, LOW

    def to_dict(self) -> dict:
        return asdict(self)


@dataclass
class VerificationResult:
    verification_id: str = field(default_factory=lambda: str(uuid.uuid4()))
    transcript_id: str = ""
    overall_status: str = "PENDING"  # CLEAR, FLAGS_FOUND, REVIEW_REQUIRED
    risk_level: str = "LOW"  # LOW, MEDIUM, HIGH
    rule_results: list = field(default_factory=list)
    ai_analysis: dict = field(default_factory=dict)
    source_citations: list = field(default_factory=list)
    rules_applied: list = field(default_factory=list)
    created_at: str = field(default_factory=lambda: datetime.utcnow().isoformat())

    def to_dynamo(self) -> dict:
        return {
            "verificationId": self.verification_id,
            "transcriptId": self.transcript_id,
            "overallStatus": self.overall_status,
            "riskLevel": self.risk_level,
            "ruleResults": [r if isinstance(r, dict) else r.to_dict() for r in self.rule_results],
            "aiAnalysis": self.ai_analysis,
            "sourceCitations": self.source_citations,
            "rulesApplied": self.rules_applied,
            "createdAt": self.created_at,
        }


@dataclass
class ReviewAction:
    review_id: str = field(default_factory=lambda: str(uuid.uuid4()))
    transcript_id: str = ""
    reviewer_id: str = ""
    action: str = ""  # CONFIRM, OVERRIDE, ANNOTATE
    overrides: list = field(default_factory=list)
    annotations: str = ""
    timestamp: str = field(default_factory=lambda: datetime.utcnow().isoformat())

    def to_dynamo(self) -> dict:
        return {
            "reviewId": self.review_id,
            "transcriptId": self.transcript_id,
            "reviewerId": self.reviewer_id,
            "action": self.action,
            "overrides": self.overrides,
            "annotations": self.annotations,
            "timestamp": self.timestamp,
        }


@dataclass
class AuditEntry:
    transcript_id: str = ""
    timestamp_event: str = ""
    actor: str = ""  # "system", "ai", or reviewer ID
    action: str = ""
    details: dict = field(default_factory=dict)
    rule_applied: str = ""
    source_section: str = ""

    def __post_init__(self):
        if not self.timestamp_event:
            self.timestamp_event = f"{datetime.utcnow().isoformat()}#{self.action}"

    def to_dynamo(self) -> dict:
        return {
            "transcriptId": self.transcript_id,
            "timestampEvent": self.timestamp_event,
            "actor": self.actor,
            "action": self.action,
            "details": self.details,
            "ruleApplied": self.rule_applied,
            "sourceSection": self.source_section,
        }
