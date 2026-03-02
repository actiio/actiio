from __future__ import annotations

import json
import re
from typing import Any

import httpx
from anthropic import Anthropic
from pydantic import BaseModel, ValidationError

from app.core.config import get_settings

SYSTEM_PROMPT = """
You are a sales follow-up pre-qualifier for a salesperson. 
Your job is to determine if a lead genuinely needs a follow-up 
message right now based on the conversation history.

Reply with valid JSON only. No explanation, no preamble.

{
  "should_follow_up": true or false,
  "reason": "one line explanation"
}

Return should_follow_up: false if:
- The lead gave a clear future timeline 
  (e.g. call me next month, check back in Q2, 
  lets reconnect after the holidays)
- The conversation ended naturally with no open question 
  or pending action
- The lead explicitly said they are not interested 
  or asked to be removed
- The salesperson sent the last message very recently 
  and it has not been long enough to follow up
- The lead already confirmed next steps and 
  is clearly still engaged

Return should_follow_up: true if:
- The lead went quiet after showing genuine interest
- A question was asked by the salesperson and never answered
- A proposal, quote, or pricing was sent with no response
- The conversation stalled mid-discussion with no clear reason
- The lead was warm but communication stopped without closure
""".strip()


class PreQualifierResponse(BaseModel):
    should_follow_up: bool
    reason: str


def _format_business_profile(profile: dict[str, Any]) -> str:
    if not profile:
        return "(none)"
    lines: list[str] = []
    for key, value in profile.items():
        lines.append(f"{key}: {value}")
    return "\n".join(lines)


def _format_messages(messages: list[dict[str, Any]]) -> str:
    rendered: list[str] = []

    for pair in messages[:5]:
        inbound = pair.get("inbound") if isinstance(pair, dict) else None
        outbound = pair.get("outbound") if isinstance(pair, dict) else None

        if inbound and inbound.get("content"):
            rendered.append(f"[Lead]: {inbound.get('content')}")
        if outbound and outbound.get("content"):
            rendered.append(f"[Salesperson]: {outbound.get('content')}")

    return "\n".join(rendered) if rendered else "(no recent messages)"


def _build_user_prompt(context: dict[str, Any]) -> str:
    business_profile = context.get("business_profile", {})
    messages = context.get("messages", [])
    return f"""Business context:
{_format_business_profile(business_profile)}

Conversation thread:
{_format_messages(messages)}

Should this lead receive a follow-up message right now?"""


def _extract_text(response: Any) -> str:
    chunks: list[str] = []
    for block in response.content:
        text = getattr(block, "text", None)
        if text:
            chunks.append(text)
    return "\n".join(chunks).strip()


def _call_claude(system_prompt: str, user_prompt: str) -> str:
    settings = get_settings()
    if not settings.anthropic_api_key:
        raise RuntimeError("ANTHROPIC_API_KEY is required for pre-qualification")

    client = Anthropic(api_key=settings.anthropic_api_key)
    response = client.messages.create(
        model="claude-haiku-4-5-20251001",
        max_tokens=200,
        temperature=0,
        system=system_prompt,
        messages=[{"role": "user", "content": user_prompt}],
    )
    return _extract_text(response)


def _call_openai(system_prompt: str, user_prompt: str) -> str:
    settings = get_settings()
    if not settings.openai_api_key:
        raise RuntimeError("OPENAI_API_KEY is required for pre-qualification when AI_PROVIDER is openai")

    headers = {
        "Authorization": f"Bearer {settings.openai_api_key}",
        "Content-Type": "application/json",
    }
    payload = {
        "model": settings.openai_model or "gpt-4o-mini",
        "messages": [
            {"role": "system", "content": system_prompt},
            {"role": "user", "content": user_prompt},
        ],
        "temperature": 0,
    }

    with httpx.Client(timeout=60.0) as client:
        response = client.post("https://api.openai.com/v1/chat/completions", headers=headers, json=payload)
        response.raise_for_status()
        data = response.json()
    return (data["choices"][0]["message"]["content"] or "").strip()


def _parse_json_response(raw_text: str) -> dict[str, Any]:
    try:
        return json.loads(raw_text)
    except json.JSONDecodeError:
        match = re.search(r"({.*})", raw_text, re.DOTALL)
        if not match:
            raise
        return json.loads(match.group(1))


def should_follow_up(context: dict[str, Any]) -> dict[str, Any]:
    fail_open = {
        "should_follow_up": True,
        "reason": "Pre-qualifier unavailable; defaulting to follow-up.",
    }

    try:
        user_prompt = _build_user_prompt(context)
        provider = (get_settings().ai_provider or "").lower()
        if provider == "openai":
            raw_text = _call_openai(SYSTEM_PROMPT, user_prompt)
        else:
            raw_text = _call_claude(SYSTEM_PROMPT, user_prompt)
        parsed = _parse_json_response(raw_text)
        result = PreQualifierResponse.model_validate(parsed)
        return result.model_dump()
    except (RuntimeError, ValueError, ValidationError, json.JSONDecodeError):
        return fail_open
    except Exception:
        return fail_open
