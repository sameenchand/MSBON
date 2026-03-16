"""Amazon Bedrock client wrapper for Nova models."""

import json
import boto3


_bedrock = boto3.client("bedrock-runtime", region_name="us-east-1")

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
    """Invoke an Amazon Nova model and return the text response."""
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

    response = _bedrock.invoke_model(
        modelId=model_id,
        contentType="application/json",
        accept="application/json",
        body=json.dumps(body),
    )

    response_body = json.loads(response["body"].read())
    return response_body["output"]["message"]["content"][0]["text"]


def invoke_nova_json(
    prompt: str,
    system_prompt: str = "",
    model_id: str = NOVA_LITE,
    max_tokens: int = 4096,
    temperature: float = 0.1,
) -> dict:
    """Invoke Nova and parse the response as JSON."""
    text = invoke_nova(prompt, system_prompt, model_id, max_tokens, temperature)

    # Try to extract JSON from the response
    text = text.strip()
    if text.startswith("```json"):
        text = text[7:]
    if text.startswith("```"):
        text = text[3:]
    if text.endswith("```"):
        text = text[:-3]
    text = text.strip()

    return json.loads(text)
