from openai import OpenAI
from app.core.config import get_settings
import logging
import time

logger = logging.getLogger(__name__)

# Each task uses a different model
# so they have separate rate limit buckets
# Simple tasks use smaller/faster models
# Complex tasks use the best model

# Simple YES/NO classification
# Fast, lightweight, high rate limit
LEAD_CLASSIFICATION_MODEL = "llama-3.1-8b-instant"

# Simple judgment call
# Different bucket from lead classifier
PRE_QUALIFICATION_MODEL = "gemma2-9b-it"

# Complex JSON output with nuanced analysis
# Needs best model for accuracy
THREAD_CLASSIFICATION_MODEL = "llama-3.3-70b-versatile"

# Best writing quality for drafts
# Same model as thread classification
# but separate calls so limits shared
DRAFT_GENERATION_MODEL = "llama-3.3-70b-versatile"

# Backward compatibility
DEFAULT_MODEL = THREAD_CLASSIFICATION_MODEL

def get_ai_client() -> OpenAI:
    settings = get_settings()
    return OpenAI(
        base_url="https://api.groq.com/openai/v1",
        api_key=settings.groq_api_key,
    )

def call_ai_with_fallback(
    messages: list,
    max_tokens: int = 2000,
    temperature: float = 0.0,
    task_type: str = "classification"
) -> str:
    """
    Call Groq AI with smart model routing.
    
    task_type options:
    - "lead_classification" → llama-3.1-8b-instant
      (fast, simple YES/NO, high daily limit)
    
    - "pre_qualification" → gemma2-9b-it
      (simple judgment, separate rate bucket)
    
    - "classification" → llama-3.3-70b-versatile
      (complex JSON, thread analysis)
    
    - "generation" → llama-3.3-70b-versatile
      (draft writing, best quality)
    """
    model_map = {
        "lead_classification": LEAD_CLASSIFICATION_MODEL,
        "pre_qualification": PRE_QUALIFICATION_MODEL,
        "classification": THREAD_CLASSIFICATION_MODEL,
        "generation": DRAFT_GENERATION_MODEL,
    }
    
    model = model_map.get(
        task_type, 
        THREAD_CLASSIFICATION_MODEL
    )
    
    client = get_ai_client()
    max_retries = 3
    last_error = None
    
    for attempt in range(max_retries):
        try:
            logger.info(
                f"Calling Groq [{task_type}]: "
                f"{model} (attempt {attempt + 1})"
            )
            
            response = client.chat.completions.create(
                model=model,
                messages=messages,
                max_tokens=max_tokens,
                temperature=temperature,
            )
            
            content = response.choices[0].message.content
            
            if content:
                logger.info(
                    f"Groq [{task_type}] success: {model}"
                )
                return content.strip()
            
            logger.warning(
                f"Groq [{task_type}] empty content"
            )
            
        except Exception as e:
            last_error = e
            error_str = str(e)
            
            if '429' in error_str:
                wait_time = 5 * (attempt + 1)
                logger.warning(
                    f"Groq rate limited [{task_type}]. "
                    f"Waiting {wait_time}s."
                )
                time.sleep(wait_time)
            else:
                logger.warning(
                    f"Groq [{task_type}] failed "
                    f"(attempt {attempt + 1}): {e}"
                )
                time.sleep(1.0)
            
            continue
    
    raise Exception(
        f"Groq [{task_type}] failed after "
        f"{max_retries} attempts. "
        f"Last error: {last_error}"
    )

def clean_json_response(text: str) -> str:
    """Strip markdown code blocks from JSON."""
    text = text.strip()
    if text.startswith("```json"):
        text = text[7:]
    if text.startswith("```"):
        text = text[3:]
    if text.endswith("```"):
        text = text[:-3]
    return text.strip()
