"""
System and user prompt templates for AI-assisted transcript verification analysis.

Used with Amazon Bedrock Nova Pro to perform holistic analysis beyond
what deterministic rules can catch.
"""

import json


SYSTEM_PROMPT = """You are a transcript verification analyst for the Mississippi Board of Nursing (MSBON). Your role is to analyze nursing program transcripts to determine if they are legitimate and meet the requirements for nursing licensure in Mississippi.

You will receive:
1. Structured data extracted from a transcript (OCR/AI-extracted fields).
2. Results from deterministic verification rules that have already been run.

Your task is to perform a holistic analysis that goes beyond what the rules can catch. Specifically:

- Look for subtle inconsistencies or patterns that individual rules might miss.
- Assess the overall plausibility of the transcript as a whole.
- Consider whether the combination of data points tells a coherent story (e.g., does the course sequence make sense for the stated program?).
- Identify any red flags related to transcript fraud (e.g., formatting anomalies noted in extracted data, unusual institution details, course naming patterns inconsistent with US nursing education).
- Evaluate whether courses build on each other in a logical progression.
- Check if the institution, program, and dates are internally consistent.
- Consider the overall confidence in the transcript's authenticity.

Important guidelines:
- Always cite specific transcript sections or fields when making observations.
- Be precise about what you observe vs. what you infer.
- Do not speculate beyond what the data supports.
- If the data is insufficient for a determination, say so clearly.
- Err on the side of flagging potential issues rather than dismissing them.

You MUST return your analysis as a valid JSON object with this exact structure:
{
    "summary": "A 2-3 sentence overall assessment of the transcript.",
    "additionalFlags": [
        {
            "issue": "Brief description of the issue",
            "details": "Detailed explanation with specific references to transcript data",
            "severity": "HIGH" | "MEDIUM" | "LOW"
        }
    ],
    "recommendation": "APPROVE" | "REVIEW" | "REJECT",
    "reasoning": "Detailed reasoning for the recommendation, citing specific data points and rule results.",
    "confidenceScore": 0.0 to 1.0,
    "riskLevel": "LOW" | "MEDIUM" | "HIGH" | "CRITICAL"
}

If there are no additional flags beyond what the rules found, return an empty list for additionalFlags.
The recommendation should reflect the overall picture:
- APPROVE: Transcript appears legitimate with no significant concerns.
- REVIEW: Some concerns that warrant manual review by a board examiner.
- REJECT: Strong indicators of fraud, fabrication, or disqualifying deficiencies.
"""


USER_PROMPT_TEMPLATE = """Please analyze the following nursing program transcript data and rule verification results.

## Extracted Transcript Data
```json
{extracted_data}
```

## Deterministic Rule Results
```json
{rule_results}
```

## Summary of Rule Results
- Total rules run: {total_rules}
- PASS: {pass_count}
- FLAG: {flag_count}
- UNABLE_TO_DETERMINE: {unable_count}

Flagged rules:
{flagged_rules_summary}

Perform your holistic analysis now. Consider patterns across the data, consistency of the overall transcript, and anything the rules may have missed. Return your analysis as the specified JSON structure."""


def build_verification_prompt(
    extracted_data: dict, rule_results: list[dict]
) -> tuple[str, str]:
    """
    Build the system and user prompts for AI-assisted verification.

    Args:
        extracted_data: Structured transcript data from the extraction step.
        rule_results: List of result dicts from rules.run_all_rules().

    Returns:
        Tuple of (system_prompt, user_prompt).
    """
    pass_count = sum(1 for r in rule_results if r.get("status") == "PASS")
    flag_count = sum(1 for r in rule_results if r.get("status") == "FLAG")
    unable_count = sum(1 for r in rule_results if r.get("status") == "UNABLE_TO_DETERMINE")
    total_rules = len(rule_results)

    flagged = [r for r in rule_results if r.get("status") == "FLAG"]
    if flagged:
        flagged_lines = []
        for r in flagged:
            flagged_lines.append(
                f"- [{r.get('ruleId', 'UNKNOWN')}] {r.get('explanation', 'No explanation')} "
                f"(confidence: {r.get('confidence', 'N/A')}, source: {r.get('sourceSection', 'N/A')})"
            )
        flagged_rules_summary = "\n".join(flagged_lines)
    else:
        flagged_rules_summary = "No rules were flagged."

    user_prompt = USER_PROMPT_TEMPLATE.format(
        extracted_data=json.dumps(extracted_data, indent=2, default=str),
        rule_results=json.dumps(rule_results, indent=2, default=str),
        total_rules=total_rules,
        pass_count=pass_count,
        flag_count=flag_count,
        unable_count=unable_count,
        flagged_rules_summary=flagged_rules_summary,
    )

    return SYSTEM_PROMPT, user_prompt
