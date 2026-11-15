"""Demo database seeder for SmartEval.

Configures an idempotent demo state:
- Exam row: id = 1, state = 'READY', subject = 'Computer Networks',
  point_threshold = 0.55, borderline_band = 0.10.
- Questions (3 total):
  - 1a: max_marks = 3.0, position = 1, 'Explain the TCP 3-way handshake process.'
  - 1b: max_marks = 3.0, position = 2, 'What is the purpose of sequence numbers in TCP?'
  - 2a: max_marks = 6.0, position = 3, 'Compare distance vector and link state routing protocols.'
- Embeddings: 384-dimensional float vector embeddings for all key points.
- Students:
  - Student 1: 4SF22CS001, Asha Rao (Clean slate for live demo, 0 evaluated answers).
  - Student 2: 4SF22CS002, Ravi Kumar (Benchmark, all 3 questions evaluated, 10.5 total marks).
- Key point IDs for matches are queried dynamically from SQLite.
"""

import json
import logging
import sys
from pathlib import Path
from typing import Optional, Union

# Ensure backend directory is in sys.path for standalone script execution
backend_dir = Path(__file__).resolve().parent.parent
if str(backend_dir) not in sys.path:
    sys.path.insert(0, str(backend_dir))

from app.core.config import settings
from app.core.db import get_conn, init_db, now_iso, vec_to_blob

logger = logging.getLogger("smarteval.demo_seed")


def seed_db(db_path: Optional[Union[str, Path]] = None) -> None:
    """Idempotently seed the SQLite database with the demo exam, questions, and students."""
    # Ensure tables and storage directories exist
    init_db(db_path)

    conn = get_conn(db_path)
    try:
        with conn:
            # Clean up existing records in reverse foreign-key dependency order
            conn.execute("DELETE FROM jobs;")
            conn.execute("DELETE FROM answers;")
            conn.execute("DELETE FROM students;")
            conn.execute("DELETE FROM key_points;")
            conn.execute("DELETE FROM questions;")
            conn.execute("DELETE FROM drafts;")
            conn.execute("DELETE FROM transcript_cache;")

            # Reset autoincrement sequence counters if present
            try:
                conn.execute(
                    "DELETE FROM sqlite_sequence WHERE name IN ('questions', 'key_points', 'answers');"
                )
            except Exception:
                pass

            # Configure singleton exam row in READY state
            current_time = now_iso()
            cur = conn.execute("SELECT id FROM exam WHERE id = 1;")
            if cur.fetchone() is not None:
                conn.execute(
                    """
                    UPDATE exam SET
                        state = 'READY',
                        subject = 'Computer Networks',
                        point_threshold = 0.55,
                        borderline_band = 0.10,
                        key_filename = 'CN_CIE1_AnswerKey.docx',
                        key_path = NULL,
                        updated_at = ?
                    WHERE id = 1;
                    """,
                    (current_time,),
                )
            else:
                conn.execute(
                    """
                    INSERT INTO exam (
                        id, state, subject, point_threshold, borderline_band,
                        key_filename, key_path, updated_at
                    ) VALUES (
                        1, 'READY', 'Computer Networks', 0.55, 0.10,
                        'CN_CIE1_AnswerKey.docx', NULL, ?
                    );
                    """,
                    (current_time,),
                )

            # 384-dimensional normalized float vector for dummy key point embeddings
            dummy_embedding = vec_to_blob([0.1] * 384)

            # Insert Question 1a
            cur = conn.execute(
                """
                INSERT INTO questions (number, text, max_marks, grading_mode, position)
                VALUES (?, ?, ?, ?, ?);
                """,
                ("1a", "Explain the TCP 3-way handshake process.", 3.0, "semantic", 1),
            )
            q1a_id = cur.lastrowid

            q1a_key_points = [
                ("SYN packet sent by client to initiate connection", 1),
                ("SYN-ACK sent by server and ACK sent by client to complete handshake", 2),
            ]
            for kp_text, kp_pos in q1a_key_points:
                conn.execute(
                    """
                    INSERT INTO key_points (question_id, text, embedding, position)
                    VALUES (?, ?, ?, ?);
                    """,
                    (q1a_id, kp_text, dummy_embedding, kp_pos),
                )

            # Insert Question 1b
            cur = conn.execute(
                """
                INSERT INTO questions (number, text, max_marks, grading_mode, position)
                VALUES (?, ?, ?, ?, ?);
                """,
                ("1b", "What is the purpose of sequence numbers in TCP?", 3.0, "semantic", 2),
            )
            q1b_id = cur.lastrowid

            q1b_key_points = [
                ("Ensures in-order packet delivery and reassembly at destination", 1),
                ("Detects lost, duplicate, or out-of-order packets", 2),
            ]
            for kp_text, kp_pos in q1b_key_points:
                conn.execute(
                    """
                    INSERT INTO key_points (question_id, text, embedding, position)
                    VALUES (?, ?, ?, ?);
                    """,
                    (q1b_id, kp_text, dummy_embedding, kp_pos),
                )

            # Insert Question 2a
            cur = conn.execute(
                """
                INSERT INTO questions (number, text, max_marks, grading_mode, position)
                VALUES (?, ?, ?, ?, ?);
                """,
                ("2a", "Compare distance vector and link state routing protocols.", 6.0, "semantic", 3),
            )
            q2a_id = cur.lastrowid

            q2a_key_points = [
                (
                    "Distance vector uses Bellman-Ford algorithm (e.g., RIP) sharing routing tables with immediate neighbors",
                    1,
                ),
                (
                    "Link state uses Dijkstra's shortest path algorithm (e.g., OSPF) flooding entire topology to all nodes",
                    2,
                ),
                (
                    "Link state converges faster and avoids routing loops compared to distance vector",
                    3,
                ),
            ]
            for kp_text, kp_pos in q2a_key_points:
                conn.execute(
                    """
                    INSERT INTO key_points (question_id, text, embedding, position)
                    VALUES (?, ?, ?, ?);
                    """,
                    (q2a_id, kp_text, dummy_embedding, kp_pos),
                )

            # Insert Students
            # Student 1 (Live Demo): Asha Rao - Clean slate, 0 evaluated answers
            conn.execute(
                """
                INSERT INTO students (usn, name, created_at)
                VALUES (?, ?, ?);
                """,
                ("4SF22CS001", "Asha Rao", now_iso()),
            )

            # Student 2 (Pre-Evaluated Benchmark): Ravi Kumar - Evaluated on all 3 questions
            conn.execute(
                """
                INSERT INTO students (usn, name, created_at)
                VALUES (?, ?, ?);
                """,
                ("4SF22CS002", "Ravi Kumar", now_iso()),
            )

            # Dynamic Key Point Querying for Student 2 evaluated answers
            # Question 1a evaluated answer
            kps_1a_cur = conn.execute(
                "SELECT id, text, position FROM key_points WHERE question_id = ? ORDER BY position ASC;",
                (q1a_id,),
            )
            kps_1a = kps_1a_cur.fetchall()
            matches_1a = [
                {
                    "id": kp["id"],
                    "text": kp["text"],
                    "covered": True,
                    "similarity": 0.88,
                    "borderline": False,
                }
                for kp in kps_1a
            ]
            conn.execute(
                """
                INSERT INTO answers (
                    usn, question_id, status, image_path, transcript,
                    ocr_confidence, matches, coverage, suggested_marks,
                    final_marks, decision, flags, review_reason, evaluated_at
                ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?);
                """,
                (
                    "4SF22CS002",
                    q1a_id,
                    "evaluated",
                    None,
                    "TCP uses a three-way handshake to establish a connection. First, the client sends a SYN packet to initiate connection. The server replies with a SYN-ACK packet and the client completes the handshake with an ACK packet.",
                    0.92,
                    json.dumps(matches_1a),
                    1.0,
                    3.0,
                    3.0,
                    "accepted",
                    "[]",
                    None,
                    now_iso(),
                ),
            )

            # Question 1b evaluated answer
            kps_1b_cur = conn.execute(
                "SELECT id, text, position FROM key_points WHERE question_id = ? ORDER BY position ASC;",
                (q1b_id,),
            )
            kps_1b = kps_1b_cur.fetchall()
            matches_1b = [
                {
                    "id": kp["id"],
                    "text": kp["text"],
                    "covered": True,
                    "similarity": 0.88,
                    "borderline": False,
                }
                for kp in kps_1b
            ]
            conn.execute(
                """
                INSERT INTO answers (
                    usn, question_id, status, image_path, transcript,
                    ocr_confidence, matches, coverage, suggested_marks,
                    final_marks, decision, flags, review_reason, evaluated_at
                ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?);
                """,
                (
                    "4SF22CS002",
                    q1b_id,
                    "evaluated",
                    None,
                    "Sequence numbers ensure that TCP segments are delivered and reassembled in proper order at destination. They also detect lost, duplicate, or out-of-order packets.",
                    0.89,
                    json.dumps(matches_1b),
                    0.83,
                    2.5,
                    2.5,
                    "accepted",
                    "[]",
                    None,
                    now_iso(),
                ),
            )

            # Question 2a evaluated answer
            kps_2a_cur = conn.execute(
                "SELECT id, text, position FROM key_points WHERE question_id = ? ORDER BY position ASC;",
                (q2a_id,),
            )
            kps_2a = kps_2a_cur.fetchall()
            matches_2a = [
                {
                    "id": kp["id"],
                    "text": kp["text"],
                    "covered": True,
                    "similarity": 0.88,
                    "borderline": False,
                }
                for kp in kps_2a
            ]
            conn.execute(
                """
                INSERT INTO answers (
                    usn, question_id, status, image_path, transcript,
                    ocr_confidence, matches, coverage, suggested_marks,
                    final_marks, decision, flags, review_reason, evaluated_at
                ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?);
                """,
                (
                    "4SF22CS002",
                    q2a_id,
                    "evaluated",
                    None,
                    "Distance vector routing uses the Bellman-Ford algorithm (e.g., RIP) and shares routing tables with immediate neighbors. Link state routing uses Dijkstra's shortest path algorithm (e.g., OSPF) by flooding the entire topology to all nodes. Link state converges faster and avoids routing loops compared to distance vector.",
                    0.94,
                    json.dumps(matches_2a),
                    0.85,
                    5.0,
                    5.0,
                    "accepted",
                    "[]",
                    None,
                    now_iso(),
                ),
            )
    finally:
        conn.close()


if __name__ == "__main__":
    db_target = sys.argv[1] if len(sys.argv) > 1 else None
    seed_db(db_target)
    print(f"Successfully seeded demo database{' at ' + str(db_target) if db_target else ''}.")
