"""Thin, testable wrapper around the Google Gen AI SDK.

Only two things use Gemini in SmartEval:

* answer-key structuring (text/PDF input)
* handwritten-answer transcription (image input)

Both requests ask for JSON and are parsed defensively.  No mark is ever taken
from Gemini's output directly.
"""

from __future__ import annotations

import json
import logging
import re
import threading
import time
from pathlib import Path
from typing import Any, Dict, Optional

from app.core.config import settings

logger = logging.getLogger("smarteval.gemini")


class GeminiUnavailable(RuntimeError):
    """Raised when the API key is missing or the configured model cannot run."""


_client = None
_client_lock = threading.Lock()


def _get_client():
    global _client
    if not settings.GEMINI_API_KEY:
        raise GeminiUnavailable("GEMINI_API_KEY is not configured")
    if _client is None:
        with _client_lock:
            if _client is None:
                from google import genai

                _client = genai.Client(api_key=settings.GEMINI_API_KEY)
    return _client


def _strip_json_fences(text: str) -> str:
    text = text.strip()
    if text.startswith("```"):
        text = re.sub(r"^```(?:json)?\s*", "", text, flags=re.IGNORECASE)
        text = re.sub(r"\s*```$", "", text)
    start = text.find("{")
    end = text.rfind("}")
    if start == -1 or end <= start:
        raise ValueError("Gemini response did not contain a JSON object")
    return text[start : end + 1]


def generate_json(
    *,
    prompt: str,
    model: Optional[str] = None,
    image_path: Optional[Path] = None,
    document_path: Optional[Path] = None,
    system_instruction: Optional[str] = None,
) -> Dict[str, Any]:
    """Call Gemini and return one parsed JSON object.

    ``image_path`` and ``document_path`` are mutually exclusive; the latter is
    used only for a scanned-PDF key (not required for the demo, but supported by
    the API).
    """
    if image_path is not None and document_path is not None:
        raise ValueError("Pass only one of image_path or document_path")

    from google.genai import types

    client = _get_client()
    model_name = model or settings.GEMINI_OCR_MODEL

    contents: list[Any] = []
    if image_path is not None:
        source = Path(image_path)
        contents.append(
            types.Part.from_bytes(data=source.read_bytes(), mime_type="image/jpeg")
        )
    elif document_path is not None:
        source = Path(document_path)
        contents.append(
            types.Part.from_bytes(
                data=source.read_bytes(), mime_type="application/pdf"
            )
        )
    contents.append(prompt)

    config = types.GenerateContentConfig(
        temperature=0.0,
        response_mime_type="application/json",
        system_instruction=system_instruction,
    )

    attempts = max(0, int(settings.GEMINI_MAX_RETRIES)) + 1
    last_error: Optional[Exception] = None
    for attempt in range(1, attempts + 1):
        try:
            response = client.models.generate_content(
                model=model_name,
                contents=contents,
                config=config,
            )
            text = getattr(response, "text", None)
            if not text:
                raise ValueError("Gemini returned an empty response")
            return json.loads(_strip_json_fences(text))
        except Exception as exc:  # SDK/network/JSON errors all retry once
            last_error = exc
            logger.warning(
                "Gemini call failed (model=%s attempt=%d/%d): %s",
                model_name,
                attempt,
                attempts,
                exc,
            )
            if attempt < attempts:
                time.sleep(1.5)

    raise GeminiUnavailable(f"Gemini request failed: {last_error}") from last_error
