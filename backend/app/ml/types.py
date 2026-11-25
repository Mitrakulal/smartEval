"""Shared data types for the SmartEval extraction and scoring pipeline.

These types are the boundary between the API layer (Dev A) and the AI pipeline
(Dev B).  Keep them free of FastAPI/Pydantic imports so they can be used from a
background worker, a pytest, or a one-off script.
"""

from dataclasses import dataclass, field
from typing import Any, Dict, List, Optional


@dataclass
class KeyParseResult:
    """Structured result of parsing an answer-key document."""

    questions: List[Dict[str, Any]] = field(default_factory=list)
    warnings: List[str] = field(default_factory=list)


@dataclass
class TranscriptResult:
    """Result of reading one handwritten answer photo."""

    text: str
    confidence: float
    legibility: str
    contains_diagram: bool
    model: str
    cached: bool = False
    # Internal only: the normalized JPEG that was actually sent to Gemini.
    normalized_path: Optional[str] = None


@dataclass
class ScoreResult:
    """Result of comparing a transcript against one question's key points."""

    matches: List[Dict[str, Any]] = field(default_factory=list)
    coverage: float = 0.0
    covered_count: int = 0
    key_point_count: int = 0
    suggested_marks: float = 0.0
    flags: List[str] = field(default_factory=list)
