"""Idempotent demo database seeder for SmartEval.

Demo scope: one subject, one CIE, three questions, two students.

* Q1a (3 marks): OSI reference model
* Q1b (3 marks): circuit switching vs packet switching
* Q2a (6 marks): TCP three-way handshake

The questions and rubric points match ``docs/samples/CN_CIE1_AnswerKey_3Q.docx`` so
the sample key, the live photo path, and this preloaded benchmark agree.

Student 1 (Asha) has no answers and is used for the live upload.
Student 2 (Ravi) has all three answers already evaluated and accepted; this is
the offline fallback if the demo laptop cannot reach Gemini.
"""

from __future__ import annotations

import json
import logging
import shutil
import sys
from pathlib import Path
from typing import Any, Dict, List, Optional, Union

# Ensure backend directory is in sys.path for standalone script execution
backend_dir = Path(__file__).resolve().parent.parent
if str(backend_dir) not in sys.path:
    sys.path.insert(0, str(backend_dir))

from app.core.config import settings
from app.core.db import get_conn, init_db, now_iso, vec_to_blob
from app.ml.score import embed_texts

logger = logging.getLogger("smarteval.demo_seed")

QUESTIONS: List[Dict[str, Any]] = [
    {
        "number": "1a",
        "text": "Define the OSI reference model. Name its seven layers and state one function of each.",
        "max_marks": 3.0,
        "key_points": [
            "OSI is a seven-layer reference architecture; each layer provides a service to the layer above and uses the layer below",
            "The seven layers are Physical, Data Link, Network, Transport, Session, Presentation, and Application",
            "Each layer has a well-defined function such as bit transmission, framing, routing, end-to-end delivery, dialog control, translation, or user services",
        ],
        "transcript": (
            "The OSI model is a seven-layer reference architecture that divides network "
            "communication into layers. The physical layer transmits bits, the data link "
            "layer handles framing and error control, and the network layer routes packets. "
            "The transport layer provides end-to-end delivery, the session layer manages "
            "dialogs, the presentation layer translates and encrypts data, and the "
            "application layer provides services to the user."
        ),
    },
    {
        "number": "1b",
        "text": "Differentiate circuit switching and packet switching.",
        "max_marks": 3.0,
        "key_points": [
            "Circuit switching establishes a dedicated physical path for the entire communication; packet switching sends independent packets using store-and-forward",
            "Circuit switching reserves bandwidth even during idle periods; packet switching shares links statistically",
            "Circuit switching suits continuous voice traffic; packet switching suits bursty data traffic",
        ],
        "transcript": (
            "Circuit switching establishes a dedicated physical path before the transfer "
            "and keeps it for the whole call, so bandwidth is reserved even when nobody is "
            "speaking. Packet switching breaks data into packets and forwards them "
            "independently with store-and-forward, sharing links statistically. Circuit "
            "switching is good for continuous voice, while packet switching is good for "
            "bursty data traffic."
        ),
    },
    {
        "number": "2a",
        "text": "Explain the TCP three-way handshake used to establish a connection.",
        "max_marks": 6.0,
        "key_points": [
            "Client sends a SYN segment carrying its initial sequence number",
            "Server replies with SYN-ACK, acknowledging the client ISN and sending its own ISN",
            "Client sends ACK acknowledging the server ISN, and the connection is established",
            "Both endpoints synchronize their initial sequence numbers",
            "The handshake prevents an old duplicate connection request from being accepted",
            "A labelled client/server diagram shows the SYN, SYN-ACK, and ACK exchange",
        ],
        "transcript": (
            "The client sends a SYN segment with its initial sequence number. The server "
            "replies with a SYN-ACK that acknowledges the client ISN and carries the "
            "server's own initial sequence number. The client then sends an ACK for the "
            "server ISN, and the connection is established. Both endpoints have now "
            "synchronized their sequence numbers. The exchange also prevents an old "
            "duplicate connection request from being accepted. A labelled diagram shows "
            "the client and server states for SYN, SYN-ACK and ACK."
        ),
    },
]


def _seed_key_copy() -> Optional[str]:
    """Copy the committed 3-question sample key into the runtime key directory."""
    source = Path(__file__).resolve().parents[2] / "docs" / "samples" / "CN_CIE1_AnswerKey_3Q.docx"
    if not source.is_file():
        return None
    target_dir = Path(settings.KEY_DIR)
    target_dir.mkdir(parents=True, exist_ok=True)
    target = target_dir / "demo_CN_CIE1_AnswerKey_3Q.docx"
    shutil.copyfile(source, target)
    return str(target.resolve())


def seed_db(db_path: Optional[Union[str, Path]] = None) -> None:
    """Reset and seed the demo database, questions, students, and benchmark."""
    init_db(db_path)
    seeded_key_path = _seed_key_copy()

    # Embed all rubric points once, before opening the write transaction.  The
    # real local MiniLM is used; if it is unavailable, embed_texts returns a
    # deterministic fallback rather than leaving dummy identical vectors.
    all_key_points = [kp for question in QUESTIONS for kp in question["key_points"]]
    try:
        vectors = embed_texts(all_key_points)
    except Exception:
        logger.exception("Embedding failed while seeding; using fallback vectors")
        vectors = [[0.1] * 384 for _ in all_key_points]
    if len(vectors) != len(all_key_points):
        vectors = [[0.1] * 384 for _ in all_key_points]

    conn = get_conn(db_path)
    try:
        with conn:
            conn.execute("DELETE FROM jobs;")
            conn.execute("DELETE FROM answers;")
            conn.execute("DELETE FROM students;")
            conn.execute("DELETE FROM key_points;")
            conn.execute("DELETE FROM questions;")
            conn.execute("DELETE FROM drafts;")
            conn.execute("DELETE FROM transcript_cache;")
            try:
                conn.execute(
                    "DELETE FROM sqlite_sequence WHERE name IN ('questions', 'key_points', 'answers');"
                )
            except Exception:
                pass

            current_time = now_iso()
            conn.execute(
                """
                UPDATE exam SET
                    state = 'READY',
                    subject = 'Computer Networks',
                    point_threshold = 0.55,
                    borderline_band = 0.10,
                    key_filename = 'CN_CIE1_AnswerKey_3Q.docx',
                    key_path = ?,
                    updated_at = ?
                WHERE id = 1;
                """,
                (seeded_key_path, current_time),
            )

            question_ids: Dict[str, int] = {}
            key_point_ids: Dict[str, List[int]] = {}
            vector_index = 0

            for position, question in enumerate(QUESTIONS, start=1):
                cursor = conn.execute(
                    """
                    INSERT INTO questions (number, text, max_marks, grading_mode, position)
                    VALUES (?, ?, ?, 'semantic', ?);
                    """,
                    (
                        question["number"],
                        question["text"],
                        float(question["max_marks"]),
                        position,
                    ),
                )
                question_id = int(cursor.lastrowid)
                question_ids[question["number"]] = question_id
                key_point_ids[question["number"]] = []

                for kp_position, kp_text in enumerate(question["key_points"], start=1):
                    cursor = conn.execute(
                        """
                        INSERT INTO key_points (question_id, text, embedding, position)
                        VALUES (?, ?, ?, ?);
                        """,
                        (
                            question_id,
                            kp_text,
                            vec_to_blob(vectors[vector_index]),
                            kp_position,
                        ),
                    )
                    key_point_ids[question["number"]].append(int(cursor.lastrowid))
                    vector_index += 1

            conn.execute(
                "INSERT INTO students (usn, name, created_at) VALUES (?, ?, ?);",
                ("4SF22CS001", "Asha Rao", now_iso()),
            )
            conn.execute(
                "INSERT INTO students (usn, name, created_at) VALUES (?, ?, ?);",
                ("4SF22CS002", "Ravi Kumar", now_iso()),
            )

            # Pre-evaluated benchmark: every rubric point covered and accepted.
            for question in QUESTIONS:
                qid = question_ids[question["number"]]
                matches = [
                    {
                        "id": kp_id,
                        "text": kp_text,
                        "covered": True,
                        "similarity": 0.90,
                        "borderline": False,
                    }
                    for kp_id, kp_text in zip(
                        key_point_ids[question["number"]], question["key_points"]
                    )
                ]
                conn.execute(
                    """
                    INSERT INTO answers (
                        usn, question_id, status, image_path, transcript,
                        ocr_confidence, matches, coverage, suggested_marks,
                        final_marks, decision, flags, review_reason, evaluated_at
                    ) VALUES (?, ?, 'evaluated', NULL, ?, 0.92, ?, 1.0, ?, ?, 'accepted', '[]', NULL, ?);
                    """,
                    (
                        "4SF22CS002",
                        qid,
                        question["transcript"],
                        json.dumps(matches),
                        float(question["max_marks"]),
                        float(question["max_marks"]),
                        now_iso(),
                    ),
                )
    finally:
        conn.close()


if __name__ == "__main__":
    db_target = sys.argv[1] if len(sys.argv) > 1 else None
    seed_db(db_target)
    print(
        "Successfully seeded demo database"
        + (f" at {db_target}" if db_target else ".")
    )
