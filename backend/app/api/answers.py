"""Answers and evaluation router for SmartEval API.

Strictly adheres to docs/API_CONTRACT.md v1.4 and docs/PLAN_DEV_A.md:
- POST /api/students/{usn}/answers/{question_id}: image upload, job creation, returns 202 Accepted {"job_id": "j_..."}
- DELETE /api/students/{usn}/answers/{question_id}: reset answer to pending, purge jobs & disk image, returns 204
- PATCH /api/answers/{answer_id}: lecturer review & marks override, returns updated Answer schema (Approved Decision 3)
- GET /api/answers/{answer_id}/image: serve uploaded answer script image
"""

import json
import logging
import sqlite3
import uuid
from pathlib import Path
from typing import Dict, List, Optional

from fastapi import APIRouter, Depends, File, Response, UploadFile
from fastapi.responses import FileResponse

from app.api.schemas import (
    Answer,
    JobCreateResponse,
    MatchedKeyPoint,
    ReviewRequest,
)
from app.core.config import settings
from app.core.db import get_db, now_iso
from app.core.errors import ApiError

logger = logging.getLogger("smarteval.answers")

router = APIRouter(tags=["answers"])

ALLOWED_IMAGE_MIMES = {"image/jpeg", "image/png", "image/webp", "image/jpg"}
MAX_IMAGE_SIZE_BYTES = 10 * 1024 * 1024  # 10 MB


def ensure_exam_has_key(conn: sqlite3.Connection) -> None:
    """Validate exam state is not NO_KEY, raising 409 WRONG_STATE otherwise."""
    cur = conn.execute("SELECT state FROM exam WHERE id = 1;")
    row = cur.fetchone()
    if not row:
        raise ApiError(status_code=500, code="INTERNAL", message="Exam row not found")
    if row["state"] == "NO_KEY":
        raise ApiError(
            status_code=409,
            code="WRONG_STATE",
            message="Action not allowed in the current exam state: exam has no key",
            detail={},
        )


def build_answer_response(
    conn: sqlite3.Connection,
    ans_row: sqlite3.Row,
    q_row: sqlite3.Row,
) -> Answer:
    """Reconstruct an Answer response model from database rows."""
    qid = q_row["id"]

    # Fetch question key points
    kp_cur = conn.execute(
        "SELECT id, text, position FROM key_points WHERE question_id = ? ORDER BY position ASC, id ASC;",
        (qid,),
    )
    q_kps = kp_cur.fetchall()
    kp_text_map = {kp["id"]: kp["text"] for kp in q_kps}

    # Parse flags
    flags_list: List[str] = []
    if ans_row["flags"]:
        try:
            parsed_f = json.loads(ans_row["flags"])
            if isinstance(parsed_f, list):
                flags_list = [str(f) for f in parsed_f]
        except Exception:
            pass

    # Approved Decision 3: needs_review = bool(flags)
    needs_review = bool(flags_list)

    # Parse matches
    matched_kps: List[MatchedKeyPoint] = []
    if ans_row["matches"]:
        try:
            parsed_m = json.loads(ans_row["matches"])
            if isinstance(parsed_m, list):
                for m in parsed_m:
                    m_id = int(m.get("id"))
                    m_text = str(m.get("text") or kp_text_map.get(m_id, ""))
                    matched_kps.append(
                        MatchedKeyPoint(
                            id=m_id,
                            text=m_text,
                            covered=bool(m.get("covered", False)),
                            similarity=float(m.get("similarity", 0.0)),
                            borderline=bool(m.get("borderline", False)),
                        )
                    )
        except Exception:
            pass

    if not matched_kps:
        matched_kps = [
            MatchedKeyPoint(
                id=kp["id"],
                text=kp["text"],
                covered=False,
                similarity=0.0,
                borderline=False,
            )
            for kp in q_kps
        ]

    covered_count = sum(1 for kp in matched_kps if kp.covered)
    image_url = (
        f"/api/answers/{ans_row['id']}/image"
        if ans_row["image_path"]
        else None
    )

    return Answer(
        answer_id=ans_row["id"],
        question_id=qid,
        question_number=str(q_row["number"]),
        question_text=q_row["text"],
        max_marks=float(q_row["max_marks"]),
        status=ans_row["status"],
        image_url=image_url,
        transcript=ans_row["transcript"],
        ocr_confidence=float(ans_row["ocr_confidence"]) if ans_row["ocr_confidence"] is not None else None,
        key_points=matched_kps,
        coverage=float(ans_row["coverage"]) if ans_row["coverage"] is not None else None,
        covered_count=covered_count,
        key_point_count=len(matched_kps),
        suggested_marks=float(ans_row["suggested_marks"]) if ans_row["suggested_marks"] is not None else None,
        final_marks=float(ans_row["final_marks"]) if ans_row["final_marks"] is not None else None,
        decision=ans_row["decision"],
        flags=flags_list,
        review_reason=ans_row["review_reason"],
        needs_review=needs_review,
        evaluated_at=ans_row["evaluated_at"],
    )


@router.post(
    "/students/{usn}/answers/{question_id}",
    response_model=JobCreateResponse,
    status_code=202,
)
def upload_answer(
    usn: str,
    question_id: int,
    file: Optional[UploadFile] = File(None),
    conn: sqlite3.Connection = Depends(get_db),
    image: Optional[UploadFile] = File(None),
) -> JobCreateResponse:
    """Upload a handwritten answer image for asynchronous evaluation.

    Accepts either multipart field name ``file`` (API tests) or ``image`` (the
    React client).  The frontend contract only specifies multipart, not the field
    name, so tolerate both.
    
    Guards & Validations:
    - 409 WRONG_STATE if exam state is NO_KEY
    - 404 NOT_FOUND if student or question missing
    - 400 INVALID_FILE if MIME type is not JPEG, PNG, or WebP
    - 400 INVALID_FILE if file is empty or exceeds 10MB
    
    Actions:
    - Saves image to settings.IMAGE_DIR / {uuid}_{filename}
    - Upserts answers row: status = "processing", image_path, decision = "pending"
    - Inserts jobs row: status = "queued", step = "preprocess", progress = 0.0
    - Calls enqueue(job_id) via lazy import
    - Returns HTTP 202 Accepted {"job_id": job_id}
    """
    ensure_exam_has_key(conn)

    upload = file or image
    if upload is None:
        raise ApiError(
            status_code=422,
            code="VALIDATION_ERROR",
            message="Answer image is required (multipart field 'image' or 'file')",
            detail={},
        )

    trimmed_usn = usn.strip()

    # Validate student existence
    s_cur = conn.execute("SELECT usn FROM students WHERE usn = ?;", (trimmed_usn,))
    if not s_cur.fetchone():
        raise ApiError(
            status_code=404,
            code="NOT_FOUND",
            message=f"Student {trimmed_usn} not found",
            detail={"usn": trimmed_usn},
        )

    # Validate question existence
    q_cur = conn.execute("SELECT id FROM questions WHERE id = ?;", (question_id,))
    if not q_cur.fetchone():
        raise ApiError(
            status_code=404,
            code="NOT_FOUND",
            message=f"Question {question_id} not found",
            detail={"question_id": question_id},
        )

    # Validate MIME type
    content_type = (upload.content_type or "").lower().split(";")[0].strip()
    if content_type not in ALLOWED_IMAGE_MIMES:
        raise ApiError(
            status_code=400,
            code="INVALID_FILE",
            message=f"Invalid file type '{upload.content_type}'. Must be image/jpeg, image/png, or image/webp",
            detail={"content_type": upload.content_type},
        )

    # Synchronous read to avoid anyio threadpool deadlocks
    contents = upload.file.read()
    if not contents or len(contents) == 0:
        raise ApiError(
            status_code=400,
            code="INVALID_FILE",
            message="Uploaded file is empty",
            detail={},
        )

    if len(contents) > MAX_IMAGE_SIZE_BYTES:
        raise ApiError(
            status_code=400,
            code="INVALID_FILE",
            message="Uploaded file exceeds 10MB limit",
            detail={"size": len(contents), "max_size": MAX_IMAGE_SIZE_BYTES},
        )

    # Ensure target directory exists and save image
    image_dir = Path(settings.IMAGE_DIR)
    image_dir.mkdir(parents=True, exist_ok=True)

    clean_name = Path(upload.filename or "script.jpg").name
    saved_filename = f"{uuid.uuid4().hex}_{clean_name}"
    saved_path = image_dir / saved_filename
    saved_path.write_bytes(contents)

    # Generate job ID
    job_id = f"j_{uuid.uuid4().hex[:8]}"

    # Transaction: upsert answer row and insert job row
    with conn:
        ans_cur = conn.execute(
            "SELECT id, image_path FROM answers WHERE usn = ? AND question_id = ?;",
            (trimmed_usn, question_id),
        )
        existing = ans_cur.fetchone()

        if existing:
            answer_id = existing["id"]
            # Remove previous physical image if different
            if existing["image_path"] and existing["image_path"] != str(saved_path):
                try:
                    old_img = Path(existing["image_path"])
                    if old_img.exists():
                        old_img.unlink()
                except OSError:
                    pass

            conn.execute(
                """
                UPDATE answers
                SET status = 'processing',
                    image_path = ?,
                    transcript = NULL,
                    ocr_confidence = NULL,
                    matches = NULL,
                    coverage = NULL,
                    suggested_marks = NULL,
                    final_marks = NULL,
                    decision = 'pending',
                    flags = NULL,
                    review_reason = NULL,
                    evaluated_at = NULL
                WHERE id = ?;
                """,
                (str(saved_path), answer_id),
            )
        else:
            ins_cur = conn.execute(
                """
                INSERT INTO answers (
                    usn, question_id, status, image_path, decision
                ) VALUES (?, ?, 'processing', ?, 'pending');
                """,
                (trimmed_usn, question_id, str(saved_path)),
            )
            answer_id = ins_cur.lastrowid

        # Insert new jobs row
        now = now_iso()
        conn.execute(
            """
            INSERT INTO jobs (
                id, answer_id, status, step, progress, message, created_at, updated_at
            ) VALUES (?, ?, 'queued', 'preprocess', 0.0, 'Job queued', ?, ?);
            """,
            (job_id, answer_id, now, now),
        )

    # Trigger the background worker.  A worker import/runtime failure must not
    # turn an accepted upload into a 500, but it must be visible in the log.
    try:
        from app.core.worker import enqueue
        enqueue(job_id)
    except Exception:
        logger.exception("Could not enqueue evaluation job %s", job_id)

    return JobCreateResponse(job_id=job_id)


@router.delete(
    "/students/{usn}/answers/{question_id}",
    status_code=204,
)
def delete_answer(
    usn: str,
    question_id: int,
    conn: sqlite3.Connection = Depends(get_db),
) -> Response:
    """Delete an answer and its associated jobs, resetting the answer to pending.
    
    Guards:
    - 409 WRONG_STATE if exam state is NO_KEY
    - 404 NOT_FOUND if student or question missing
    
    Actions:
    - Removes image file from disk
    - Deletes associated jobs
    - Resets answer row to status = 'pending', clearing evaluation metrics
    - Returns HTTP 204 No Content
    """
    ensure_exam_has_key(conn)

    trimmed_usn = usn.strip()

    # Validate student existence
    s_cur = conn.execute("SELECT usn FROM students WHERE usn = ?;", (trimmed_usn,))
    if not s_cur.fetchone():
        raise ApiError(
            status_code=404,
            code="NOT_FOUND",
            message=f"Student {trimmed_usn} not found",
            detail={"usn": trimmed_usn},
        )

    # Validate question existence
    q_cur = conn.execute("SELECT id FROM questions WHERE id = ?;", (question_id,))
    if not q_cur.fetchone():
        raise ApiError(
            status_code=404,
            code="NOT_FOUND",
            message=f"Question {question_id} not found",
            detail={"question_id": question_id},
        )

    ans_cur = conn.execute(
        "SELECT id, image_path FROM answers WHERE usn = ? AND question_id = ?;",
        (trimmed_usn, question_id),
    )
    ans_row = ans_cur.fetchone()

    if ans_row:
        answer_id = ans_row["id"]

        # Remove image file from disk
        if ans_row["image_path"]:
            try:
                img_path = Path(ans_row["image_path"])
                if img_path.exists():
                    img_path.unlink()
            except OSError:
                pass

        with conn:
            # Delete jobs associated with this answer
            conn.execute("DELETE FROM jobs WHERE answer_id = ?;", (answer_id,))

            # Reset answer row to status = 'pending'
            conn.execute(
                """
                UPDATE answers
                SET status = 'pending',
                    image_path = NULL,
                    transcript = NULL,
                    ocr_confidence = NULL,
                    matches = NULL,
                    coverage = NULL,
                    suggested_marks = NULL,
                    final_marks = NULL,
                    decision = 'pending',
                    flags = NULL,
                    review_reason = NULL,
                    evaluated_at = NULL
                WHERE id = ?;
                """,
                (answer_id,),
            )

    return Response(status_code=204)


@router.patch("/answers/{answer_id}", response_model=Answer)
def review_answer(
    answer_id: int,
    body: ReviewRequest,
    conn: sqlite3.Connection = Depends(get_db),
) -> Answer:
    """Submit a lecturer review or marks override for an answer.
    
    Guards & Validations:
    - 404 NOT_FOUND if answer missing
    - 422 VALIDATION_ERROR if final_marks not in [0, max_marks]
    - 422 VALIDATION_ERROR if decision == "overridden" and reason is missing or empty
    - 422 VALIDATION_ERROR if decision not in ("accepted", "overridden", "pending")
    
    Actions:
    - Updates answers row: final_marks, decision, review_reason, status = "evaluated"
    - Note Approved Decision 3: needs_review = bool(flags) remains true if flags exist
    - Returns reconstructed Answer schema
    """
    ans_cur = conn.execute("SELECT * FROM answers WHERE id = ?;", (answer_id,))
    ans_row = ans_cur.fetchone()
    if not ans_row:
        raise ApiError(
            status_code=404,
            code="NOT_FOUND",
            message=f"Answer {answer_id} not found",
            detail={"answer_id": answer_id},
        )

    # Fetch question to get max_marks
    q_cur = conn.execute("SELECT * FROM questions WHERE id = ?;", (ans_row["question_id"],))
    q_row = q_cur.fetchone()
    if not q_row:
        raise ApiError(
            status_code=404,
            code="NOT_FOUND",
            message=f"Question {ans_row['question_id']} not found",
            detail={"question_id": ans_row["question_id"]},
        )

    max_marks = float(q_row["max_marks"])

    # Validate final_marks bounds
    if body.final_marks < 0 or body.final_marks > max_marks:
        raise ApiError(
            status_code=422,
            code="VALIDATION_ERROR",
            message=f"final_marks ({body.final_marks}) must be between 0 and max_marks ({max_marks})",
            detail={"final_marks": body.final_marks, "max_marks": max_marks},
        )

    # Validate decision
    decision_val = (body.decision or "").strip()
    if decision_val not in {"accepted", "overridden", "pending"}:
        raise ApiError(
            status_code=422,
            code="VALIDATION_ERROR",
            message=f"Invalid decision '{body.decision}'. Must be 'accepted' or 'overridden'",
            detail={"decision": body.decision},
        )

    # Validate override reason
    reason_val = body.reason.strip() if body.reason else None
    if decision_val == "overridden":
        if not reason_val:
            raise ApiError(
                status_code=422,
                code="VALIDATION_ERROR",
                message="Review reason is required when decision is overridden",
                detail={"decision": body.decision, "reason": body.reason},
            )

    now = now_iso()
    with conn:
        conn.execute(
            """
            UPDATE answers
            SET final_marks = ?,
                decision = ?,
                review_reason = ?,
                status = 'evaluated',
                evaluated_at = COALESCE(evaluated_at, ?)
            WHERE id = ?;
            """,
            (body.final_marks, decision_val, reason_val, now, answer_id),
        )

    # Fetch updated answer row and reconstruct Answer model
    updated_cur = conn.execute("SELECT * FROM answers WHERE id = ?;", (answer_id,))
    updated_ans = updated_cur.fetchone()

    return build_answer_response(conn, updated_ans, q_row)


@router.get("/answers/{answer_id}/image")
def get_answer_image(
    answer_id: int,
    conn: sqlite3.Connection = Depends(get_db),
) -> FileResponse:
    """Serve the uploaded answer script image.
    
    Guards:
    - 404 NOT_FOUND if answer missing
    - 404 NOT_FOUND if image_path is NULL or image file missing on disk
    """
    ans_cur = conn.execute("SELECT id, image_path FROM answers WHERE id = ?;", (answer_id,))
    ans_row = ans_cur.fetchone()
    if not ans_row:
        raise ApiError(
            status_code=404,
            code="NOT_FOUND",
            message=f"Answer {answer_id} not found",
            detail={"answer_id": answer_id},
        )

    if not ans_row["image_path"]:
        raise ApiError(
            status_code=404,
            code="NOT_FOUND",
            message=f"No image associated with answer {answer_id}",
            detail={"answer_id": answer_id},
        )

    img_path = Path(ans_row["image_path"])
    if not img_path.is_file():
        raise ApiError(
            status_code=404,
            code="NOT_FOUND",
            message=f"Image file not found on disk for answer {answer_id}",
            detail={"answer_id": answer_id, "image_path": ans_row["image_path"]},
        )

    # Determine media type based on extension, defaulting to image/jpeg
    media_type = "image/jpeg"
    suffix = img_path.suffix.lower()
    if suffix == ".png":
        media_type = "image/png"
    elif suffix == ".webp":
        media_type = "image/webp"

    return FileResponse(str(img_path), media_type=media_type)
