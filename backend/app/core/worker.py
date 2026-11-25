"""Single-process background evaluation worker.

The demo deliberately uses one ``ThreadPoolExecutor`` with one worker instead of
Redis/Celery.  Uploads insert a job row and submit that id here; the worker:

1. normalizes the photo,
2. transcribes it with Gemini (or the explicit demo fixture),
3. embeds/compares the transcript against the confirmed key points,
4. writes the evaluated answer and a terminal job status.

A failed job is visible through ``GET /api/jobs/{id}`` and the answer becomes
``error`` so the lecturer can retry the upload.  Marks are never written to
``final_marks`` here; only the lecturer's review endpoint does that.
"""

from __future__ import annotations

import json
import logging
import threading
from concurrent.futures import ThreadPoolExecutor
from pathlib import Path
from typing import Any, Dict, List, Optional

from app.core.config import settings
from app.core.db import get_conn, now_iso
from app.ml.score import score_answer
from app.ml.transcribe import transcribe_image

logger = logging.getLogger("smarteval.worker")

_executor_lock = threading.Lock()
_executor = ThreadPoolExecutor(max_workers=1, thread_name_prefix="smarteval-worker")
_shutdown = False


def _ensure_executor() -> None:
    """Recreate the pool if a previous app lifespan shut it down."""
    global _executor, _shutdown
    with _executor_lock:
        if _shutdown:
            _executor = ThreadPoolExecutor(
                max_workers=1, thread_name_prefix="smarteval-worker"
            )
            _shutdown = False
            logger.info("Background worker restarted")


def _update_job(conn, job_id: str, **fields: Any) -> None:
    allowed = {
        "status",
        "step",
        "progress",
        "message",
        "error_code",
        "error_message",
    }
    updates = {key: value for key, value in fields.items() if key in allowed}
    if not updates:
        return
    updates["updated_at"] = now_iso()
    assignments = ", ".join(f"{key} = ?" for key in updates)
    values = list(updates.values()) + [job_id]
    with conn:
        conn.execute(f"UPDATE jobs SET {assignments} WHERE id = ?;", values)


def _fail_job(
    conn,
    job_id: str,
    message: str,
    *,
    answer_id: Optional[int] = None,
) -> None:
    safe_message = (message or "Evaluation failed")[:500]
    _update_job(
        conn,
        job_id,
        status="error",
        step="done",
        message="Evaluation failed",
        error_code="EVALUATION_FAILED",
        error_message=safe_message,
    )
    if answer_id is not None:
        with conn:
            conn.execute(
                "UPDATE answers SET status = 'error' WHERE id = ?;",
                (answer_id,),
            )


def _load_job_context(conn, job_id: str):
    return conn.execute(
        """
        SELECT
            j.id AS job_id,
            j.answer_id AS job_answer_id,
            j.status AS job_status,
            a.id AS answer_id,
            a.usn AS usn,
            a.question_id AS question_id,
            a.status AS answer_status,
            a.image_path AS image_path,
            q.number AS question_number,
            q.text AS question_text,
            q.max_marks AS max_marks,
            q.grading_mode AS grading_mode
        FROM jobs j
        JOIN answers a ON a.id = j.answer_id
        JOIN questions q ON q.id = a.question_id
        WHERE j.id = ?;
        """,
        (job_id,),
    ).fetchone()


def _process_job(job_id: str) -> None:
    conn = get_conn()
    answer_id: Optional[int] = None
    try:
        job = _load_job_context(conn, job_id)
        if job is None:
            logger.info("Job %s no longer exists; ignoring", job_id)
            return
        if job["job_status"] in {"done", "error"}:
            logger.info("Job %s already terminal (%s)", job_id, job["job_status"])
            return

        answer_id = int(job["answer_id"])
        image_path = job["image_path"]
        if not image_path:
            _fail_job(conn, job_id, "Answer has no image", answer_id=answer_id)
            return

        _update_job(
            conn,
            job_id,
            status="running",
            step="preprocess",
            progress=0.05,
            message="Preparing image",
        )
        with conn:
            conn.execute(
                "UPDATE answers SET status = 'processing' WHERE id = ?;",
                (answer_id,),
            )

        # Transcription does the normalize/cache/OCR sequence.  Passing the DB
        # connection enables the transcript cache keyed by normalized-image hash.
        _update_job(
            conn,
            job_id,
            step="ocr",
            progress=0.25,
            message="Reading handwriting with Gemini",
        )
        transcript = transcribe_image(
            Path(image_path),
            str(job["question_number"]),
            conn=conn,
        )

        normalized = transcript.normalized_path
        if normalized and normalized != image_path:
            with conn:
                conn.execute(
                    "UPDATE answers SET image_path = ? WHERE id = ?;",
                    (normalized, answer_id),
                )
            # The uploaded original has been replaced by the normalized JPEG.
            try:
                old = Path(image_path)
                if old.is_file():
                    old.unlink()
            except OSError:
                logger.debug("Could not remove original image %s", image_path)

        key_points: List[Dict[str, Any]] = [
            dict(row)
            for row in conn.execute(
                """
                SELECT id, text, embedding
                FROM key_points
                WHERE question_id = ?
                ORDER BY position ASC, id ASC;
                """,
                (int(job["question_id"]),),
            ).fetchall()
        ]

        exam = conn.execute(
            "SELECT point_threshold, borderline_band FROM exam WHERE id = 1;"
        ).fetchone()
        threshold = (
            float(exam["point_threshold"])
            if exam is not None
            else float(settings.POINT_THRESHOLD)
        )
        band = (
            float(exam["borderline_band"])
            if exam is not None
            else float(settings.BORDERLINE_BAND)
        )

        _update_job(
            conn,
            job_id,
            step="embed",
            progress=0.60,
            message="Comparing answer with key points",
        )
        result = score_answer(
            transcript.text,
            key_points,
            float(job["max_marks"]),
            threshold,
            band,
        )

        _update_job(
            conn,
            job_id,
            step="score",
            progress=0.85,
            message="Finalizing suggested marks",
        )

        flags = list(result.flags)
        if transcript.confidence < float(settings.LOW_OCR_CONFIDENCE):
            if "low_ocr_confidence" not in flags:
                flags.insert(0, "low_ocr_confidence")
        if str(job["grading_mode"]) == "manual":
            if "manual_question" not in flags:
                flags.append("manual_question")

        with conn:
            conn.execute(
                """
                UPDATE answers
                SET status = 'evaluated',
                    transcript = ?,
                    ocr_confidence = ?,
                    matches = ?,
                    coverage = ?,
                    suggested_marks = ?,
                    final_marks = NULL,
                    decision = 'pending',
                    flags = ?,
                    review_reason = NULL,
                    evaluated_at = ?
                WHERE id = ?;
                """,
                (
                    transcript.text,
                    float(transcript.confidence),
                    json.dumps(result.matches, ensure_ascii=False),
                    float(result.coverage),
                    float(result.suggested_marks),
                    json.dumps(flags, ensure_ascii=False),
                    now_iso(),
                    answer_id,
                ),
            )

        _update_job(
            conn,
            job_id,
            status="done",
            step="done",
            progress=1.0,
            message="Evaluation complete",
        )
        logger.info(
            "Job %s done: answer=%s coverage=%.3f suggested=%.1f flags=%s",
            job_id,
            answer_id,
            result.coverage,
            result.suggested_marks,
            flags,
        )
    except Exception as exc:  # keep the worker alive and expose the failure
        logger.exception("Job %s failed", job_id)
        try:
            _fail_job(conn, job_id, str(exc), answer_id=answer_id)
        except Exception:
            logger.exception("Could not record failure for job %s", job_id)
    finally:
        conn.close()


def enqueue(job_id: str) -> None:
    """Submit a job id to the single background worker."""
    global _shutdown
    with _executor_lock:
        if _shutdown:
            logger.warning("Worker is shut down; not enqueuing %s", job_id)
            return
        _executor.submit(_process_job, job_id)


def recover_pending_jobs() -> None:
    """Requeue queued/running jobs left over from a previous process.

    Called once at FastAPI startup.  SQLite is durable; the demo should not lose
    an upload just because uvicorn was restarted during a rehearsal.
    """
    _ensure_executor()
    conn = get_conn()
    try:
        rows = conn.execute(
            "SELECT id FROM jobs WHERE status IN ('queued', 'running') ORDER BY created_at ASC;"
        ).fetchall()
        if not rows:
            return
        now = now_iso()
        with conn:
            for row in rows:
                conn.execute(
                    """
                    UPDATE jobs
                    SET status = 'queued',
                        step = 'preprocess',
                        progress = 0.0,
                        message = 'Requeued after restart',
                        error_code = NULL,
                        error_message = NULL,
                        updated_at = ?
                    WHERE id = ?;
                    """,
                    (now, row["id"]),
                )
        for row in rows:
            enqueue(row["id"])
        logger.info("Requeued %d pending job(s)", len(rows))
    finally:
        conn.close()


def shutdown_worker(wait: bool = False) -> None:
    global _shutdown
    with _executor_lock:
        _shutdown = True
    _executor.shutdown(wait=wait, cancel_futures=False)
