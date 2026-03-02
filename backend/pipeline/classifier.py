from __future__ import annotations

import json
from dataclasses import dataclass
from typing import Any, Literal

import httpx
from anthropic import Anthropic
from pydantic import BaseModel, ValidationError

from app.core.config import get_settings

SYSTEM_PROMPT = """
You are a sales conversation analyst. Your job is to read a conversation thread between a salesperson and a lead and classify the current situation accurately.

You will be given the last 5 messages from the thread and the salesperson's business profile.

Your output must always be valid JSON. Nothing else. No explanation, no preamble.

Classify the following and return as JSON:

{
  "stage": one of [new_inquiry, quote_sent, meeting_proposed, post_meeting, long_term_stall],
  "intent": one of [positive, soft_stall, objection, negative, ambiguous],
  "follow_up_number": integer (infer from how many outbound messages have had no reply),
  "objection_type": one of [price, timing, trust, authority, fit, none],
  "channel": one of [gmail, whatsapp],
  "confidence": one of [high, medium, low]
}

Rules:
- If confidence is low, still return your best guess but set confidence to low
- Never return anything outside the JSON block
- If thread is ambiguous, set intent to ambiguous and confidence to low
""".strip()


@dataclass
class ClassificationError(Exception):
    message: str

    def __str__(self) -> str:
        return self.message


class ClassificationModel(BaseModel):
    stage: Literal["new_inquiry", "quote_sent", "meeting_proposed", "post_meeting", "long_term_stall"]
    intent: Literal["positive", "soft_stall", "objection", "negative", "ambiguous"]
    follow_up_number: int
    objection_type: Literal["price", "timing", "trust", "authority", "fit", "none"]
    channel: Literal["gmail", "whatsapp"]
    confidence: Literal["high", "medium", "low"]


def _build_user_prompt(context: dict[str, Any]) -> str:
    return json.dumps(context, ensure_ascii=True, indent=2)


def _extract_text(response) -> str:
    chunks: list[str] = []
    for block in response.content:
        text = getattr(block, "text", None)
        if text:
            chunks.append(text)
    return "\n".join(chunks).strip()


def _call_ollama(system_prompt: str, user_prompt: str, temperature: float) -> str:
    settings = get_settings()
    base_url = (settings.ollama_base_url or "http://localhost:11434").rstrip("/")
    model = settings.ollama_model or "qwen2.5:7b"

    payload = {
        "model": model,
        "messages": [
            {"role": "system", "content": system_prompt},
            {"role": "user", "content": user_prompt},
        ],
        "stream": False,
        "options": {"temperature": temperature},
    }

    print(f"DEBUG: Calling Ollama local model {model}...")
    with httpx.Client(timeout=600.0) as client:
        response = client.post(f"{base_url}/api/chat", json=payload)
        response.raise_for_status()
        data = response.json()

    return ((data.get("message") or {}).get("content") or "").strip()


def _call_openai(system_prompt: str, user_prompt: str, temperature: float) -> str:
    settings = get_settings()
    if not settings.openai_api_key:
        raise ClassificationError("OPENAI_API_KEY is required when AI_PROVIDER is openai")
    
    headers = {
        "Authorization": f"Bearer {settings.openai_api_key}",
        "Content-Type": "application/json",
    }
    payload = {
        "model": settings.openai_model or "gpt-4o",
        "messages": [
            {"role": "system", "content": system_prompt},
            {"role": "user", "content": user_prompt},
        ],
        "temperature": temperature,
    }

    print(f"DEBUG: Calling OpenAI model {payload['model']}...")
    with httpx.Client(timeout=600.0) as client:
        response = client.post("https://api.openai.com/v1/chat/completions", headers=headers, json=payload)
        response.raise_for_status()
        data = response.json()

    return (data["choices"][0]["message"]["content"] or "").strip()


def classify_thread(context: dict[str, Any]) -> dict[str, Any]:
    settings = get_settings()
    user_prompt = _build_user_prompt(context)
    provider = (settings.ai_provider or "ollama").lower()

    if provider == "ollama":
        raw_text = _call_ollama(SYSTEM_PROMPT, user_prompt, temperature=0.0)
    elif provider == "openai":
        raw_text = _call_openai(SYSTEM_PROMPT, user_prompt, temperature=0.0)
    else:
        if not settings.anthropic_api_key:
            raise ClassificationError("ANTHROPIC_API_KEY is required when AI_PROVIDER is not ollama/openai")
        client = Anthropic(api_key=settings.anthropic_api_key)
        response = client.messages.create(
            model="claude-sonnet-4-6",
            max_tokens=700,
            temperature=0,
            system=SYSTEM_PROMPT,
            messages=[
                {
                    "role": "user",
                    "content": user_prompt,
                }
            ],
        )
        raw_text = _extract_text(response)

    try:
        parsed = json.loads(raw_text)
    except json.JSONDecodeError:
        import re
        match = re.search(r"({.*})", raw_text, re.DOTALL)
        if match:
            try:
                parsed = json.loads(match.group(1))
            except:
                raise ClassificationError(f"Malformed JSON from classifier: {raw_text}")
        else:
             raise ClassificationError(f"No JSON found in classifier response: {raw_text}")

    try:
        result = ClassificationModel.model_validate(parsed)
    except ValidationError as exc:
        raise ClassificationError(f"Invalid classification payload: {exc}") from exc

    # if result.confidence == "low":
    #     raise ClassificationError("Classification confidence is low")

    return result.model_dump()
