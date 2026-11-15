"""Students management router for SmartEval API.

Strictly adheres to docs/API_CONTRACT.md v1.4 and docs/PLAN_DEV_A.md:
- POST /api/students: adds or updates student (with ?replace=true support)
- GET /api/students: lists student summaries with computed metrics (Approved Decisions 1 & 2)
- GET /api/students/{usn}: returns full student detail with synthesized pending answers (Rule 5 & 6, Approved Decision 3)
"""

import json
import logging
import sqlite3
from pathlib import Path
from typing import Dict, List, Optional

from fastapi import APIRouter, Depends, Query, Response

from app.api.schemas import (
    Answer,
    MatchedKeyPoint,
    StudentCreateRequest,
    StudentDetail,
    StudentSummary,
)
from app.core.db import get_db, now_iso
from app.core.errors import ApiError

logger = logging.getLogger("smarteval.students")

router = APIRouter(tags=["students"])


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


@router.post("/students", response_model=StudentSummary, status_code=201)
def create_student(
    body: StudentCreateRequest,
    response: Response,
    replace: bool = Query(False),
    conn: sqlite3.Connection = Depends(get_db),
) -> StudentSummary:
    """Add a student or replace an existing student.
    
    Guards:
    - 409 WRONG_STATE if exam state == 'NO_KEY'
    - 422 VALIDATION_ERROR if USN is empty
    - 409 DUPLICATE_USN if student exists and replace == False
    - Returns 200 on replace == True, 201 on new creation
    """
    ensure_exam_has_key(conn)

    trimmed_usn = (body.usn or "").strip()
    if not trimmed_usn:
        raise ApiError(
            status_code=422,
            code="VALIDATION_ERROR",
            message="USN cannot be empty",
            detail=[{"loc": ["body", "usn"], "msg": "USN cannot be empty", "type": "value_error"}],
        )

    student_name = (body.name or "").strip()

    # Get total confirmed questions in exam
    q_cur = conn.execute("SELECT COUNT(*) as cnt FROM questions;")
    total_q = q_cur.fetchone()["cnt"]

    # Check if student already exists
    cur = conn.execute("SELECT usn, name FROM students WHERE usn = ?;", (trimmed_usn,))
    existing = cur.fetchone()

    if existing:
        if not replace:
            raise ApiError(
                status_code=409,
                code="DUPLICATE_USN",
                message=f"Student {trimmed_usn} already exists",
                detail={"usn": trimmed_usn},
            )

        # replace == True: update student name, reset/delete answers, jobs, and stored images
        with conn:
            # Clean up physical image files
            ans_cur = conn.execute("SELECT image_path FROM answers WHERE usn = ?;", (trimmed_usn,))
            for ans_row in ans_cur.fetchall():
                if ans_row["image_path"]:
                    img_path = Path(ans_row["image_path"])
                    if img_path.exists():
                        try:
                            img_path.unlink()
                        except OSError:
                            pass

            # Cascade: delete jobs associated with this student's answers
            conn.execute(
                "DELETE FROM jobs WHERE answer_id IN (SELECT id FROM answers WHERE usn = ?);",
                (trimmed_usn,),
            )
            # Delete existing answers
            conn.execute("DELETE FROM answers WHERE usn = ?;", (trimmed_usn,))
            # Update student record
            conn.execute(
                "UPDATE students SET name = ? WHERE usn = ?;",
                (student_name, trimmed_usn),
            )

        response.status_code = 200
        return StudentSummary(
            usn=trimmed_usn,
            name=student_name,
            status="not_started",
            answered=0,
            total=total_q,
            average=None,
            flags=0,
        )

    # Insert new student record
    with conn:
        conn.execute(
            "INSERT INTO students (usn, name, created_at) VALUES (?, ?, ?);",
            (trimmed_usn, student_name, now_iso()),
        )

    response.status_code = 201
    return StudentSummary(
        usn=trimmed_usn,
        name=student_name,
        status="not_started",
        answered=0,
        total=total_q,
        average=None,
        flags=0,
    )


@router.get("/students", response_model=List[StudentSummary])
def list_students(
    conn: sqlite3.Connection = Depends(get_db),
) -> List[StudentSummary]:
    """Retrieve list of all students with computed metrics.
    
    Metrics:
    - answered: count of evaluated answers (status == 'evaluated')
    - total: total questions count in exam
    - average: round(sum(final_marks) / answered, 1) if answered > 0 else None (Approved Decision 1)
    - flags: count of evaluated answers with at least one flag (Approved Decision 2)
    - status: 'not_started' if answered == 0, 'complete' if answered == total and total > 0, else 'in_progress'
    """
    ensure_exam_has_key(conn)

    # Total confirmed questions in exam
    q_cur = conn.execute("SELECT COUNT(*) as cnt FROM questions;")
    total_q = q_cur.fetchone()["cnt"]

    # Fetch students ordered by USN
    s_cur = conn.execute("SELECT usn, name FROM students ORDER BY usn ASC;")
    student_rows = s_cur.fetchall()

    summaries: List[StudentSummary] = []
    for s_row in student_rows:
        usn = s_row["usn"]
        name = s_row["name"]

        # Fetch evaluated answers for this student
        ans_cur = conn.execute(
            "SELECT final_marks, flags FROM answers WHERE usn = ? AND status = 'evaluated';",
            (usn,),
        )
        eval_answers = ans_cur.fetchall()
        answered = len(eval_answers)

        sum_marks = 0.0
        flag_count = 0
        for ans in eval_answers:
            if ans["final_marks"] is not None:
                sum_marks += float(ans["final_marks"])
            if ans["flags"]:
                try:
                    parsed_flags = json.loads(ans["flags"])
                    if isinstance(parsed_flags, list) and len(parsed_flags) > 0:
                        flag_count += 1
                except Exception:
                    pass

        # Approved Decision 1: average = round(sum(marks) / answered, 1) if answered > 0 else None
        average = round(sum_marks / answered, 1) if answered > 0 else None

        # Student status
        if answered == 0:
            status = "not_started"
        elif answered == total_q and total_q > 0:
            status = "complete"
        else:
            status = "in_progress"

        summaries.append(
            StudentSummary(
                usn=usn,
                name=name,
                status=status,
                answered=answered,
                total=total_q,
                average=average,
                flags=flag_count,
            )
        )

    return summaries


@router.get("/students/{usn}", response_model=StudentDetail)
def get_student(
    usn: str,
    conn: sqlite3.Connection = Depends(get_db),
) -> StudentDetail:
    """Retrieve full detail for a student including full Answer[] array.
    
    Guards:
    - 409 WRONG_STATE if exam state == 'NO_KEY'
    - 404 NOT_FOUND if student missing
    
    Invariants (Rules 5 & 6, Approved Decision 3):
    - Returns an Answer object for EVERY question defined in the exam in sequence.
    - Unevaluated questions have answer_id: null, status: 'pending', decision: null,
      needs_review: false, key_points with covered: false, similarity: 0.0, borderline: false.
    - Evaluated questions populate from DB row; needs_review = bool(flags).
    """
    ensure_exam_has_key(conn)

    trimmed_usn = usn.strip()
    s_cur = conn.execute("SELECT usn, name FROM students WHERE usn = ?;", (trimmed_usn,))
    student = s_cur.fetchone()
    if not student:
        raise ApiError(
            status_code=404,
            code="NOT_FOUND",
            message=f"Student {trimmed_usn} not found",
            detail={"usn": trimmed_usn},
        )

    # Fetch all questions in sequence
    q_cur = conn.execute(
        "SELECT id, number, text, max_marks, grading_mode, position FROM questions ORDER BY position ASC, id ASC;"
    )
    questions = q_cur.fetchall()

    # Fetch all key points indexed by question_id
    kp_cur = conn.execute(
        "SELECT id, question_id, text, position FROM key_points ORDER BY question_id ASC, position ASC, id ASC;"
    )
    kps_by_qid: Dict[int, list] = {}
    for kp in kp_cur.fetchall():
        kps_by_qid.setdefault(kp["question_id"], []).append(kp)

    # Fetch all answers for this student indexed by question_id
    ans_cur = conn.execute("SELECT * FROM answers WHERE usn = ?;", (trimmed_usn,))
    answers_by_qid = {row["question_id"]: row for row in ans_cur.fetchall()}

    answers_list: List[Answer] = []
    total_marks = 0.0
    max_marks = 0.0
    answered_count = 0

    for q in questions:
        qid = q["id"]
        q_num = str(q["number"])
        q_text = q["text"]
        q_max = float(q["max_marks"])
        max_marks += q_max

        q_kps = kps_by_qid.get(qid, [])
        ans_row = answers_by_qid.get(qid)

        # Synthesize pending Answer if missing or status == 'pending'
        if ans_row is None or ans_row["status"] == "pending":
            pending_kps = [
                MatchedKeyPoint(
                    id=kp["id"],
                    text=kp["text"],
                    covered=False,
                    similarity=0.0,
                    borderline=False,
                )
                for kp in q_kps
            ]
            answers_list.append(
                Answer(
                    answer_id=None,
                    question_id=qid,
                    question_number=q_num,
                    question_text=q_text,
                    max_marks=q_max,
                    status="pending",
                    image_url=None,
                    transcript=None,
                    ocr_confidence=None,
                    key_points=pending_kps,
                    coverage=None,
                    covered_count=0,
                    key_point_count=len(pending_kps),
                    suggested_marks=None,
                    final_marks=None,
                    decision=None,
                    flags=[],
                    review_reason=None,
                    needs_review=False,
                    evaluated_at=None,
                )
            )
        else:
            ans_status = ans_row["status"]
            if ans_status == "evaluated":
                answered_count += 1
                if ans_row["final_marks"] is not None:
                    total_marks += float(ans_row["final_marks"])

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

            # Parse matches JSON
            matched_kps: List[MatchedKeyPoint] = []
            kp_text_map = {kp["id"]: kp["text"] for kp in q_kps}
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

            answers_list.append(
                Answer(
                    answer_id=ans_row["id"],
                    question_id=qid,
                    question_number=q_num,
                    question_text=q_text,
                    max_marks=q_max,
                    status=ans_status,
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
            )

    total_q = len(questions)
    if answered_count == 0:
        student_status = "not_started"
    elif answered_count == total_q and total_q > 0:
        student_status = "complete"
    else:
        student_status = "in_progress"

    return StudentDetail(
        usn=student["usn"],
        name=student["name"],
        total_marks=round(total_marks, 2),
        max_marks=round(max_marks, 2),
        status=student_status,
        answers=answers_list,
    )
