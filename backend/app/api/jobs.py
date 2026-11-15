"""Jobs status polling router for SmartEval API.

Strictly adheres to docs/API_CONTRACT.md v1.4 and docs/PLAN_DEV_A.md:
- GET /api/jobs/{job_id}: retrieves asynchronous job status and progress, mapping error payload
"""

import logging
import sqlite3
from typing import Optional

from fastapi import APIRouter, Depends

from app.api.schemas import Job, JobError
from app.core.db import get_db
from app.core.errors import ApiError

logger = logging.getLogger("smarteval.jobs")

router = APIRouter(tags=["jobs"])


@router.get("/jobs/{job_id}", response_model=Job)
def get_job(
    job_id: str,
    conn: sqlite3.Connection = Depends(get_db),
) -> Job:
    """Retrieve async job progress and status.
    
    Guards & Rules:
    - 404 NOT_FOUND if job missing
    - If error_code is set, maps into contract error shape: {"code": error_code, "message": error_message}
    - answer_id remains populated on error so frontend can highlight relevant question
    - Returns Job schema
    """
    trimmed_id = job_id.strip()
    cur = conn.execute(
        """
        SELECT id, answer_id, status, step, progress, message,
               error_code, error_message, created_at, updated_at
        FROM jobs
        WHERE id = ?;
        """,
        (trimmed_id,),
    )
    row = cur.fetchone()

    if not row:
        raise ApiError(
            status_code=404,
            code="NOT_FOUND",
            message=f"Job {trimmed_id} not found",
            detail={"job_id": trimmed_id},
        )

    error_payload = None
    if row["error_code"]:
        error_payload = JobError(
            code=row["error_code"],
            message=row["error_message"] or "",
        )

    return Job(
        job_id=row["id"],
        status=row["status"],
        step=row["step"],
        progress=float(row["progress"] if row["progress"] is not None else 0.0),
        message=row["message"] or "",
        answer_id=row["answer_id"],
        error=error_payload,
    )
