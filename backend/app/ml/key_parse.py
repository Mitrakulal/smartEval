"""Answer-key parsing.

The primary path is deterministic local text/table extraction from a born-digital
DOCX or PDF.  Gemini is used only when the local structure is not usable (for
example, an unusual layout or a scanned PDF).  This keeps the demo reliable while
still letting Gemini handle documents that a simple parser cannot.

The output is intentionally plain dictionaries so the API layer can wrap them in
the frozen contract models without importing Pydantic here.
"""

from __future__ import annotations

import json
import logging
import re
from pathlib import Path
from typing import Any, Dict, List, Optional, Tuple

from app.core.config import settings
from app.ml.gemini import generate_json
from app.ml.types import KeyParseResult

logger = logging.getLogger("smarteval.key_parse")

QUESTION_RE = re.compile(
    r"^\s*(?:Question|Q)\s*([0-9]+(?:\s*\([a-zA-Z]\))?)"
    r"\s*(?:[\[\(]\s*([0-9]+(?:\.[0-9]+)?)\s*marks?\s*[\]\)])?\s*$",
    re.IGNORECASE,
)

FIXTURE_PATH = Path(__file__).resolve().parents[2] / "fixtures" / "demo_key_draft.json"


def _clean(value: Any) -> str:
    return re.sub(r"\s+", " ", str(value or "")).strip()


def _normalise_number(label: str) -> str:
    """Make ``1(a)`` and ``1a`` the same stable label."""
    label = _clean(label)
    label = re.sub(r"\(([a-zA-Z])\)", r"\1", label)
    return re.sub(r"\s+", "", label)


def _table_rows(table: Any) -> List[List[str]]:
    rows: List[List[str]] = []
    for row in table.rows:
        rows.append([_clean(cell.text) for cell in row.cells])
    return rows


def _extract_docx(path: Path) -> Tuple[List[str], List[List[List[str]]]]:
    from docx import Document

    doc = Document(str(path))
    paragraphs = [_clean(p.text) for p in doc.paragraphs]
    tables = [_table_rows(table) for table in doc.tables]
    return paragraphs, tables


def _extract_pdf(path: Path) -> Tuple[List[str], List[List[List[str]]]]:
    import pdfplumber

    paragraphs: List[str] = []
    tables: List[List[List[str]]] = []
    with pdfplumber.open(str(path)) as pdf:
        for page in pdf.pages:
            text = page.extract_text() or ""
            paragraphs.extend(_clean(line) for line in text.splitlines())
            for table in page.extract_tables() or []:
                rows = []
                for row in table:
                    rows.append([_clean(cell) for cell in (row or [])])
                if rows:
                    tables.append(rows)
    return paragraphs, tables


def _extract_text_and_tables(path: Path) -> Tuple[List[str], List[List[List[str]]]]:
    suffix = path.suffix.lower()
    if suffix == ".docx":
        return _extract_docx(path)
    if suffix == ".pdf":
        return _extract_pdf(path)
    raise ValueError(f"Unsupported answer-key type: {suffix}")


def _is_rubric_table(rows: List[List[str]]) -> bool:
    if not rows:
        return False
    header = " ".join(rows[0]).lower()
    return "key point" in header and "marks" in header


def _parse_rubric(rows: List[List[str]]) -> Tuple[List[Dict[str, str]], float]:
    key_points: List[Dict[str, str]] = []
    total = 0.0
    for row in rows[1:]:
        if not row or not any(row):
            continue
        first = row[0].strip().lower() if len(row) > 0 else ""
        text = row[1] if len(row) > 1 else (row[0] if row else "")
        text = _clean(text)
        if not text:
            continue
        if first == "total" or text.lower().startswith("total"):
            continue
        key_points.append({"text": text, "confidence": "parsed"})
        if len(row) > 2:
            try:
                total += float(_clean(row[2]).replace("marks", "").strip())
            except ValueError:
                pass
    return key_points, total


def _find_question_blocks(paragraphs: List[str]) -> List[Dict[str, Any]]:
    blocks: List[Dict[str, Any]] = []
    for index, line in enumerate(paragraphs):
        if not line:
            continue
        match = QUESTION_RE.match(line)
        if not match:
            continue
        label = _normalise_number(match.group(1))
        if not label:
            continue
        # Avoid the instruction line "Question 1 is compulsory..." which has no
        # bracket marks and no sub-part label.
        if "marks" not in line.lower() and "(" not in match.group(1):
            continue

        marks: Optional[float] = None
        if match.group(2):
            try:
                marks = float(match.group(2))
            except ValueError:
                marks = None

        question_text = ""
        model_answer = ""
        for later in paragraphs[index + 1 :]:
            if not later:
                continue
            if QUESTION_RE.match(later) and (
                "marks" in later.lower() or "(" in later
            ):
                break
            lowered = later.lower()
            if not question_text:
                if lowered not in {"model answer", "scheme of evaluation"}:
                    question_text = later
                continue
            if lowered == "model answer":
                continue
            if lowered == "scheme of evaluation":
                break
            if not model_answer:
                model_answer = later

        blocks.append(
            {
                "number": label,
                "text": question_text,
                "max_marks": marks,
                "model_answer": model_answer,
            }
        )
    return blocks


def _sentence_key_points(text: str) -> List[Dict[str, str]]:
    parts = re.split(r"(?<=[.!?])\s+|\n+", _clean(text))
    return [
        {"text": part.strip(), "confidence": "guessed"}
        for part in parts
        if len(part.strip()) >= 8
    ]


def _heuristic_parse(
    paragraphs: List[str], tables: List[List[List[str]]]
) -> KeyParseResult:
    blocks = _find_question_blocks(paragraphs)
    rubrics = [rows for rows in tables if _is_rubric_table(rows)]

    warnings: List[str] = []
    questions: List[Dict[str, Any]] = []

    for index, block in enumerate(blocks):
        rubric_rows = rubrics[index] if index < len(rubrics) else []
        key_points, rubric_total = _parse_rubric(rubric_rows)
        if not key_points and block["model_answer"]:
            key_points = _sentence_key_points(block["model_answer"])
            if key_points:
                warnings.append(
                    f"Question {block['number']}: rubric table missing; used model answer sentences"
                )

        max_marks = block["max_marks"]
        if max_marks is None:
            max_marks = rubric_total if rubric_total > 0 else 1.0
            warnings.append(
                f"Question {block['number']}: marks not found; defaulted to {max_marks:g}"
            )
        elif rubric_total > 0 and abs(float(max_marks) - rubric_total) > 0.01:
            warnings.append(
                f"Question {block['number']}: header marks {max_marks:g} differ from rubric total {rubric_total:g}"
            )

        questions.append(
            {
                "number": block["number"],
                "text": block["text"] or f"Question {block['number']}",
                "max_marks": float(max_marks),
                "grading_mode": "semantic",
                "key_points": key_points,
                "confidence": {
                    "text": "parsed" if block["text"] else "missing",
                    "max_marks": "parsed" if block["max_marks"] is not None else "guessed",
                },
            }
        )

    if not questions:
        return KeyParseResult(questions=[], warnings=["No question blocks found"])

    if len(rubrics) != len(blocks):
        warnings.append(
            f"Found {len(blocks)} question blocks but {len(rubrics)} rubric tables; mapped by order"
        )

    return KeyParseResult(questions=questions, warnings=warnings)


def _validated_questions(raw: Any) -> List[Dict[str, Any]]:
    if not isinstance(raw, list):
        raise ValueError("Gemini response has no questions array")

    questions: List[Dict[str, Any]] = []
    for item in raw:
        if not isinstance(item, dict):
            continue
        number = _normalise_number(item.get("number", ""))
        text = _clean(item.get("text", ""))
        if not number or not text:
            continue
        try:
            max_marks = float(item.get("max_marks"))
        except (TypeError, ValueError):
            continue
        if max_marks <= 0:
            continue

        key_points: List[Dict[str, str]] = []
        for point in item.get("key_points", []) or []:
            if isinstance(point, str):
                point_text = _clean(point)
                confidence = "parsed"
            elif isinstance(point, dict):
                point_text = _clean(point.get("text", ""))
                confidence = _clean(point.get("confidence", "parsed")) or "parsed"
            else:
                continue
            if point_text:
                key_points.append({"text": point_text, "confidence": confidence})

        if not key_points:
            continue

        questions.append(
            {
                "number": number,
                "text": text,
                "max_marks": max_marks,
                "grading_mode": _clean(item.get("grading_mode", "semantic"))
                or "semantic",
                "key_points": key_points,
                "confidence": item.get("confidence")
                or {"text": "guessed", "max_marks": "guessed"},
            }
        )

    if not questions:
        raise ValueError("Gemini response contained no usable questions")
    return questions


def _gemini_parse(
    path: Path, paragraphs: List[str], tables: List[List[List[str]]]
) -> KeyParseResult:
    extracted = "\n".join(paragraphs)
    if tables:
        extracted += "\n\nTABLES:\n" + json.dumps(tables, ensure_ascii=False)
    extracted = extracted[:120_000]

    prompt = (
        "Extract the complete answer key into strict JSON. Return exactly:\n"
        '{"questions":[{"number":"1a","text":"...","max_marks":3,'
        '"grading_mode":"semantic","key_points":[{"text":"...",'
        '"confidence":"parsed"}],"confidence":{"text":"parsed",'
        '"max_marks":"parsed"}}],"warnings":[]}\n\n'
        "Rules:\n"
        "- Keep every question/sub-question, including labels like 1a, 1b, 4(c).\n"
        "- Read marks from brackets or the mark-distribution table.\n"
        "- One key point per rubric row; do not merge rubric rows.\n"
        "- Use grading_mode 'semantic' unless the key explicitly says manual.\n"
        "- Return JSON only, no markdown.\n\n"
        f"DOCUMENT TEXT:\n{extracted}"
    )

    data = generate_json(
        prompt=prompt,
        model=settings.GEMINI_KEY_MODEL,
        document_path=path if path.suffix.lower() == ".pdf" and not extracted else None,
    )
    questions = _validated_questions(data.get("questions"))
    warnings = [str(w) for w in data.get("warnings", []) if str(w).strip()]
    return KeyParseResult(questions=questions, warnings=warnings)


def _fixture() -> KeyParseResult:
    with FIXTURE_PATH.open("r", encoding="utf-8") as handle:
        data = json.load(handle)
    questions = _validated_questions(data.get("questions"))
    warnings = [str(w) for w in data.get("warnings", []) if str(w).strip()]
    warnings.append("Demo fallback: used the 3-question fixture")
    return KeyParseResult(questions=questions, warnings=warnings)


def parse_key_file(path: Path, filename: str) -> KeyParseResult:
    """Parse a DOCX/PDF answer key into questions and rubric points.

    Order of attempts:
    1. local DOCX/PDF text + table extraction (deterministic),
    2. Gemini structuring when local parsing does not produce a usable key,
    3. demo fixture when ``DEMO_MODE=1``,
    4. raise so the API can return a validation error.
    """
    path = Path(path)
    if not path.is_file():
        raise FileNotFoundError(f"Answer key not found: {path}")

    paragraphs, tables = _extract_text_and_tables(path)
    heuristic = _heuristic_parse(paragraphs, tables)

    if heuristic.questions and all(q.get("key_points") for q in heuristic.questions):
        logger.info("Parsed %d questions locally from %s", len(heuristic.questions), filename)
        return heuristic

    if settings.GEMINI_API_KEY and not settings.MOCK_TRANSCRIBE:
        try:
            parsed = _gemini_parse(path, paragraphs, tables)
            if parsed.questions:
                logger.info("Parsed %d questions with Gemini from %s", len(parsed.questions), filename)
                return parsed
        except Exception as exc:  # SDK/network/parse failures fall back to local/fixture
            logger.warning("Gemini key parsing failed for %s: %s", filename, exc)

    if heuristic.questions:
        logger.info("Using partial local parse for %s", filename)
        return heuristic

    if settings.DEMO_MODE:
        logger.warning("Using demo key fixture for %s", filename)
        return _fixture()

    raise ValueError(f"Could not parse answer key: {filename}")
