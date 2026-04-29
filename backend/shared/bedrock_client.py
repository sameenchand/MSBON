"""Amazon Bedrock client wrapper for Nova models."""

import json
import logging
import time

import boto3
from botocore.exceptions import ClientError


logger = logging.getLogger(__name__)
_bedrock = boto3.client("bedrock-runtime", region_name="us-east-1")

_RETRYABLE_CODES = {"ThrottlingException", "ServiceUnavailableException", "ModelTimeoutException"}

# Amazon Nova model IDs
NOVA_LITE = "amazon.nova-lite-v1:0"
NOVA_PRO = "amazon.nova-pro-v1:0"
NOVA_MICRO = "amazon.nova-micro-v1:0"


def invoke_nova(
    prompt: str,
    system_prompt: str = "",
    model_id: str = NOVA_LITE,
    max_tokens: int = 4096,
    temperature: float = 0.1,
) -> str:
    """Invoke an Amazon Nova model and return the text response.

    Retries up to 4 times with exponential backoff on throttling or transient
    service errors (ThrottlingException, ServiceUnavailableException, ModelTimeoutException).
    """
    messages = [{"role": "user", "content": [{"text": prompt}]}]

    body = {
        "messages": messages,
        "inferenceConfig": {
            "maxTokens": max_tokens,
            "temperature": temperature,
        },
    }

    if system_prompt:
        body["system"] = [{"text": system_prompt}]

    max_attempts = 4
    for attempt in range(max_attempts):
        try:
            response = _bedrock.invoke_model(
                modelId=model_id,
                contentType="application/json",
                accept="application/json",
                body=json.dumps(body),
            )
            response_body = json.loads(response["body"].read())
            return response_body["output"]["message"]["content"][0]["text"]
        except ClientError as e:
            code = e.response["Error"]["Code"]
            if code in _RETRYABLE_CODES and attempt < max_attempts - 1:
                wait = 2 ** attempt  # 1s, 2s, 4s
                logger.warning(
                    "Bedrock %s (attempt %d/%d), retrying in %ds",
                    code, attempt + 1, max_attempts, wait,
                )
                time.sleep(wait)
            else:
                raise


def invoke_nova_json(
    prompt: str,
    system_prompt: str = "",
    model_id: str = NOVA_LITE,
    max_tokens: int = 4096,
    temperature: float = 0.1,
) -> dict:
    """Invoke Nova and parse the response as JSON.

    If the model output is truncated (unterminated JSON), attempts to recover
    by closing any open braces/brackets before parsing.
    """
    text = invoke_nova(prompt, system_prompt, model_id, max_tokens, temperature)

    # Strip markdown code fences if present
    text = text.strip()
    if text.startswith("```json"):
        text = text[7:]
    if text.startswith("```"):
        text = text[3:]
    if text.endswith("```"):
        text = text[:-3]
    text = text.strip()

    # First try clean parse
    try:
        return json.loads(text)
    except json.JSONDecodeError:
        pass

    # Attempt recovery: truncate at the last complete top-level field boundary
    # and close any open braces/brackets so we get partial data rather than an error.
    depth = 0
    in_string = False
    escape_next = False
    last_safe = 0
    for i, ch in enumerate(text):
        if escape_next:
            escape_next = False
            continue
        if ch == "\\" and in_string:
            escape_next = True
            continue
        if ch == '"':
            in_string = not in_string
            continue
        if in_string:
            continue
        if ch in "{[":
            depth += 1
        elif ch in "}]":
            depth -= 1
            if depth == 0:
                last_safe = i + 1

    # Close unclosed braces
    truncated = text[:last_safe] if last_safe > 0 else text
    open_braces = truncated.count("{") - truncated.count("}")
    open_brackets = truncated.count("[") - truncated.count("]")
    truncated += "]" * open_brackets + "}" * open_braces

    return json.loads(truncated)
