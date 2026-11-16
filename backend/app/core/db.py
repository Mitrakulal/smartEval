import sqlite3
import struct
from datetime import datetime, timezone
from pathlib import Path
from typing import Generator, List, Optional, Union

from app.core.config import settings

DDL_STATEMENTS = """
PRAGMA journal_mode = WAL;
PRAGMA foreign_keys = ON;

CREATE TABLE IF NOT EXISTS exam (
    id INTEGER PRIMARY KEY CHECK (id = 1),
    state TEXT NOT NULL DEFAULT 'NO_KEY',
    subject TEXT NOT NULL DEFAULT 'Computer Networks',
    point_threshold REAL NOT NULL DEFAULT 0.55,
    borderline_band REAL NOT NULL DEFAULT 0.10,
    key_filename TEXT,
    key_path TEXT,
    updated_at TEXT NOT NULL
);

CREATE TABLE IF NOT EXISTS questions (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    number TEXT NOT NULL,
    text TEXT NOT NULL,
    max_marks REAL NOT NULL,
    grading_mode TEXT NOT NULL DEFAULT 'semantic',
    position INTEGER NOT NULL
);

CREATE TABLE IF NOT EXISTS key_points (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    question_id INTEGER NOT NULL REFERENCES questions(id) ON DELETE CASCADE,
    text TEXT NOT NULL,
    embedding BLOB,
    position INTEGER NOT NULL
);

CREATE TABLE IF NOT EXISTS students (
    usn TEXT PRIMARY KEY,
    name TEXT NOT NULL DEFAULT '',
    created_at TEXT NOT NULL
);

CREATE TABLE IF NOT EXISTS answers (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    usn TEXT NOT NULL REFERENCES students(usn) ON DELETE CASCADE,
    question_id INTEGER NOT NULL REFERENCES questions(id) ON DELETE CASCADE,
    status TEXT NOT NULL DEFAULT 'pending',
    image_path TEXT,
    transcript TEXT,
    ocr_confidence REAL,
    matches TEXT,                -- JSON: [{id, text, covered, similarity, borderline}]
    coverage REAL,
    suggested_marks REAL,
    final_marks REAL,
    decision TEXT DEFAULT 'pending', -- 'pending' | 'accepted' | 'overridden'
    flags TEXT,                  -- JSON: ["borderline", ...]
    review_reason TEXT,
    evaluated_at TEXT,
    UNIQUE(usn, question_id)
);

CREATE TABLE IF NOT EXISTS jobs (
    id TEXT PRIMARY KEY,
    answer_id INTEGER REFERENCES answers(id) ON DELETE CASCADE,
    status TEXT NOT NULL DEFAULT 'queued',
    step TEXT DEFAULT 'preprocess',
    progress REAL NOT NULL DEFAULT 0.0,
    message TEXT NOT NULL DEFAULT '',
    error_code TEXT,
    error_message TEXT,
    created_at TEXT NOT NULL,
    updated_at TEXT NOT NULL
);

CREATE TABLE IF NOT EXISTS drafts (
    id TEXT PRIMARY KEY,
    filename TEXT NOT NULL,
    payload TEXT NOT NULL,       -- JSON serialized KeyDraft payload
    created_at TEXT NOT NULL
);

CREATE TABLE IF NOT EXISTS transcript_cache (
    image_hash TEXT PRIMARY KEY,
    transcript TEXT NOT NULL,
    confidence REAL NOT NULL,
    legibility TEXT NOT NULL,
    model TEXT NOT NULL,
    created_at TEXT NOT NULL
);
"""


def now_iso() -> str:
    """Return current UTC time in ISO-8601 format: YYYY-MM-DDTHH:MM:SSZ"""
    return datetime.now(timezone.utc).strftime("%Y-%m-%dT%H:%M:%SZ")


def vec_to_blob(vector: Optional[List[float]]) -> Optional[bytes]:
    """Convert float vector to float32 BLOB using struct."""
    if vector is None:
        return None
    if not vector:
        return b""
    return struct.pack(f"{len(vector)}f", *vector)


def blob_to_vec(blob: Optional[bytes]) -> Optional[List[float]]:
    """Convert float32 BLOB back to list of floats using struct."""
    if blob is None:
        return None
    if not blob:
        return []
    count = len(blob) // 4
    return list(struct.unpack(f"{count}f", blob))


def get_conn(db_path: Optional[Union[str, Path]] = None) -> sqlite3.Connection:
    """Open and configure a SQLite connection with WAL mode and foreign keys enabled."""
    target_path = Path(db_path) if db_path else Path(settings.DATABASE_PATH)
    target_path.parent.mkdir(parents=True, exist_ok=True)

    conn = sqlite3.connect(str(target_path), timeout=30.0)
    conn.row_factory = sqlite3.Row
    conn.execute("PRAGMA journal_mode = WAL;")
    conn.execute("PRAGMA foreign_keys = ON;")
    return conn


def get_db() -> Generator[sqlite3.Connection, None, None]:
    """FastAPI dependency generator yielding an isolated connection per request."""
    conn = get_conn()
    try:
        yield conn
    finally:
        conn.close()


def init_db(db_path: Optional[Union[str, Path]] = None) -> None:
    """Idempotently initialize SQLite tables and seed the singleton exam row if missing."""
    # Ensure data storage directories exist
    Path(settings.DATA_DIR).mkdir(parents=True, exist_ok=True)
    Path(settings.KEY_DIR).mkdir(parents=True, exist_ok=True)
    Path(settings.IMAGE_DIR).mkdir(parents=True, exist_ok=True)

    conn = get_conn(db_path)
    try:
        with conn:
            conn.executescript(DDL_STATEMENTS)

            # Seed singleton exam row if missing
            cur = conn.execute("SELECT id FROM exam WHERE id = 1;")
            if cur.fetchone() is None:
                conn.execute(
                    """
                    INSERT INTO exam (
                        id, state, subject, point_threshold, borderline_band,
                        key_filename, key_path, updated_at
                    ) VALUES (
                        1, 'NO_KEY', 'Computer Networks', 0.55, 0.10,
                        NULL, NULL, ?
                    );
                    """,
                    (now_iso(),),
                )
    finally:
        conn.close()
