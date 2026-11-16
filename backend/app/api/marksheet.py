"""Marksheet and approval router for SmartEval API.

Strictly adheres to docs/API_CONTRACT.md v1.4 and docs/PLAN_DEV_A.md:
- GET /api/exam/marksheet: returns Marksheet schema with string question keys, student rows, class average.
- GET /api/exam/marksheet.csv: returns CSV export matching JSON values and header format.
- POST /api/exam/approve: guards on state == READY, checks unreviewed answers, transitions state to FINAL.
"""

import csv
import io
import json
import logging
import sqlite3
from typing import Dict, List, Optional

from fastapi import APIRouter, Depends, Response

from app.api.exam import get_current_exam_state
from app.api.schemas import (
    ExamState,
    Marksheet,
    MarksheetQuestion,
    MarksheetRow,
)
from app.core.db import get_db, now_iso
from app.core.errors import ApiError

logger = logging.getLogger("smarteval.marksheet")

router = APIRouter(tags=["marksheet"])


def build_marksheet(conn: sqlite3.Connection) -> Marksheet:
    """Query database and construct the full Marksheet domain object."""
    cur = conn.execute("SELECT * FROM exam WHERE id = 1;")
    exam_row = cur.fetchone()
    if not exam_row:
        raise ApiError(status_code=500, code="INTERNAL", message="Exam row not found")

    subject = exam_row["subject"] or "Computer Networks"

    # Fetch questions ordered by position ASC, id ASC
    q_cur = conn.execute(
        "SELECT id, number, text, max_marks, grading_mode, position FROM questions ORDER BY position ASC, id ASC;"
    )
    q_rows = q_cur.fetchall()

    questions: List[MarksheetQuestion] = []
    total_max_marks = 0.0
    for q in q_rows:
        q_max = float(q["max_marks"])
        total_max_marks += q_max
        questions.append(
            MarksheetQuestion(
                id=str(q["id"]),
                question_id=int(q["id"]),
                number=str(q["number"]),
                max_marks=q_max,
            )
        )

    # Fetch students ordered alphabetically by USN
    s_cur = conn.execute("SELECT usn, name FROM students ORDER BY usn ASC;")
    s_rows = s_cur.fetchall()

    rows: List[MarksheetRow] = []
    total_q = len(questions)

    for s in s_rows:
        usn = s["usn"]
        name = s["name"]

        # Fetch answers for this student
        ans_cur = conn.execute(
            "SELECT question_id, status, final_marks, decision, flags FROM answers WHERE usn = ?;",
            (usn,),
        )
        ans_rows = ans_cur.fetchall()

        marks: Dict[str, Optional[float]] = {}
        student_total = 0.0
        answered_count = 0
        flag_count = 0
        has_pending_flagged = False

        for ans in ans_rows:
            parsed_flags: List[str] = []
            if ans["flags"]:
                try:
                    f = json.loads(ans["flags"])
                    if isinstance(f, list):
                        parsed_flags = f
                except Exception:
                    pass

            is_evaluated = ans["status"] == "evaluated" and ans["final_marks"] is not None
            if is_evaluated:
                answered_count += 1
                f_marks = float(ans["final_marks"])
                # Contract Rule 7: keys MUST be string!
                marks[str(ans["question_id"])] = f_marks
                student_total += f_marks

                # Approved Decision 2: number of evaluated answers with at least one flag
                if len(parsed_flags) > 0:
                    flag_count += 1

            # Approved Decision 3: needs review if flags present and decision == 'pending'
            if len(parsed_flags) > 0 and ans["decision"] == "pending":
                has_pending_flagged = True

        # Compute student status
        if answered_count == 0:
            student_status = "not_started"
        elif answered_count == total_q and total_q > 0:
            student_status = "complete"
        else:
            student_status = "in_progress"

        # Compute review status: 'pending' if ANY evaluated answer has flags AND decision == 'pending'
        review_status = "pending" if has_pending_flagged else "reviewed"

        rounded_total = round(student_total, 1)

        rows.append(
            MarksheetRow(
                usn=usn,
                name=name,
                marks=marks,
                total=rounded_total,
                total_marks=rounded_total,
                max_marks=total_max_marks,
                flags=flag_count,
                status=student_status,
                review_status=review_status,
            )
        )

    # Class average: average of total_marks across students who have evaluated answers, rounded to 1 decimal place
    students_with_eval = [r.total for r in rows if len(r.marks) > 0 and r.total is not None]
    if len(students_with_eval) > 0:
        class_average = round(sum(students_with_eval) / len(students_with_eval), 1)
    else:
        class_average = None

    return Marksheet(
        subject=subject,
        max_marks=total_max_marks,
        questions=questions,
        rows=rows,
        class_average=class_average,
        total_students=len(rows),
        generated_at=now_iso(),
    )


@router.get("/exam/marksheet", response_model=Marksheet)
def get_marksheet(conn: sqlite3.Connection = Depends(get_db)) -> Marksheet:
    """Retrieve full exam marksheet matrix with string-keyed marks, totals, and class average."""
    return build_marksheet(conn)


@router.get("/exam/marksheet.csv")
def get_marksheet_csv(conn: sqlite3.Connection = Depends(get_db)) -> Response:
    """Download exam marksheet as CSV formatted per docs/API_CONTRACT.md v1.4."""
    sheet = build_marksheet(conn)

    output = io.StringIO()
    writer = csv.writer(output, lineterminator="\r\n")

    # Header row format: USN,Name,Q<num1>,Q<num2>,...,Total,Max,Flags,Review_Status
    header = ["USN", "Name"]
    for q in sheet.questions:
        header.append(f"Q{q.number}")
    header.extend(["Total", "Max", "Flags", "Review_Status"])
    writer.writerow(header)

    # Data rows
    for r in sheet.rows:
        row_vals = [r.usn, r.name]
        for q in sheet.questions:
            qid_str = str(q.question_id) if q.question_id is not None else str(q.id)
            if qid_str in r.marks and r.marks[qid_str] is not None:
                val = r.marks[qid_str]
                row_vals.append(f"{val:.1f}")
            else:
                row_vals.append("")

        # Total
        total_val = r.total if r.total is not None else 0.0
        row_vals.append(f"{total_val:.1f}")

        # Max marks: formatted as integer if whole, else 1 decimal place
        if r.max_marks is not None and float(r.max_marks).is_integer():
            row_vals.append(str(int(r.max_marks)))
        elif r.max_marks is not None:
            row_vals.append(f"{r.max_marks:.1f}")
        else:
            row_vals.append("0")

        # Flags & Review_Status
        row_vals.append(str(r.flags))
        row_vals.append(r.review_status)
        writer.writerow(row_vals)

    csv_text = output.getvalue()
    return Response(
        content=csv_text,
        media_type="text/csv; charset=utf-8",
        headers={"Content-Disposition": 'attachment; filename="marksheet.csv"'},
    )


@router.post("/exam/approve", response_model=ExamState)
def approve_exam(conn: sqlite3.Connection = Depends(get_db)) -> ExamState:
    """Approve exam marksheet and lock exam state to FINAL.

    Guards:
    - 409 WRONG_STATE if exam state != 'READY'
    - 409 UNREVIEWED_ANSWERS if any answer has needs_review == True (or len(flags) > 0) AND decision == 'pending'
    """
    cur = conn.execute("SELECT state FROM exam WHERE id = 1;")
    row = cur.fetchone()
    if not row:
        raise ApiError(status_code=500, code="INTERNAL", message="Exam row not found")

    current_state = row["state"]
    if current_state != "READY":
        raise ApiError(
            status_code=409,
            code="WRONG_STATE",
            message=f"Action not allowed in the current exam state: exam is {current_state}, expected READY",
            detail={"current_state": current_state, "expected_state": "READY"},
        )

    # Approved Decision 3: check if any answer has needs_review == True (or len(flags) > 0) AND decision == 'pending'
    ans_cur = conn.execute("SELECT id, flags, decision FROM answers WHERE decision = 'pending';")
    unreviewed_count = 0
    for ans in ans_cur.fetchall():
        if ans["flags"]:
            try:
                flags = json.loads(ans["flags"])
                if isinstance(flags, list) and len(flags) > 0:
                    unreviewed_count += 1
            except Exception:
                pass

    if unreviewed_count > 0:
        raise ApiError(
            status_code=409,
            code="UNREVIEWED_ANSWERS",
            message="Cannot approve exam: unreviewed answers remain",
            detail={"unreviewed_count": unreviewed_count, "count": unreviewed_count},
        )

    # Update state to FINAL
    updated_at = now_iso()
    with conn:
        conn.execute(
            "UPDATE exam SET state = 'FINAL', updated_at = ? WHERE id = 1;",
            (updated_at,),
        )

    logger.info("Exam successfully approved and transitioned to FINAL state at %s", updated_at)
    return get_current_exam_state(conn)
