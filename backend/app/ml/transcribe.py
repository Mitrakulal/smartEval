"""Handwritten-answer transcription with Gemini vision and a demo fallback."""

from __future__ import annotations

import hashlib
import json
import logging
from pathlib import Path
from typing import Any, Dict, Optional

from app.core.config import settings
from app.ml.gemini import GeminiUnavailable, generate_json
from app.ml.preprocess import preprocess_image
from app.ml.types import TranscriptResult

logger = logging.getLogger("smarteval.transcribe")

FIXTURE_PATH = Path(__file__).resolve().parents[2] / "fixtures" / "demo_transcripts.json"

_LEGIBILITY_CONFIDENCE = {
    "high": 0.90,
    "medium": 0.65,
    "low": 0.35,
}


def _load_fixture() -> Dict[str, Any]:
    if not FIXTURE_PATH.is_file():
        return {}
    with FIXTURE_PATH.open("r", encoding="utf-8") as handle:
        data = json.load(handle)
    return data if isinstance(data, dict) else {}


def _fixture_for(question_number: str) -> Optional[Dict[str, Any]]:
    fixtures = _load_fixture()
    keys = [
        question_number,
        question_number.strip(),
        question_number.replace("(", "").replace(")", ""),
    ]
    for key in keys:
        value = fixtures.get(key)
        if isinstance(value, dict):
            return value
    return None


def _fixture_result(question_number: str, model: str = "fixture") -> Optional[TranscriptResult]:
    item = _fixture_for(question_number)
    if not item:
        return None
    legibility = str(item.get("legibility", "high")).lower()
    return TranscriptResult(
        text=str(item.get("transcript", "")),
        confidence=float(item.get("confidence", _LEGIBILITY_CONFIDENCE.get(legibility, 0.8))),
        legibility=legibility,
        contains_diagram=bool(item.get("contains_diagram", False)),
        model=model,
    )


def _cache_get(conn, cache_key: str) -> Optional[TranscriptResult]:
    if conn is None:
        return None
    row = conn.execute(
        "SELECT transcript, confidence, legibility, model FROM transcript_cache WHERE image_hash = ?;",
        (cache_key,),
    ).fetchone()
    if not row:
        return None
    # A fixture/empty cache must not prevent a later live Gemini test once a key
    # is configured.  Real model output remains a valid cache hit.
    if (
        row["model"] in {"fixture", "empty"}
        and settings.GEMINI_API_KEY
        and not settings.MOCK_TRANSCRIBE
    ):
        return None
    return TranscriptResult(
        text=row["transcript"],
        confidence=float(row["confidence"]),
        legibility=row["legibility"],
        contains_diagram=False,
        model=row["model"],
        cached=True,
    )


def _cache_put(conn, cache_key: str, result: TranscriptResult) -> None:
    if conn is None:
        return
    from app.core.db import now_iso

    with conn:
        conn.execute(
            """
            INSERT OR REPLACE INTO transcript_cache
                (image_hash, transcript, confidence, legibility, model, created_at)
            VALUES (?, ?, ?, ?, ?, ?);
            """,
            (
                cache_key,
                result.text,
                result.confidence,
                result.legibility,
                result.model,
                now_iso(),
            ),
        )


def _gemini_result(path: Path, question_number: str) -> TranscriptResult:
    prompt = (
        f"Transcribe the handwritten answer to question {question_number} exactly as written.\n"
        "Do not answer the question. Do not correct spelling or grammar. Preserve line breaks.\n"
        "Write [illegible] for words you cannot read. If the page is blank, return an empty transcript.\n"
        'Return JSON only: {"transcript":"...","legibility":"high|medium|low",'
        '"contains_diagram":false,"notes":""}'
    )
    data = generate_json(
        prompt=prompt,
        model=settings.GEMINI_OCR_MODEL,
        image_path=path,
        system_instruction=(
            "You are a careful handwriting transcription engine. "
            "Never solve or grade the question. Return JSON only."
        ),
    )

    transcript = data.get("transcript", "")
    if not isinstance(transcript, str):
        transcript = str(transcript or "")
    legibility = str(data.get("legibility", "medium")).lower()
    if legibility not in _LEGIBILITY_CONFIDENCE:
        legibility = "medium"
    return TranscriptResult(
        text=transcript,
        confidence=_LEGIBILITY_CONFIDENCE[legibility],
        legibility=legibility,
        contains_diagram=bool(data.get("contains_diagram", False)),
        model=settings.GEMINI_OCR_MODEL,
    )


def transcribe_image(
    image_path: Path,
    question_number: str,
    conn=None,
) -> TranscriptResult:
    """Preprocess, cache-check, transcribe, and cache one answer photo.

    The function is synchronous because the demo worker is a single background
    thread.  ``conn`` is optional so the function can also be used in a small
    script; when supplied, the transcript cache is read and written.  Cache keys
    include the question label so a repeated photo cannot reuse another question's
    transcript.
    """
    normalized_path, image_hash = preprocess_image(Path(image_path))

    # The same photo can in principle be uploaded against another question; the
    # transcript is only valid for the question label used during OCR, so scope
    # the cache key to (question number, normalized image hash).
    cache_key = hashlib.sha256(
        f"{question_number}\0{image_hash}".encode("utf-8")
    ).hexdigest()

    cached = _cache_get(conn, cache_key)
    if cached is not None:
        cached.normalized_path = str(normalized_path)
        logger.info("Transcript cache hit for %s", normalized_path.name)
        return cached

    result: Optional[TranscriptResult] = None
    if settings.GEMINI_API_KEY and not settings.MOCK_TRANSCRIBE:
        try:
            result = _gemini_result(normalized_path, question_number)
        except Exception as exc:  # SDK/network/parse failures all fall back
            logger.warning("Gemini transcription failed for %s: %s", normalized_path, exc)

    if result is None:
        result = _fixture_result(question_number)
        if result is None and not settings.DEMO_MODE:
            raise GeminiUnavailable(
                "Gemini transcription failed and no demo fixture exists for "
                f"question {question_number}"
            )
        if result is None:
            # A blank answer is still a valid result; the scorer will flag it.
            result = TranscriptResult(
                text="",
                confidence=0.0,
                legibility="low",
                contains_diagram=False,
                model="empty",
            )
        else:
            logger.warning("Using fixture transcript for question %s", question_number)

    result.normalized_path = str(normalized_path)
    _cache_put(conn, cache_key, result)
    return result
