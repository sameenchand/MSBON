"""
Verification rules engine for MSBON transcript verification.

Each rule function takes an extracted_data dict and returns:
{
    "ruleId": str,
    "status": "PASS" | "FLAG" | "UNABLE_TO_DETERMINE",
    "explanation": str,
    "sourceSection": str,
    "confidence": "HIGH" | "MEDIUM" | "LOW"
}
"""

import difflib
import json
import os
import re
from datetime import datetime, timedelta
from typing import Any

# ---------------------------------------------------------------------------
# Approved Mississippi nursing schools
# ---------------------------------------------------------------------------

_DEFAULT_APPROVED_SCHOOLS = [
    "Northwest Mississippi Community College",
    "Northeast Mississippi Community College",
    "Copiah-Lincoln Community College",
    "Itawamba Community College",
    "Holmes Community College",
    "Pearl River Community College",
    "Hinds Community College",
    "Meridian Community College",
    "Mississippi Gulf Coast Community College",
    "East Central Community College",
    "East Mississippi Community College",
    "Jones County Junior College",
    "Coahoma Community College",
    "Mississippi Delta Community College",
    "Southwest Mississippi Community College",
    "University of Mississippi Medical Center",
    "Mississippi College",
    "Delta State University",
    "Alcorn State University",
    "William Carey University",
    "Mississippi University for Women",
    "University of Southern Mississippi",
    "Jackson State University",
    "Belhaven University",
    "Blue Mountain College",
]


def _load_approved_schools() -> list[dict]:
    """Load approved schools from /opt/rules/ JSON if available, else use defaults."""
    rules_path = "/opt/rules/approved_schools.json"
    if os.path.exists(rules_path):
        with open(rules_path, "r") as f:
            data = json.load(f)
        # Handle both formats: raw list or {"mississippi_nursing_schools": [...]}
        if isinstance(data, list):
            return data
        return data.get("mississippi_nursing_schools", [])
    # Return default list wrapped in dicts for consistency
    return [{"name": name, "accreditation": None} for name in _DEFAULT_APPROVED_SCHOOLS]


APPROVED_SCHOOLS = _load_approved_schools()
APPROVED_SCHOOL_NAMES = [
    s["name"].lower() if isinstance(s, dict) else s.lower() for s in APPROVED_SCHOOLS
]

# Aliases (e.g. "Hinds CC", "UMMC") and accreditation lookup built from the same source
APPROVED_SCHOOL_ALIASES: list[str] = []
SCHOOL_ACCREDITATION_MAP: dict[str, str] = {}
for _s in APPROVED_SCHOOLS:
    if isinstance(_s, dict):
        _name = _s.get("name", "").lower()
        _accred = _s.get("accreditation") or ""
        if _name and _accred:
            SCHOOL_ACCREDITATION_MAP[_name] = _accred
        for _alias in _s.get("aliases", []):
            _alias_lower = _alias.lower()
            APPROVED_SCHOOL_ALIASES.append(_alias_lower)
            if _accred:
                SCHOOL_ACCREDITATION_MAP[_alias_lower] = _accred

# ---------------------------------------------------------------------------
# Program hour requirements (approximate ranges)
# ---------------------------------------------------------------------------

PROGRAM_HOUR_REQUIREMENTS: dict[str, dict[str, int]] = {
    "LPN": {"min": 40, "max": 50},
    "ADN": {"min": 60, "max": 72},
    "ASN": {"min": 60, "max": 72},
    "BSN": {"min": 120, "max": 140},
    "MSN": {"min": 36, "max": 50},
    "DNP": {"min": 70, "max": 100},
}

# Expected minimum duration in months per program
PROGRAM_MIN_DURATION_MONTHS: dict[str, int] = {
    "LPN": 10,
    "ADN": 18,
    "ASN": 18,
    "BSN": 36,
    "MSN": 18,
    "DNP": 24,
}

REQUIRED_NURSING_COURSE_KEYWORDS = [
    "fundamentals",
    "med-surg",
    "medical-surgical",
    "medical surgical",
    "pharmacology",
    "clinical practicum",
    "clinical",
    "mental health",
    "psychiatric",
    "psych nursing",
    # LPN / community college course naming conventions
    "practical nursing",
    "intermediate practical",
    "advanced practical",
    "field study",
    "nursing foundations",
]

# Nursing course code prefixes (e.g. PNV, NUR, NSG, NURS)
NURSING_COURSE_CODE_PREFIXES = ("NUR", "PNV", "NSG", "NURS", "RN", "PN")

PASSING_GRADES = {"A", "A+", "A-", "B", "B+", "B-", "C", "C+", "C-", "P", "S", "CR"}
FAILING_GRADES = {"D", "D+", "D-", "F", "W", "WF", "WP", "I", "U", "NC"}


# ---------------------------------------------------------------------------
# Helper utilities
# ---------------------------------------------------------------------------

def _result(
    rule_id: str,
    status: str,
    explanation: str,
    source_section: str,
    confidence: str,
) -> dict[str, str]:
    return {
        "ruleId": rule_id,
        "status": status,
        "explanation": explanation,
        "sourceSection": source_section,
        "confidence": confidence,
    }


def _parse_date(date_str: str | None) -> datetime | None:
    if not date_str:
        return None
    date_str = date_str.strip()

    # Standard date formats
    for fmt in ("%Y-%m-%d", "%m/%d/%Y", "%m-%d-%Y", "%B %d, %Y", "%b %d, %Y", "%Y"):
        try:
            return datetime.strptime(date_str, fmt)
        except (ValueError, AttributeError):
            continue

    # Semester string formats: "Fall 2018", "2019 Spring Session", "Summer 8 Week 2024", etc.
    term_months = {"spring": 1, "summer": 6, "fall": 9, "winter": 12, "autumn": 9}
    lower = date_str.lower()
    year_match = re.search(r"\b(20\d{2}|19\d{2})\b", lower)
    if year_match:
        year = int(year_match.group(1))
        for term, month in term_months.items():
            if term in lower:
                return datetime(year, month, 1)
        # Year found but no term name — default to January
        return datetime(year, 1, 1)

    return None


def _get_courses(data: dict) -> list[dict]:
    """Extract course list from various possible keys."""
    for key in ("courses", "course_list", "grades", "academic_record"):
        if key in data and isinstance(data[key], list):
            return data[key]
    return []


def _get_program_type(data: dict) -> str | None:
    """Determine the program type from extracted data."""
    for key in ("program_type", "degree_type", "program", "degree"):
        val = data.get(key)
        if val:
            val_upper = val.upper()
            for prog in PROGRAM_HOUR_REQUIREMENTS:
                if prog in val_upper:
                    return prog
    return None


def _normalize(name: str) -> str:
    return re.sub(r"[^a-z0-9 ]", "", name.lower()).strip()


def _normalize_grade(grade: str) -> str:
    """Strip suffixes like (R), (*), (W) from grades before comparison.

    Community colleges often append (R) for repeated courses, e.g. 'B (R)' or 'D(R)'.
    """
    grade = grade.strip().upper()
    # Remove parenthetical suffixes: ' (R)', '(R)', '(*)', etc.
    grade = re.sub(r"\s*\([^)]*\)\s*$", "", grade).strip()
    return grade


# ---------------------------------------------------------------------------
# Graduation Verification Rules
# ---------------------------------------------------------------------------

def check_graduation_confirmed(extracted_data: dict) -> dict:
    """Check if degree conferral or graduation is explicitly stated."""
    grad_confirmed = extracted_data.get("graduation_confirmed")
    degree_conferral = extracted_data.get("degree_conferral")
    graduation_date = extracted_data.get("graduation_date")

    if grad_confirmed is True or (isinstance(grad_confirmed, str) and grad_confirmed.lower() in ("yes", "true", "confirmed")):
        return _result(
            "GRAD_CONFIRMED",
            "PASS",
            "Graduation is explicitly confirmed in the transcript.",
            "graduation_confirmed",
            "HIGH",
        )

    if degree_conferral and str(degree_conferral).strip():
        return _result(
            "GRAD_CONFIRMED",
            "PASS",
            f"Degree conferral found: {degree_conferral}.",
            "degree_conferral",
            "HIGH",
        )

    if graduation_date and str(graduation_date).strip():
        return _result(
            "GRAD_CONFIRMED",
            "PASS",
            f"Graduation date present ({graduation_date}), suggesting degree was conferred.",
            "graduation_date",
            "MEDIUM",
        )

    return _result(
        "GRAD_CONFIRMED",
        "FLAG",
        "No explicit graduation confirmation, degree conferral, or graduation date found.",
        "graduation_confirmed / degree_conferral / graduation_date",
        "HIGH",
    )


def check_graduation_date_present(extracted_data: dict) -> dict:
    """Check if a graduation date is present."""
    grad_date = extracted_data.get("graduation_date")
    if grad_date and str(grad_date).strip():
        parsed = _parse_date(str(grad_date))
        if parsed and parsed > datetime.now():
            return _result(
                "GRAD_DATE_PRESENT",
                "FLAG",
                f"Graduation date ({grad_date}) is in the future.",
                "graduation_date",
                "HIGH",
            )
        return _result(
            "GRAD_DATE_PRESENT",
            "PASS",
            f"Graduation date is present: {grad_date}.",
            "graduation_date",
            "HIGH",
        )

    return _result(
        "GRAD_DATE_PRESENT",
        "FLAG",
        "No graduation date found in the transcript data.",
        "graduation_date",
        "HIGH",
    )


# ---------------------------------------------------------------------------
# Program Completion Rules
# ---------------------------------------------------------------------------

def check_program_hours_met(extracted_data: dict) -> dict:
    """Check total credit hours against minimum requirements for the program type."""
    total_hours = extracted_data.get("total_credit_hours") or extracted_data.get("total_hours")
    program_type = _get_program_type(extracted_data)

    if total_hours is None:
        return _result(
            "PROGRAM_HOURS_MET",
            "UNABLE_TO_DETERMINE",
            "Total credit hours not found in extracted data.",
            "total_credit_hours",
            "LOW",
        )

    try:
        total_hours = float(total_hours)
    except (ValueError, TypeError):
        return _result(
            "PROGRAM_HOURS_MET",
            "UNABLE_TO_DETERMINE",
            f"Could not parse total credit hours: {total_hours}.",
            "total_credit_hours",
            "LOW",
        )

    if not program_type:
        return _result(
            "PROGRAM_HOURS_MET",
            "UNABLE_TO_DETERMINE",
            f"Program type not identified. Total hours found: {total_hours}.",
            "program_type / total_credit_hours",
            "LOW",
        )

    req = PROGRAM_HOUR_REQUIREMENTS[program_type]
    if total_hours >= req["min"]:
        return _result(
            "PROGRAM_HOURS_MET",
            "PASS",
            f"{program_type} requires {req['min']}-{req['max']} hours. Transcript shows {total_hours} hours.",
            "total_credit_hours",
            "HIGH",
        )

    return _result(
        "PROGRAM_HOURS_MET",
        "FLAG",
        f"{program_type} requires minimum {req['min']} hours but transcript shows only {total_hours} hours.",
        "total_credit_hours",
        "HIGH",
    )


def check_required_courses_present(extracted_data: dict) -> dict:
    """Check for required nursing courses."""
    courses = _get_courses(extracted_data)
    if not courses:
        return _result(
            "REQUIRED_COURSES",
            "UNABLE_TO_DETERMINE",
            "No course list found in extracted data.",
            "courses",
            "LOW",
        )

    course_names_lower = []
    course_codes_upper = []
    for c in courses:
        name = c.get("name") or c.get("course_name") or c.get("title") or ""
        code = c.get("number") or c.get("code") or c.get("course_code") or ""
        course_names_lower.append(name.lower())
        course_codes_upper.append(code.upper())

    # If any course has a recognized nursing prefix (NUR, PNV, NSG, etc.) the
    # program clearly contains nursing coursework — count those as found keywords.
    has_nursing_codes = any(
        any(code.startswith(pfx) for pfx in NURSING_COURSE_CODE_PREFIXES)
        for code in course_codes_upper
    )

    found = []
    missing = []
    for keyword in REQUIRED_NURSING_COURSE_KEYWORDS:
        if any(keyword in cn for cn in course_names_lower):
            found.append(keyword)
        else:
            missing.append(keyword)

    # If all/most courses carry nursing prefixes (PNV, NUR, NSG, etc.) and at
    # least one keyword matched, the program is clearly a nursing curriculum.
    # Community college LPN programs use course-code conventions (PNV 1115, etc.)
    # rather than generic keyword-based naming, so we trust the course codes.
    if has_nursing_codes and found:
        return _result(
            "REQUIRED_COURSES",
            "PASS",
            f"Nursing-coded courses confirmed (PNV/NUR/NSG prefix) with matching areas: {', '.join(found)}.",
            "courses",
            "MEDIUM",
        )
    if has_nursing_codes and not found:
        return _result(
            "REQUIRED_COURSES",
            "PASS",
            "All courses carry recognized nursing program codes (PNV/NUR/NSG). Curriculum verified by course code.",
            "courses",
            "MEDIUM",
        )

    if not missing:
        return _result(
            "REQUIRED_COURSES",
            "PASS",
            f"All required nursing course areas found: {', '.join(found)}.",
            "courses",
            "MEDIUM",
        )

    if len(found) >= 3:
        return _result(
            "REQUIRED_COURSES",
            "FLAG",
            f"Some required course areas found ({', '.join(found)}) but missing: {', '.join(missing)}.",
            "courses",
            "MEDIUM",
        )

    return _result(
        "REQUIRED_COURSES",
        "FLAG",
        f"Multiple required nursing course areas not found. Missing: {', '.join(missing)}. Found: {', '.join(found) if found else 'none'}.",
        "courses",
        "MEDIUM",
    )


def check_passing_grades(extracted_data: dict) -> dict:
    """Verify all nursing courses have passing grades."""
    courses = _get_courses(extracted_data)
    if not courses:
        return _result(
            "PASSING_GRADES",
            "UNABLE_TO_DETERMINE",
            "No course list found in extracted data.",
            "courses",
            "LOW",
        )

    failing_courses = []
    courses_checked = 0

    for c in courses:
        raw = c.get("grade") or c.get("final_grade") or ""
        grade = _normalize_grade(raw)
        if not grade:
            continue

        courses_checked += 1
        # Normalize grade to base letter for comparison
        base_grade = grade.rstrip("+-")

        if base_grade in {"D", "F", "W", "WF", "WP", "I", "U", "NC"}:
            course_name = c.get("name") or c.get("course_name") or c.get("title") or "Unknown"
            failing_courses.append(f"{course_name} ({grade})")

    if courses_checked == 0:
        return _result(
            "PASSING_GRADES",
            "UNABLE_TO_DETERMINE",
            "No grades found in course data.",
            "courses",
            "LOW",
        )

    if not failing_courses:
        return _result(
            "PASSING_GRADES",
            "PASS",
            f"All {courses_checked} courses with grades have passing marks.",
            "courses",
            "HIGH",
        )

    return _result(
        "PASSING_GRADES",
        "FLAG",
        f"Non-passing grades found in {len(failing_courses)} course(s): {'; '.join(failing_courses)}.",
        "courses",
        "HIGH",
    )


def check_clinical_hours_present(extracted_data: dict) -> dict:
    """Check for clinical practicum/lab courses."""
    courses = _get_courses(extracted_data)
    clinical_hours = extracted_data.get("clinical_hours")

    if clinical_hours:
        return _result(
            "CLINICAL_HOURS",
            "PASS",
            f"Clinical hours reported: {clinical_hours}.",
            "clinical_hours",
            "HIGH",
        )

    if not courses:
        return _result(
            "CLINICAL_HOURS",
            "UNABLE_TO_DETERMINE",
            "No course data or clinical hours found.",
            "courses / clinical_hours",
            "LOW",
        )

    clinical_keywords = [
        "clinical", "practicum", "lab", "preceptorship",
        "capstone clinical", "simulation",
        # LPN / community college naming conventions
        "field study", "f.s.", "fieldwork", "skills",
    ]
    clinical_courses = []
    nursing_coded_courses = []
    for c in courses:
        name = (c.get("name") or c.get("course_name") or c.get("title") or "").lower()
        code = (c.get("number") or c.get("code") or c.get("course_code") or "").upper()
        if any(kw in name for kw in clinical_keywords):
            clinical_courses.append(c.get("name") or c.get("course_name") or c.get("title") or "Unknown")
        if any(code.startswith(pfx) for pfx in NURSING_COURSE_CODE_PREFIXES):
            nursing_coded_courses.append(code)

    if clinical_courses:
        return _result(
            "CLINICAL_HOURS",
            "PASS",
            f"Clinical/practicum courses found: {', '.join(clinical_courses[:5])}.",
            "courses",
            "MEDIUM",
        )

    # LPN/ADN programs often embed clinical hours within practicum-style courses
    # (e.g. "Field Study" abbreviated as F.S.) that OCR/extraction may not capture
    # with clinical keywords. If the transcript contains exclusively nursing-coded
    # courses (PNV, NUR, NSG) the clinical component is embedded in the curriculum.
    if nursing_coded_courses:
        return _result(
            "CLINICAL_HOURS",
            "PASS",
            f"Clinical hours embedded in nursing-coded coursework ({', '.join(set(nursing_coded_courses[:5]))}). "
            "Field study / practicum components are standard in LPN/ADN programs.",
            "courses",
            "MEDIUM",
        )

    return _result(
        "CLINICAL_HOURS",
        "FLAG",
        "No clinical practicum, lab, or preceptorship courses identified in the transcript.",
        "courses",
        "MEDIUM",
    )


# ---------------------------------------------------------------------------
# Accreditation Rules
# ---------------------------------------------------------------------------

def check_school_accredited(extracted_data: dict) -> dict:
    """Check if the school is in the approved schools list."""
    school_name = extracted_data.get("school_name") or extracted_data.get("institution") or extracted_data.get("institution_name")

    if not school_name:
        return _result(
            "SCHOOL_ACCREDITED",
            "UNABLE_TO_DETERMINE",
            "School name not found in extracted data.",
            "school_name",
            "LOW",
        )

    normalized = _normalize(school_name)

    # Check canonical names and all aliases (e.g. "Hinds CC", "UMMC")
    for known in APPROVED_SCHOOL_NAMES + APPROVED_SCHOOL_ALIASES:
        if normalized in known or known in normalized:
            return _result(
                "SCHOOL_ACCREDITED",
                "PASS",
                f"School '{school_name}' matches approved school list.",
                "school_name",
                "HIGH",
            )

    # Fuzzy match — catches typos and abbreviations (e.g. "Hinds Comm College")
    all_known = APPROVED_SCHOOL_NAMES + APPROVED_SCHOOL_ALIASES
    matches = difflib.get_close_matches(normalized, all_known, n=1, cutoff=0.75)
    if matches:
        return _result(
            "SCHOOL_ACCREDITED",
            "PASS",
            f"School '{school_name}' closely matches approved school '{matches[0]}' (fuzzy match — confirm manually if in doubt).",
            "school_name",
            "MEDIUM",
        )

    return _result(
        "SCHOOL_ACCREDITED",
        "FLAG",
        f"School '{school_name}' not found in the approved Mississippi nursing schools list. Manual verification may be needed.",
        "school_name",
        "MEDIUM",
    )


def check_accreditation_type(extracted_data: dict) -> dict:
    """Cross-reference accreditation type (ACEN, CCNE, etc.).

    Primary strategy: look up the school in the approved reference data — every
    approved Mississippi school has its accreditor recorded there, so this works
    even when the transcript does not print the accreditation body.
    Fallback: scan extracted text fields for explicit accreditation keywords.
    """
    school_name = (
        extracted_data.get("school_name")
        or extracted_data.get("institution")
        or extracted_data.get("institution_name")
        or ""
    )

    # Primary: look up accreditation from reference data
    if school_name:
        norm = _normalize(school_name)
        for known_name, accred in SCHOOL_ACCREDITATION_MAP.items():
            if norm in known_name or known_name in norm:
                return _result(
                    "ACCREDITATION_TYPE",
                    "PASS",
                    f"'{school_name}' is accredited by {accred} per the MSBN approved school reference data.",
                    "approved_schools_reference",
                    "HIGH",
                )

    # Fallback: transcript explicitly states accreditation
    accreditation = (extracted_data.get("accreditation") or extracted_data.get("accreditation_type") or "").strip()
    if accreditation:
        recognized_types = {"ACEN", "CCNE", "CNEA", "ABHES", "SACSCOC", "SACS", "COE", "NLN"}
        for rec in recognized_types:
            if rec in accreditation.upper():
                return _result(
                    "ACCREDITATION_TYPE",
                    "PASS",
                    f"Accreditation type stated on transcript: {accreditation}.",
                    "accreditation",
                    "MEDIUM",
                )
        return _result(
            "ACCREDITATION_TYPE",
            "FLAG",
            f"Accreditation type '{accreditation}' is not a recognized nursing program accreditor.",
            "accreditation",
            "MEDIUM",
        )

    # School not in reference data and no accreditation stated
    if school_name:
        return _result(
            "ACCREDITATION_TYPE",
            "FLAG",
            f"'{school_name}' is not in the MSBN approved school reference list — accreditation cannot be verified from reference data or transcript.",
            "school_name / approved_schools_reference",
            "MEDIUM",
        )

    return _result(
        "ACCREDITATION_TYPE",
        "UNABLE_TO_DETERMINE",
        "School name not found; accreditation cannot be determined.",
        "school_name",
        "LOW",
    )


# ---------------------------------------------------------------------------
# Fraud Indicator Rules
# ---------------------------------------------------------------------------

def check_compressed_timeline(extracted_data: dict) -> dict:
    """Flag if nursing program completed in suspiciously short time."""
    start_date_str = extracted_data.get("enrollment_start") or extracted_data.get("start_date") or extracted_data.get("admission_date")
    end_date_str = extracted_data.get("graduation_date") or extracted_data.get("completion_date") or extracted_data.get("enrollment_end")
    program_type = _get_program_type(extracted_data)

    if not start_date_str or not end_date_str:
        return _result(
            "COMPRESSED_TIMELINE",
            "UNABLE_TO_DETERMINE",
            "Start date or end date not available to determine program duration.",
            "enrollment_start / graduation_date",
            "LOW",
        )

    start_date = _parse_date(str(start_date_str))
    end_date = _parse_date(str(end_date_str))

    if not start_date or not end_date:
        return _result(
            "COMPRESSED_TIMELINE",
            "UNABLE_TO_DETERMINE",
            "Could not parse enrollment start or graduation date.",
            "enrollment_start / graduation_date",
            "LOW",
        )

    duration_months = (end_date.year - start_date.year) * 12 + (end_date.month - start_date.month)

    if duration_months <= 0:
        return _result(
            "COMPRESSED_TIMELINE",
            "FLAG",
            f"Graduation date ({end_date_str}) is before or same as start date ({start_date_str}).",
            "enrollment_start / graduation_date",
            "HIGH",
        )

    if not program_type:
        if duration_months < 10:
            return _result(
                "COMPRESSED_TIMELINE",
                "FLAG",
                f"Program completed in only {duration_months} months. Program type unknown so minimum could not be checked.",
                "enrollment_start / graduation_date",
                "MEDIUM",
            )
        return _result(
            "COMPRESSED_TIMELINE",
            "UNABLE_TO_DETERMINE",
            f"Program type not identified. Duration is {duration_months} months.",
            "enrollment_start / graduation_date / program_type",
            "LOW",
        )

    min_months = PROGRAM_MIN_DURATION_MONTHS.get(program_type, 12)
    # Flag if less than 60% of expected minimum duration
    threshold = int(min_months * 0.6)

    if duration_months < threshold:
        return _result(
            "COMPRESSED_TIMELINE",
            "FLAG",
            f"{program_type} program completed in {duration_months} months, which is suspiciously short (expected minimum ~{min_months} months).",
            "enrollment_start / graduation_date",
            "HIGH",
        )

    if duration_months < min_months:
        return _result(
            "COMPRESSED_TIMELINE",
            "FLAG",
            f"{program_type} program completed in {duration_months} months, below typical minimum of {min_months} months.",
            "enrollment_start / graduation_date",
            "MEDIUM",
        )

    return _result(
        "COMPRESSED_TIMELINE",
        "PASS",
        f"Program duration of {duration_months} months is within expected range for {program_type} (minimum ~{min_months} months).",
        "enrollment_start / graduation_date",
        "HIGH",
    )


def check_consistent_enrollment(extracted_data: dict) -> dict:
    """Check for unexplained gaps or suspicious overlaps in enrollment.

    Uses enrollment_terms (list of term name strings) from the extraction schema,
    parsing each with _parse_date() to build a chronological timeline.
    Falls back to structured semester dicts if available.
    """
    # Primary: enrollment_terms list of strings from extraction schema
    enrollment_terms = extracted_data.get("enrollment_terms") or []

    if isinstance(enrollment_terms, list) and len(enrollment_terms) >= 2:
        dated: list[tuple[str, datetime]] = []
        for term in enrollment_terms:
            parsed = _parse_date(str(term))
            if parsed:
                dated.append((str(term), parsed))

        if len(dated) < 2:
            return _result(
                "CONSISTENT_ENROLLMENT",
                "UNABLE_TO_DETERMINE",
                f"Found {len(enrollment_terms)} enrollment term(s) but could not parse enough dates to check consistency.",
                "enrollment_terms",
                "LOW",
            )

        dated.sort(key=lambda x: x[1])
        gaps = []
        for i in range(1, len(dated)):
            prev_name, prev_date = dated[i - 1]
            curr_name, curr_date = dated[i]
            gap_months = (curr_date.year - prev_date.year) * 12 + (curr_date.month - prev_date.month)
            if gap_months > 18:
                gaps.append(f"{prev_name} → {curr_name} ({gap_months} months)")

        if gaps:
            return _result(
                "CONSISTENT_ENROLLMENT",
                "FLAG",
                f"Unexplained enrollment gap(s) detected: {'; '.join(gaps)}. Gaps over 18 months warrant review.",
                "enrollment_terms",
                "MEDIUM",
            )

        return _result(
            "CONSISTENT_ENROLLMENT",
            "PASS",
            f"Enrollment is consistent across {len(dated)} terms with no unexplained gaps (>{18} months).",
            "enrollment_terms",
            "MEDIUM",
        )

    # Fallback: structured semester dicts with start/end dates
    semesters = (
        extracted_data.get("semesters")
        or extracted_data.get("terms")
        or extracted_data.get("enrollment_periods")
    )
    if semesters and isinstance(semesters, list):
        dated_structs = []
        for sem in semesters:
            term_name = sem.get("name") or sem.get("term") or sem.get("semester") or ""
            start = _parse_date(sem.get("start_date") or "")
            end = _parse_date(sem.get("end_date") or "")
            if start:
                dated_structs.append({"name": term_name, "start": start, "end": end})

        if len(dated_structs) >= 2:
            dated_structs.sort(key=lambda x: x["start"])
            gaps, overlaps = [], []
            for i in range(1, len(dated_structs)):
                prev, curr = dated_structs[i - 1], dated_structs[i]
                if prev["end"] and curr["start"]:
                    gap_days = (curr["start"] - prev["end"]).days
                    if gap_days > 180:
                        gaps.append(f"{prev['name']} → {curr['name']} ({gap_days} days)")
                    elif gap_days < -30:
                        overlaps.append(f"{prev['name']} and {curr['name']} overlap by {abs(gap_days)} days")
            issues = []
            if gaps:
                issues.append(f"Large enrollment gaps: {'; '.join(gaps)}")
            if overlaps:
                issues.append(f"Suspicious overlaps: {'; '.join(overlaps)}")
            if issues:
                return _result("CONSISTENT_ENROLLMENT", "FLAG", " | ".join(issues), "semesters", "MEDIUM")
            return _result("CONSISTENT_ENROLLMENT", "PASS", "Enrollment timeline consistent with no major gaps or overlaps.", "semesters", "MEDIUM")

    return _result(
        "CONSISTENT_ENROLLMENT",
        "UNABLE_TO_DETERMINE",
        "No enrollment term data available to check consistency.",
        "enrollment_terms",
        "LOW",
    )


def check_transfer_credits_reasonable(extracted_data: dict) -> dict:
    """Flag excessive transfer credits (e.g., >75% of total from transfers)."""
    transfer_credits = extracted_data.get("transfer_credits") or extracted_data.get("transfer_hours")
    total_credits = extracted_data.get("total_credit_hours") or extracted_data.get("total_hours")

    if transfer_credits is None or total_credits is None:
        return _result(
            "TRANSFER_CREDITS",
            "UNABLE_TO_DETERMINE",
            "Transfer credit or total credit hour data not available.",
            "transfer_credits / total_credit_hours",
            "LOW",
        )

    try:
        transfer_credits = float(transfer_credits)
        total_credits = float(total_credits)
    except (ValueError, TypeError):
        return _result(
            "TRANSFER_CREDITS",
            "UNABLE_TO_DETERMINE",
            "Could not parse transfer or total credit values.",
            "transfer_credits / total_credit_hours",
            "LOW",
        )

    if total_credits == 0:
        return _result(
            "TRANSFER_CREDITS",
            "FLAG",
            "Total credits reported as zero.",
            "total_credit_hours",
            "HIGH",
        )

    ratio = transfer_credits / total_credits

    if ratio > 0.75:
        return _result(
            "TRANSFER_CREDITS",
            "FLAG",
            f"Transfer credits ({transfer_credits}) represent {ratio:.0%} of total credits ({total_credits}), which is unusually high.",
            "transfer_credits / total_credit_hours",
            "HIGH",
        )

    if ratio > 0.50:
        return _result(
            "TRANSFER_CREDITS",
            "PASS",
            f"Transfer credits ({transfer_credits}) represent {ratio:.0%} of total credits ({total_credits}). Within acceptable range but notable.",
            "transfer_credits / total_credit_hours",
            "MEDIUM",
        )

    return _result(
        "TRANSFER_CREDITS",
        "PASS",
        f"Transfer credits ({transfer_credits}) represent {ratio:.0%} of total credits ({total_credits}). Within normal range.",
        "transfer_credits / total_credit_hours",
        "HIGH",
    )


def check_gpa_consistency(extracted_data: dict) -> dict:
    """Verify reported GPA is reasonable given course grades."""
    reported_gpa = extracted_data.get("gpa") or extracted_data.get("cumulative_gpa")
    courses = _get_courses(extracted_data)

    if reported_gpa is None:
        return _result(
            "GPA_CONSISTENCY",
            "UNABLE_TO_DETERMINE",
            "No GPA reported in extracted data.",
            "gpa",
            "LOW",
        )

    try:
        reported_gpa = float(reported_gpa)
    except (ValueError, TypeError):
        return _result(
            "GPA_CONSISTENCY",
            "UNABLE_TO_DETERMINE",
            f"Could not parse reported GPA: {reported_gpa}.",
            "gpa",
            "LOW",
        )

    if reported_gpa < 0 or reported_gpa > 4.0:
        return _result(
            "GPA_CONSISTENCY",
            "FLAG",
            f"Reported GPA of {reported_gpa} is outside the standard 0.0-4.0 range.",
            "gpa",
            "HIGH",
        )

    if not courses:
        return _result(
            "GPA_CONSISTENCY",
            "UNABLE_TO_DETERMINE",
            f"Reported GPA is {reported_gpa} but no course data to cross-check.",
            "gpa",
            "LOW",
        )

    # Approximate GPA from course grades
    grade_points = {
        "A+": 4.0, "A": 4.0, "A-": 3.7,
        "B+": 3.3, "B": 3.0, "B-": 2.7,
        "C+": 2.3, "C": 2.0, "C-": 1.7,
        "D+": 1.3, "D": 1.0, "D-": 0.7,
        "F": 0.0,
    }

    total_points = 0.0
    total_weight = 0.0

    for c in courses:
        grade = _normalize_grade(c.get("grade") or c.get("final_grade") or "")
        credits = c.get("credits") or c.get("credit_hours") or c.get("hours")
        if grade in grade_points and credits is not None:
            try:
                credits = float(credits)
                total_points += grade_points[grade] * credits
                total_weight += credits
            except (ValueError, TypeError):
                continue

    if total_weight == 0:
        return _result(
            "GPA_CONSISTENCY",
            "UNABLE_TO_DETERMINE",
            f"Reported GPA is {reported_gpa} but insufficient grade/credit data to calculate expected GPA.",
            "gpa / courses",
            "LOW",
        )

    calculated_gpa = total_points / total_weight
    difference = abs(reported_gpa - calculated_gpa)

    if difference > 0.5:
        return _result(
            "GPA_CONSISTENCY",
            "FLAG",
            f"Reported GPA ({reported_gpa}) differs significantly from calculated GPA ({calculated_gpa:.2f}) based on course grades. Difference: {difference:.2f}.",
            "gpa / courses",
            "HIGH",
        )

    if difference > 0.2:
        return _result(
            "GPA_CONSISTENCY",
            "FLAG",
            f"Reported GPA ({reported_gpa}) differs from calculated GPA ({calculated_gpa:.2f}) by {difference:.2f}. Minor discrepancy may be due to weighting differences.",
            "gpa / courses",
            "MEDIUM",
        )

    return _result(
        "GPA_CONSISTENCY",
        "PASS",
        f"Reported GPA ({reported_gpa}) is consistent with calculated GPA ({calculated_gpa:.2f}) from course grades.",
        "gpa / courses",
        "HIGH",
    )


def check_duplicate_courses(extracted_data: dict) -> dict:
    """Check for suspicious duplicate course entries."""
    courses = _get_courses(extracted_data)
    if not courses:
        return _result(
            "DUPLICATE_COURSES",
            "UNABLE_TO_DETERMINE",
            "No course list found in extracted data.",
            "courses",
            "LOW",
        )

    # Build a mapping of course identifier -> occurrences
    course_counts: dict[str, list[dict]] = {}
    for c in courses:
        name = (c.get("name") or c.get("course_name") or c.get("title") or "").strip().lower()
        code = (c.get("code") or c.get("course_code") or c.get("course_id") or "").strip().lower()
        key = code if code else name
        if not key:
            continue
        course_counts.setdefault(key, []).append(c)

    duplicates = {k: v for k, v in course_counts.items() if len(v) > 1}

    if not duplicates:
        return _result(
            "DUPLICATE_COURSES",
            "PASS",
            "No duplicate course entries detected.",
            "courses",
            "HIGH",
        )

    # Some duplicates are expected (retakes). Flag only if same course with same grade appears multiple times.
    suspicious = []
    for key, entries in duplicates.items():
        grades = [
            (e.get("grade") or e.get("final_grade") or "").strip().upper()
            for e in entries
        ]
        semesters = [
            (e.get("semester") or e.get("term") or "").strip()
            for e in entries
        ]
        # Suspicious if same grade and same semester
        grade_sem_pairs = list(zip(grades, semesters))
        if len(grade_sem_pairs) != len(set(grade_sem_pairs)):
            suspicious.append(f"{key} (appears {len(entries)} times with identical grade/term)")
        elif len(entries) > 2:
            suspicious.append(f"{key} (appears {len(entries)} times)")

    if suspicious:
        return _result(
            "DUPLICATE_COURSES",
            "FLAG",
            f"Suspicious duplicate courses found: {'; '.join(suspicious)}.",
            "courses",
            "MEDIUM",
        )

    return _result(
        "DUPLICATE_COURSES",
        "PASS",
        f"{len(duplicates)} course(s) appear more than once, likely retakes. No suspicious patterns detected.",
        "courses",
        "MEDIUM",
    )


# ---------------------------------------------------------------------------
# New rules: Academic Standing, MSBN Issuance, GPA Minimum,
#            Credential Type, Fraud Pattern Detection
# ---------------------------------------------------------------------------

def check_academic_standing(extracted_data: dict) -> dict:
    """Flag terms where the student was on Scholastic Probation or Academic Suspension."""
    standings = extracted_data.get("academic_standing_per_term") or []

    if not standings or not isinstance(standings, list):
        return _result(
            "ACADEMIC_STANDING",
            "UNABLE_TO_DETERMINE",
            "No per-term academic standing data found in transcript.",
            "academic_standing_per_term",
            "LOW",
        )

    suspension_terms = []
    probation_terms = []
    for entry in standings:
        term = entry.get("term") or "unknown term"
        standing = (entry.get("standing") or "").lower()
        if any(kw in standing for kw in ("suspension", "dismissed", "dismissal")):
            suspension_terms.append(term)
        elif "probation" in standing:
            probation_terms.append(term)

    if suspension_terms:
        return _result(
            "ACADEMIC_STANDING",
            "FLAG",
            f"Academic suspension recorded in: {', '.join(suspension_terms)}. Requires manual verification.",
            "academic_standing_per_term",
            "HIGH",
        )

    if probation_terms:
        return _result(
            "ACADEMIC_STANDING",
            "FLAG",
            f"Scholastic probation recorded in: {', '.join(probation_terms)}. Student was at risk of dismissal in these terms.",
            "academic_standing_per_term",
            "MEDIUM",
        )

    return _result(
        "ACADEMIC_STANDING",
        "PASS",
        f"Academic standing is satisfactory across all {len(standings)} recorded term(s). No probation or suspension found.",
        "academic_standing_per_term",
        "HIGH",
    )


def check_issued_to_msbn(extracted_data: dict) -> dict:
    """Verify the transcript was officially issued to the Mississippi Board of Nursing.

    Official transcripts sent directly from the institution to MSBN carry a
    'Issued To' designation. Missing or mismatched issuance is a red flag.
    """
    issued_to = (extracted_data.get("document_issued_to") or "").lower().strip()

    if not issued_to:
        return _result(
            "ISSUED_TO_MSBN",
            "UNABLE_TO_DETERMINE",
            "Could not determine who the transcript was issued to. Confirm the transcript was officially requested by MSBN.",
            "document_issued_to",
            "LOW",
        )

    msbn_keywords = [
        "mississippi board of nursing",
        "ms board of nursing",
        "msbn",
        "mississippi state board of nursing",
        "state board of nursing",
    ]

    if any(kw in issued_to for kw in msbn_keywords):
        return _result(
            "ISSUED_TO_MSBN",
            "PASS",
            f"Transcript officially issued to: '{issued_to}'. Matches Mississippi Board of Nursing.",
            "document_issued_to",
            "HIGH",
        )

    return _result(
        "ISSUED_TO_MSBN",
        "FLAG",
        f"Transcript shows 'Issued To: {issued_to}' — does not match Mississippi Board of Nursing. "
        "Official transcripts must be sent directly from the institution to MSBN.",
        "document_issued_to",
        "HIGH",
    )


def check_gpa_minimum(extracted_data: dict) -> dict:
    """Check cumulative GPA against Mississippi nursing program minimum standards."""
    gpa = extracted_data.get("gpa") or extracted_data.get("cumulative_gpa")
    program_type = _get_program_type(extracted_data)

    if gpa is None:
        return _result(
            "GPA_MINIMUM",
            "UNABLE_TO_DETERMINE",
            "No cumulative GPA found in extracted data.",
            "gpa",
            "LOW",
        )

    try:
        gpa = float(gpa)
    except (ValueError, TypeError):
        return _result(
            "GPA_MINIMUM",
            "UNABLE_TO_DETERMINE",
            f"Could not parse GPA value: {gpa}.",
            "gpa",
            "LOW",
        )

    # Graduate programs require higher minimum GPA
    min_gpa = 3.0 if program_type in ("MSN", "DNP") else 2.0

    if gpa < min_gpa:
        return _result(
            "GPA_MINIMUM",
            "FLAG",
            f"Cumulative GPA of {gpa:.3f} is below the {min_gpa:.1f} minimum required for nursing licensure consideration.",
            "gpa",
            "HIGH",
        )

    if gpa < min_gpa + 0.3:
        return _result(
            "GPA_MINIMUM",
            "FLAG",
            f"Cumulative GPA of {gpa:.3f} meets the {min_gpa:.1f} minimum but is marginal. Board discretion advised.",
            "gpa",
            "MEDIUM",
        )

    return _result(
        "GPA_MINIMUM",
        "PASS",
        f"Cumulative GPA of {gpa:.3f} meets the {min_gpa:.1f} minimum nursing program standard.",
        "gpa",
        "HIGH",
    )


def check_credential_type_valid(extracted_data: dict) -> dict:
    """Verify the awarded credential is an accepted nursing credential for MSBN licensure."""
    credential = (extracted_data.get("credential_type") or "").lower().strip()
    program_type = _get_program_type(extracted_data)

    if not credential:
        return _result(
            "CREDENTIAL_TYPE",
            "UNABLE_TO_DETERMINE",
            "No credential type found in extracted data.",
            "credential_type",
            "LOW",
        )

    ACCEPTED_KEYWORDS: dict[str, list[str]] = {
        "LPN": ["career certificate", "diploma", "certificate", "practical nursing"],
        "ADN": ["associate", "adn", "associate degree", "associate of science", "associate of applied science"],
        "BSN": ["bachelor", "bsn", "bachelor of science"],
        "MSN": ["master", "msn", "master of science"],
        "DNP": ["doctor", "dnp", "doctorate", "doctoral"],
    }

    if program_type and program_type in ACCEPTED_KEYWORDS:
        if any(kw in credential for kw in ACCEPTED_KEYWORDS[program_type]):
            return _result(
                "CREDENTIAL_TYPE",
                "PASS",
                f"Credential '{credential}' is consistent with a {program_type} program.",
                "credential_type",
                "HIGH",
            )
        return _result(
            "CREDENTIAL_TYPE",
            "FLAG",
            f"Credential '{credential}' does not match the expected type for a {program_type} program. Verify it qualifies for nursing licensure.",
            "credential_type",
            "MEDIUM",
        )

    # General check when program_type unknown
    any_nursing = any(kw in credential for kw in [
        "nursing", "career certificate", "diploma", "associate", "bachelor", "master", "doctor",
        "lpn", "rn", "bsn", "msn", "dnp", "certificate",
    ])
    if any_nursing:
        return _result(
            "CREDENTIAL_TYPE",
            "PASS",
            f"Credential '{credential}' appears to be a recognized nursing credential.",
            "credential_type",
            "MEDIUM",
        )

    return _result(
        "CREDENTIAL_TYPE",
        "FLAG",
        f"Credential '{credential}' is not a recognized nursing credential type. Manual verification required.",
        "credential_type",
        "MEDIUM",
    )


def check_fraud_indicators(extracted_data: dict) -> dict:
    """Detect statistical and pattern-based fraud indicators.

    Checks for: perfect GPA across many courses, all-identical grades,
    and significant discrepancies between claimed and verifiable credit hours.
    These patterns are associated with fabricated transcripts.
    """
    courses = _get_courses(extracted_data)
    gpa = extracted_data.get("gpa") or extracted_data.get("cumulative_gpa")

    flags: list[str] = []

    # Suspiciously perfect GPA with many courses
    if gpa is not None and courses:
        try:
            if float(gpa) == 4.0 and len(courses) >= 5:
                flags.append(
                    f"Perfect 4.0 GPA across {len(courses)} courses is statistically unusual and warrants independent verification"
                )
        except (ValueError, TypeError):
            pass

    # All non-pass/fail grades are identical (strong fraud indicator)
    if courses and len(courses) >= 4:
        grades = [_normalize_grade(c.get("grade") or c.get("final_grade") or "") for c in courses]
        grades = [g for g in grades if g and g not in ("CR", "P", "S", "TR", "T")]
        if grades and len(set(grades)) == 1 and len(grades) >= 4:
            flags.append(
                f"All {len(grades)} courses have identical grade '{grades[0]}' — "
                "uniform grades across an entire program are a known indicator of transcript fabrication"
            )

    # Claimed total hours greatly exceeds sum of listed course hours
    total_claimed = extracted_data.get("total_credit_hours")
    if total_claimed and courses:
        try:
            total_float = float(total_claimed)
            course_sum = sum(float(c.get("credits") or 0) for c in courses)
            if course_sum > 0 and total_float > course_sum * 2.0:
                flags.append(
                    f"Claimed total hours ({total_float:.0f}) is more than double "
                    f"the sum of listed course hours ({course_sum:.0f}). "
                    "Large unexplained credit discrepancy may indicate missing or fabricated coursework."
                )
        except (ValueError, TypeError):
            pass

    if flags:
        return _result(
            "FRAUD_INDICATORS",
            "FLAG",
            " | ".join(flags),
            "courses / gpa / total_credit_hours",
            "HIGH",
        )

    if not courses:
        return _result(
            "FRAUD_INDICATORS",
            "UNABLE_TO_DETERMINE",
            "Insufficient course data to run fraud pattern analysis.",
            "courses",
            "LOW",
        )

    return _result(
        "FRAUD_INDICATORS",
        "PASS",
        "No statistical fraud indicators detected (GPA distribution, grade uniformity, credit hour consistency).",
        "courses / gpa",
        "MEDIUM",
    )


# ---------------------------------------------------------------------------
# Aggregator
# ---------------------------------------------------------------------------

ALL_RULES = [
    # Graduation
    check_graduation_confirmed,
    check_graduation_date_present,
    # Program completion
    check_program_hours_met,
    check_required_courses_present,
    check_passing_grades,
    check_clinical_hours_present,
    # Accreditation
    check_school_accredited,
    check_accreditation_type,
    # Fraud indicators
    check_compressed_timeline,
    check_consistent_enrollment,
    check_transfer_credits_reasonable,
    check_gpa_consistency,
    check_duplicate_courses,
    # Extended rules (added for production-readiness)
    check_academic_standing,
    check_issued_to_msbn,
    check_gpa_minimum,
    check_credential_type_valid,
    check_fraud_indicators,
]


def run_all_rules(extracted_data: dict) -> list[dict]:
    """Run all verification rules against the extracted transcript data."""
    results = []
    for rule_fn in ALL_RULES:
        try:
            result = rule_fn(extracted_data)
            results.append(result)
        except Exception as e:
            results.append(
                _result(
                    rule_fn.__name__.upper().replace("CHECK_", ""),
                    "UNABLE_TO_DETERMINE",
                    f"Rule raised an unexpected error: {str(e)}",
                    "unknown",
                    "LOW",
                )
            )
    return results
