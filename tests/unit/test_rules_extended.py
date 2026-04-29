"""Unit tests for the 5 extended verification rules added in the MSBON POC.

Rules tested:
  - check_academic_standing
  - check_issued_to_msbn
  - check_gpa_minimum
  - check_credential_type_valid
  - check_fraud_indicators

Run with: pytest tests/unit/test_rules_extended.py -v
"""

import sys
import os

# Allow import without installing the package
sys.path.insert(0, os.path.join(os.path.dirname(__file__), "../../backend/lambdas/verify"))

from rules import (
    check_academic_standing,
    check_issued_to_msbn,
    check_gpa_minimum,
    check_credential_type_valid,
    check_fraud_indicators,
)


# ---------------------------------------------------------------------------
# check_academic_standing
# ---------------------------------------------------------------------------

class TestCheckAcademicStanding:
    def test_good_standing_all_terms(self):
        data = {
            "academic_standing_per_term": [
                {"term": "Fall 2022", "standing": "Good Standing"},
                {"term": "Spring 2023", "standing": "Good Standing"},
            ]
        }
        result = check_academic_standing(data)
        assert result["ruleId"] == "ACADEMIC_STANDING"
        assert result["status"] == "PASS"
        assert result["confidence"] == "HIGH"

    def test_probation_flagged_medium(self):
        data = {
            "academic_standing_per_term": [
                {"term": "Fall 2022", "standing": "Good Standing"},
                {"term": "Spring 2023", "standing": "Scholastic Probation"},
            ]
        }
        result = check_academic_standing(data)
        assert result["status"] == "FLAG"
        assert result["confidence"] == "MEDIUM"
        assert "Spring 2023" in result["explanation"]

    def test_suspension_flagged_high(self):
        data = {
            "academic_standing_per_term": [
                {"term": "Fall 2022", "standing": "Academic Suspension"},
            ]
        }
        result = check_academic_standing(data)
        assert result["status"] == "FLAG"
        assert result["confidence"] == "HIGH"
        assert "Fall 2022" in result["explanation"]

    def test_dismissal_flagged_high(self):
        data = {
            "academic_standing_per_term": [
                {"term": "Fall 2021", "standing": "Academic Dismissal"},
            ]
        }
        result = check_academic_standing(data)
        assert result["status"] == "FLAG"
        assert result["confidence"] == "HIGH"

    def test_missing_standing_data(self):
        result = check_academic_standing({})
        assert result["status"] == "UNABLE_TO_DETERMINE"

    def test_empty_standings_list(self):
        result = check_academic_standing({"academic_standing_per_term": []})
        assert result["status"] == "UNABLE_TO_DETERMINE"

    def test_suspension_takes_priority_over_probation(self):
        data = {
            "academic_standing_per_term": [
                {"term": "Fall 2022", "standing": "Scholastic Probation"},
                {"term": "Spring 2023", "standing": "Academic Suspension"},
            ]
        }
        result = check_academic_standing(data)
        assert result["status"] == "FLAG"
        assert result["confidence"] == "HIGH"


# ---------------------------------------------------------------------------
# check_issued_to_msbn
# ---------------------------------------------------------------------------

class TestCheckIssuedToMsbn:
    def test_full_board_name(self):
        data = {"document_issued_to": "Mississippi Board of Nursing"}
        result = check_issued_to_msbn(data)
        assert result["ruleId"] == "ISSUED_TO_MSBN"
        assert result["status"] == "PASS"
        assert result["confidence"] == "HIGH"

    def test_abbreviation_msbn(self):
        result = check_issued_to_msbn({"document_issued_to": "MSBN"})
        assert result["status"] == "PASS"

    def test_state_board_of_nursing(self):
        result = check_issued_to_msbn({"document_issued_to": "State Board of Nursing"})
        assert result["status"] == "PASS"

    def test_issued_to_student(self):
        data = {"document_issued_to": "John Smith"}
        result = check_issued_to_msbn(data)
        assert result["status"] == "FLAG"
        assert result["confidence"] == "HIGH"

    def test_issued_to_other_board(self):
        data = {"document_issued_to": "Louisiana State Board of Nursing"}
        result = check_issued_to_msbn(data)
        assert result["status"] == "FLAG"

    def test_missing_field(self):
        result = check_issued_to_msbn({})
        assert result["status"] == "UNABLE_TO_DETERMINE"

    def test_empty_string(self):
        result = check_issued_to_msbn({"document_issued_to": ""})
        assert result["status"] == "UNABLE_TO_DETERMINE"

    def test_case_insensitive(self):
        result = check_issued_to_msbn({"document_issued_to": "MISSISSIPPI BOARD OF NURSING"})
        assert result["status"] == "PASS"


# ---------------------------------------------------------------------------
# check_gpa_minimum
# ---------------------------------------------------------------------------

class TestCheckGpaMinimum:
    def test_lpn_above_minimum(self):
        data = {"gpa": 2.5, "program_type": "LPN"}
        result = check_gpa_minimum(data)
        assert result["ruleId"] == "GPA_MINIMUM"
        assert result["status"] == "PASS"

    def test_lpn_exactly_minimum(self):
        data = {"gpa": 2.0, "program_type": "LPN"}
        # 2.0 is exactly minimum but marginal (< 2.3), expect FLAG with MEDIUM
        result = check_gpa_minimum(data)
        assert result["status"] == "FLAG"
        assert result["confidence"] == "MEDIUM"

    def test_lpn_below_minimum(self):
        data = {"gpa": 1.8, "program_type": "LPN"}
        result = check_gpa_minimum(data)
        assert result["status"] == "FLAG"
        assert result["confidence"] == "HIGH"

    def test_bsn_passing(self):
        data = {"gpa": 3.2, "program_type": "BSN"}
        result = check_gpa_minimum(data)
        assert result["status"] == "PASS"

    def test_msn_below_grad_minimum(self):
        data = {"gpa": 2.8, "program_type": "MSN"}
        result = check_gpa_minimum(data)
        assert result["status"] == "FLAG"
        assert result["confidence"] == "HIGH"

    def test_msn_passing(self):
        data = {"gpa": 3.5, "program_type": "MSN"}
        result = check_gpa_minimum(data)
        assert result["status"] == "PASS"

    def test_no_gpa(self):
        result = check_gpa_minimum({"program_type": "ADN"})
        assert result["status"] == "UNABLE_TO_DETERMINE"

    def test_non_numeric_gpa(self):
        result = check_gpa_minimum({"gpa": "N/A"})
        assert result["status"] == "UNABLE_TO_DETERMINE"

    def test_gpa_key_cumulative_gpa(self):
        data = {"cumulative_gpa": 3.1, "program_type": "ADN"}
        result = check_gpa_minimum(data)
        assert result["status"] == "PASS"


# ---------------------------------------------------------------------------
# check_credential_type_valid
# ---------------------------------------------------------------------------

class TestCheckCredentialTypeValid:
    def test_career_certificate_for_lpn(self):
        data = {"credential_type": "Career Certificate", "program_type": "LPN"}
        result = check_credential_type_valid(data)
        assert result["ruleId"] == "CREDENTIAL_TYPE"
        assert result["status"] == "PASS"
        assert result["confidence"] == "HIGH"

    def test_associate_for_adn(self):
        data = {"credential_type": "Associate of Applied Science", "program_type": "ADN"}
        result = check_credential_type_valid(data)
        assert result["status"] == "PASS"

    def test_bachelor_for_bsn(self):
        data = {"credential_type": "Bachelor of Science in Nursing", "program_type": "BSN"}
        result = check_credential_type_valid(data)
        assert result["status"] == "PASS"

    def test_master_for_msn(self):
        data = {"credential_type": "Master of Science in Nursing", "program_type": "MSN"}
        result = check_credential_type_valid(data)
        assert result["status"] == "PASS"

    def test_wrong_credential_for_program(self):
        data = {"credential_type": "Associate Degree", "program_type": "BSN"}
        result = check_credential_type_valid(data)
        assert result["status"] == "FLAG"

    def test_unrecognized_credential(self):
        data = {"credential_type": "Diploma of Business Administration"}
        result = check_credential_type_valid(data)
        assert result["status"] == "FLAG"

    def test_no_credential(self):
        result = check_credential_type_valid({})
        assert result["status"] == "UNABLE_TO_DETERMINE"

    def test_generic_nursing_credential_no_program_type(self):
        data = {"credential_type": "Nursing Diploma"}
        result = check_credential_type_valid(data)
        assert result["status"] == "PASS"
        assert result["confidence"] == "MEDIUM"


# ---------------------------------------------------------------------------
# check_fraud_indicators
# ---------------------------------------------------------------------------

class TestCheckFraudIndicators:
    def _make_courses(self, grade: str, count: int, credits: float = 3.0) -> list[dict]:
        return [
            {"name": f"Course {i}", "number": f"NUR 10{i}", "grade": grade, "credits": credits, "term": "Fall 2022"}
            for i in range(count)
        ]

    def test_no_fraud_indicators(self):
        courses = [
            {"name": "Fundamentals", "grade": "B", "credits": 5},
            {"name": "Pharmacology", "grade": "A", "credits": 6},
            {"name": "Nursing II", "grade": "B", "credits": 5},
            {"name": "Med-Surg", "grade": "C", "credits": 5},
        ]
        result = check_fraud_indicators({"courses": courses, "gpa": 2.8, "total_credit_hours": 21})
        assert result["ruleId"] == "FRAUD_INDICATORS"
        assert result["status"] == "PASS"

    def test_perfect_gpa_many_courses_flagged(self):
        courses = self._make_courses("A", 6)
        result = check_fraud_indicators({"courses": courses, "gpa": 4.0, "total_credit_hours": 18})
        assert result["status"] == "FLAG"
        assert "4.0" in result["explanation"]

    def test_perfect_gpa_too_few_courses_not_flagged(self):
        courses = self._make_courses("A", 3)
        result = check_fraud_indicators({"courses": courses, "gpa": 4.0, "total_credit_hours": 9})
        # < 5 courses so perfect GPA alone doesn't flag
        assert result["status"] == "PASS"

    def test_all_identical_grades_flagged(self):
        courses = self._make_courses("B", 5)
        result = check_fraud_indicators({"courses": courses, "total_credit_hours": 15})
        assert result["status"] == "FLAG"
        assert "identical grade" in result["explanation"]

    def test_credit_hour_discrepancy_flagged(self):
        courses = self._make_courses("B", 4, credits=3.0)  # sum = 12
        result = check_fraud_indicators({
            "courses": courses,
            "total_credit_hours": 50,  # > 2x course sum
        })
        assert result["status"] == "FLAG"
        assert "double" in result["explanation"]

    def test_no_courses_unable_to_determine(self):
        result = check_fraud_indicators({})
        assert result["status"] == "UNABLE_TO_DETERMINE"

    def test_pass_grade_uniformity_ignored(self):
        # P/S/CR grades are pass/fail and should not trigger the identical-grade check
        courses = [
            {"name": f"Course {i}", "grade": "P", "credits": 3} for i in range(5)
        ]
        result = check_fraud_indicators({"courses": courses, "total_credit_hours": 15})
        assert result["status"] == "PASS"
