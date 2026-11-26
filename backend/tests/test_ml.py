"""Focused tests for the local extraction/scoring pieces.

These tests do not need a Gemini key or network.  The scoring test swaps the
embedding function for deterministic unit vectors so the threshold/borderline
logic is tested independently of model weights.
"""

from __future__ import annotations

import json
from pathlib import Path

import numpy as np
import pytest

from app.core.config import settings
from app.core.db import get_conn, init_db, vec_to_blob
from app.ml import score as score_module
from app.ml.key_parse import parse_key_file
from app.ml.preprocess import preprocess_image
from app.ml.score import EMBEDDING_DIM, score_answer
from app.ml.transcribe import transcribe_image

ROOT = Path(__file__).resolve().parents[2]


def _unit(index: int) -> np.ndarray:
    vector = np.zeros(EMBEDDING_DIM, dtype=np.float32)
    vector[index] = 1.0
    return vector


def test_sample_three_question_key_parses() -> None:
    path = ROOT / "docs" / "samples" / "CN_CIE1_AnswerKey_3Q.docx"
    result = parse_key_file(path, path.name)

    assert [question["number"] for question in result.questions] == ["1a", "1b", "2a"]
    assert [question["max_marks"] for question in result.questions] == [3.0, 3.0, 6.0]
    assert [len(question["key_points"]) for question in result.questions] == [3, 3, 6]
    assert result.warnings == []


def test_fixtures_cover_the_demo_questions() -> None:
    key = json.loads((ROOT / "backend" / "fixtures" / "demo_key_draft.json").read_text(encoding="utf-8"))
    transcripts = json.loads(
        (ROOT / "backend" / "fixtures" / "demo_transcripts.json").read_text(encoding="utf-8")
    )

    labels = [question["number"] for question in key["questions"]]
    assert labels == ["1a", "1b", "2a"]
    assert labels == list(transcripts.keys())
    for question in key["questions"]:
        assert question["key_points"]
        assert transcripts[question["number"]]["transcript"]


def test_score_full_coverage_and_empty_answer(monkeypatch: pytest.MonkeyPatch) -> None:
    def fake_embed(texts):
        vectors = []
        for text in texts:
            lowered = str(text).lower()
            if "alpha" in lowered:
                vector = _unit(0)
            elif "beta" in lowered:
                vector = _unit(1)
            else:
                vector = _unit(2)
            vectors.append(vector.tolist())
        return vectors

    monkeypatch.setattr(score_module, "embed_texts", fake_embed)
    key_points = [
        {"id": 1, "text": "alpha", "embedding": vec_to_blob(_unit(0).tolist())},
        {"id": 2, "text": "beta", "embedding": vec_to_blob(_unit(1).tolist())},
    ]

    result = score_answer("alpha idea. beta idea.", key_points, 4.0, 0.55, 0.10)
    assert result.covered_count == 2
    assert result.coverage == 1.0
    assert result.suggested_marks == 4.0
    assert result.flags == []

    empty = score_answer("", key_points, 4.0, 0.55, 0.10)
    assert empty.covered_count == 0
    assert empty.suggested_marks == 0.0
    assert "degenerate_transcript" in empty.flags
    assert "zero_coverage" in empty.flags


def test_score_borderline(monkeypatch: pytest.MonkeyPatch) -> None:
    def fake_embed(texts):
        return [_unit(0).tolist() for _ in texts]

    monkeypatch.setattr(score_module, "embed_texts", fake_embed)
    # Cosine similarity with e0 is exactly 0.60, inside the 0.55 +/- 0.10 band.
    borderline = np.zeros(EMBEDDING_DIM, dtype=np.float32)
    borderline[0] = 0.6
    borderline[1] = 0.8
    key_points = [
        {"id": 1, "text": "alpha", "embedding": vec_to_blob(borderline.tolist())}
    ]

    result = score_answer("alpha", key_points, 3.0, 0.55, 0.10)
    assert result.matches[0]["covered"] is True
    assert result.matches[0]["borderline"] is True
    assert "borderline" in result.flags


def test_fixture_transcription_and_cache(tmp_path, monkeypatch: pytest.MonkeyPatch) -> None:
    db_path = tmp_path / "cache.db"
    monkeypatch.setattr(settings, "DATABASE_PATH", str(db_path))
    monkeypatch.setattr(settings, "DATA_DIR", str(tmp_path))
    monkeypatch.setattr(settings, "IMAGE_DIR", str(tmp_path / "images"))
    monkeypatch.setattr(settings, "KEY_DIR", str(tmp_path / "keys"))
    monkeypatch.setattr(settings, "MOCK_TRANSCRIBE", 1)
    monkeypatch.setattr(settings, "DEMO_MODE", 1)
    init_db(db_path)

    source = tmp_path / "photo.jpg"
    from PIL import Image

    Image.new("RGB", (100, 120), "white").save(source)
    conn = get_conn(db_path)
    try:
        first = transcribe_image(source, "1a", conn=conn)
        assert first.text.startswith("The OSI model")
        assert first.cached is False
        second = transcribe_image(source, "1a", conn=conn)
        assert second.cached is True
        assert second.text == first.text
        other_question = transcribe_image(source, "1b", conn=conn)
        assert other_question.cached is False
        assert other_question.text.startswith("Circuit switching")
        assert preprocess_image(source)[0].name.endswith("_norm.jpg")
    finally:
        conn.close()


def test_gemini_json_parsing_with_fake_client(
    tmp_path, monkeypatch: pytest.MonkeyPatch
) -> None:
    """Exercise the SDK wrapper without a network call or a real API key."""
    from app.ml import gemini as gemini_module

    class FakeResponse:
        text = '```json\n{"transcript": "hello", "legibility": "high"}\n```'

    class FakeModels:
        def generate_content(self, **kwargs):
            assert kwargs["model"] == "test-gemini-model"
            return FakeResponse()

    class FakeClient:
        models = FakeModels()

    from PIL import Image

    image = tmp_path / "photo.jpg"
    Image.new("RGB", (80, 100), "white").save(image)

    monkeypatch.setattr(settings, "GEMINI_API_KEY", "test-key")
    monkeypatch.setattr(settings, "GEMINI_OCR_MODEL", "test-gemini-model")
    monkeypatch.setattr(gemini_module, "_client", FakeClient())

    assert gemini_module.generate_json(prompt="read", image_path=image) == {
        "transcript": "hello",
        "legibility": "high",
    }
