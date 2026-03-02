from __future__ import annotations

import json
from typing import Any, Literal, Optional

import httpx
from anthropic import Anthropic
from pydantic import BaseModel, ValidationError

from app.core.config import get_settings

SYSTEM_PROMPT = """
You are an expert sales follow-up writer. Your job is to write follow-up messages that feel human, specific, and contextually aware — not generic templates.

You will be given the salesperson's business profile, the conversation thread, the classified situation, and the desired outcome.

Your output must always be valid JSON. Nothing else. No explanation, no preamble.

Rules for each draft:
- Reference something specific from the conversation — never write generic openers
- Never start with "Just checking in" or "I wanted to follow up"
- Match the channel format: Gmail drafts include a subject line and proper structure, WhatsApp drafts are short and conversational
- Each draft must feel like it was written by a human who knows this lead

Tone definitions:
- soft: low pressure, open ended, gives the lead an easy way to re-engage
- balanced: clear and neutral, moves toward next step without pressure
- direct: action focused, assumes momentum, asks for a specific decision

Return as JSON:
{
  "draft_1": { "tone": "soft", "subject": "gmail only", "message": "..." },
  "draft_2": { "tone": "balanced", "subject": "gmail only", "message": "..." },
  "draft_3": { "tone": "direct", "subject": "gmail only", "message": "..." }
}
""".strip()


class DraftItem(BaseModel):
    tone: Literal["soft", "balanced", "direct"]
    subject: Optional[str] = None
    message: str


class DraftResponse(BaseModel):
    draft_1: DraftItem
    draft_2: DraftItem
    draft_3: DraftItem


def _build_user_prompt(context: dict[str, Any], classification: dict[str, Any], desired_outcome: str) -> str:
    payload = {
        "desired_outcome": desired_outcome,
        "classification": classification,
        "thread": context.get("thread", {}),
        "messages": context.get("messages", []),
        "business_profile": context.get("business_profile", {}),
    }
    return json.dumps(payload, ensure_ascii=True, indent=2)


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

    print(f"DEBUG: Calling Ollama local model {model} for drafts...")
    with httpx.Client(timeout=600.0) as client:
        response = client.post(f"{base_url}/api/chat", json=payload)
        response.raise_for_status()
        data = response.json()

    return ((data.get("message") or {}).get("content") or "").strip()


def _call_openai(system_prompt: str, user_prompt: str, temperature: float) -> str:
    settings = get_settings()
    if not settings.openai_api_key:
        raise ValueError("OPENAI_API_KEY is required when AI_PROVIDER is openai")
    
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

    print(f"DEBUG: Calling OpenAI model {payload['model']} for drafts...")
    with httpx.Client(timeout=600.0) as client:
        response = client.post("https://api.openai.com/v1/chat/completions", headers=headers, json=payload)
        response.raise_for_status()
        data = response.json()

    return (data["choices"][0]["message"]["content"] or "").strip()


def generate_drafts(context: dict[str, Any], classification: dict[str, Any], desired_outcome: str) -> dict[str, Any]:
    settings = get_settings()
    user_prompt = _build_user_prompt(context, classification, desired_outcome)
    provider = (settings.ai_provider or "ollama").lower()

    if provider == "ollama":
        raw_text = _call_ollama(SYSTEM_PROMPT, user_prompt, temperature=0.4)
    elif provider == "openai":
        raw_text = _call_openai(SYSTEM_PROMPT, user_prompt, temperature=0.4)
    else:
        if not settings.anthropic_api_key:
            raise ValueError("ANTHROPIC_API_KEY is required when AI_PROVIDER is not ollama/openai")
        client = Anthropic(api_key=settings.anthropic_api_key)
        response = client.messages.create(
            model="claude-sonnet-4-6",
            max_tokens=1200,
            temperature=0.4,
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
                 raise ValueError(f"Malformed JSON from draft generator: {raw_text}")
        else:
            raise ValueError(f"No JSON found in draft generator response: {raw_text}")

    try:
        drafts = DraftResponse.model_validate(parsed)
    except ValidationError as exc:
        raise ValueError(f"Invalid drafts payload: {exc}") from exc

    return drafts.model_dump()
