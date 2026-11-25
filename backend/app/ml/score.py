"""Local semantic scoring.

Gemini reads the handwriting.  This module compares the resulting transcript
with the lecturer-confirmed key points using a local MiniLM sentence embedding
model and cosine similarity.  No student text or marks are sent to Gemini here.
"""

from __future__ import annotations

import hashlib
import logging
import math
import re
import threading
from typing import Any, Dict, List, Optional, Sequence

import numpy as np

from app.core.config import settings
from app.ml.types import ScoreResult

logger = logging.getLogger("smarteval.score")

EMBEDDING_DIM = 384

_model = None
_tokenizer = None
_model_lock = threading.Lock()


def _load_model():
    """Load MiniLM once, using transformers directly.

    The installed sentence-transformers release currently fails to construct its
    pooling module with this transformers version, so we use the underlying
    AutoModel + mean pooling.  The vectors are identical in spirit and remain
    384-dimensional, which is what the existing database and tests expect.
    """
    global _model, _tokenizer
    if _model is not None and _tokenizer is not None:
        return _model, _tokenizer

    with _model_lock:
        if _model is not None and _tokenizer is not None:
            return _model, _tokenizer

        from transformers import AutoModel, AutoTokenizer

        model_name = settings.EMBEDDING_MODEL or "sentence-transformers/all-MiniLM-L6-v2"
        logger.info("Loading local embedding model %s", model_name)
        _tokenizer = AutoTokenizer.from_pretrained(model_name)
        _model = AutoModel.from_pretrained(model_name)
        _model.eval()
        logger.info("Embedding model ready")
        return _model, _tokenizer


def _hash_embedding(text: str) -> List[float]:
    """Deterministic fallback when the local model is unavailable.

    This is intentionally not used when MiniLM can load.  It keeps the API
    functional (and 384-dimensional) on a machine with no model cache instead of
    crashing every confirmation/upload.
    """
    vector = np.zeros(EMBEDDING_DIM, dtype=np.float32)
    tokens = re.findall(r"[a-zA-Z0-9']+", text.lower()) or [text.lower()]
    for token in tokens:
        digest = hashlib.sha256(token.encode("utf-8")).digest()
        index = int.from_bytes(digest[:4], "big") % EMBEDDING_DIM
        sign = 1.0 if digest[4] & 1 else -1.0
        vector[index] += sign
    norm = float(np.linalg.norm(vector))
    if norm > 0:
        vector /= norm
    return vector.tolist()


def embed_texts(texts: Sequence[str]) -> List[List[float]]:
    """Return normalized 384-dimensional embeddings for the given strings."""
    cleaned = [str(text or "").strip() for text in texts]
    if not cleaned:
        return []

    try:
        import torch
        from torch.nn import functional as F

        model, tokenizer = _load_model()
        vectors: List[List[float]] = []
        batch_size = 16
        with torch.no_grad():
            for start in range(0, len(cleaned), batch_size):
                batch = cleaned[start : start + batch_size]
                encoded = tokenizer(
                    batch,
                    padding=True,
                    truncation=True,
                    max_length=256,
                    return_tensors="pt",
                )
                output = model(**encoded)
                hidden = output.last_hidden_state
                mask = encoded["attention_mask"].unsqueeze(-1).float()
                pooled = (hidden * mask).sum(dim=1) / mask.sum(dim=1).clamp(min=1e-9)
                normalized = F.normalize(pooled, p=2, dim=1)
                vectors.extend(normalized.cpu().numpy().astype(float).tolist())
        return vectors
    except Exception as exc:
        logger.warning(
            "Local embedding model unavailable (%s); using deterministic fallback",
            exc,
        )
        return [_hash_embedding(text) for text in cleaned]


def _decode_embedding(value: Any) -> Optional[np.ndarray]:
    if value is None:
        return None
    if isinstance(value, (bytes, bytearray, memoryview)):
        if not value:
            return None
        return np.frombuffer(bytes(value), dtype=np.float32).astype(np.float32)
    if isinstance(value, (list, tuple, np.ndarray)):
        return np.asarray(value, dtype=np.float32)
    return None


def split_sentences(transcript: str) -> List[str]:
    """Split a transcript into short comparison units."""
    text = (transcript or "").strip()
    if not text:
        return []

    pieces: List[str] = []
    for line in re.split(r"\n+", text):
        line = line.strip()
        if not line:
            continue
        pieces.extend(
            part.strip()
            for part in re.split(r"(?<=[.!?])\s+", line)
            if part.strip()
        )
    return pieces[:60]


def round_half(value: float) -> float:
    """Round a non-negative mark to the nearest 0.5 (half up)."""
    return math.floor(float(value) * 2.0 + 0.5) / 2.0


def _normalise_embedding(vector: np.ndarray) -> np.ndarray:
    norm = float(np.linalg.norm(vector))
    if norm <= 1e-12:
        return vector
    return vector / norm


def score_answer(
    transcript: str,
    key_points: List[Dict[str, Any]],
    max_marks: float,
    point_threshold: float,
    borderline_band: float,
) -> ScoreResult:
    """Compare one transcript against a question's key points."""
    points = list(key_points or [])
    point_count = len(points)
    if point_count == 0:
        return ScoreResult(
            matches=[],
            coverage=0.0,
            covered_count=0,
            key_point_count=0,
            suggested_marks=0.0,
            flags=["zero_coverage"],
        )

    text = (transcript or "").strip()
    words = re.findall(r"\S+", text)
    flags: List[str] = []
    if len(words) < 3:
        flags.append("degenerate_transcript")

    sentences = split_sentences(text)
    answer_embeddings: List[np.ndarray] = []
    if sentences:
        answer_embeddings = [
            _normalise_embedding(np.asarray(vector, dtype=np.float32))
            for vector in embed_texts(sentences)
        ]

    key_embeddings: List[np.ndarray] = []
    for point in points:
        vector = _decode_embedding(point.get("embedding"))
        if vector is None or vector.size != EMBEDDING_DIM:
            vector = np.asarray(
                embed_texts([str(point.get("text", ""))])[0], dtype=np.float32
            )
        key_embeddings.append(_normalise_embedding(vector))

    matches: List[Dict[str, Any]] = []
    covered_count = 0
    has_borderline = False

    for index, (point, key_vector) in enumerate(zip(points, key_embeddings)):
        if answer_embeddings:
            similarities = np.asarray(
                [float(np.dot(key_vector, answer_vector)) for answer_vector in answer_embeddings],
                dtype=np.float32,
            )
            similarity = float(np.max(similarities))
        else:
            similarity = 0.0

        similarity = max(-1.0, min(1.0, similarity))
        covered = similarity >= float(point_threshold)
        borderline = abs(similarity - float(point_threshold)) <= float(
            borderline_band
        )
        if covered:
            covered_count += 1
        if borderline:
            has_borderline = True

        matches.append(
            {
                "id": int(point.get("id", index + 1)),
                "text": str(point.get("text", "")),
                "covered": bool(covered),
                "similarity": round(similarity, 4),
                "borderline": bool(borderline),
            }
        )

    if covered_count == 0:
        flags.append("zero_coverage")
    if has_borderline:
        flags.append("borderline")

    coverage = covered_count / point_count
    suggested = round_half(float(max_marks) * coverage)

    return ScoreResult(
        matches=matches,
        coverage=round(coverage, 4),
        covered_count=covered_count,
        key_point_count=point_count,
        suggested_marks=suggested,
        flags=flags,
    )
