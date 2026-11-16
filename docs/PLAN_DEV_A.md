# Implementation Plan — Dev A (API & Data)

**Role:** Dev A — API & Data  
**Branch:** `BackendDev-A`  
**Target File:** `docs/PLAN_DEV_A.md`  
**Contract Version:** `docs/API_CONTRACT.md` v1.4 (frozen)  
**Primary References:** `docs/BACKEND.md`, `docs/WORK_SPLIT.md`, `docs/FRONTEND.md`

---

## 1. Understanding Summary

### 1.1 Demo Scope
SmartEval backend is built demo-first for a 5-minute live presentation:
- **Single Exam Singleton:** One active exam row (`id = 1`) in SQLite; no multi-tenancy, authentication, ORM, or migrations.
- **Demo Dataset:**
  - 2 students: Asha Rao (`4SF22CS001`, live candidate) and Ravi Kumar (`4SF22CS002`, pre-evaluated benchmark).
  - 3 questions: `1a` (3 marks), `1b` (3 marks), `2a` (6 marks) = 12 marks total.
  - 3 answer photos: 2 cached from rehearsal (`1a`, `1b`), 1 evaluated live on stage (`2a`).
  - Free-tier Gemini usage with robust local fallback (cached transcripts & fixture fallback).

### 1.2 State Machine
The exam lifecycle transitions through 4 explicit states:
```
 [Fresh DB / Reset]
         │
         ▼
     ┌─────────┐   POST /api/exam/key/parse   ┌─────────────┐
     │ NO_KEY  │ ───────────────────────────> │ KEY_PARSED  │
     └─────────┘                              └─────────────┘
          ▲                                          │
          │                                          │ POST /api/exam/key/confirm
          │                                          ▼
          │         POST /api/exam/approve    ┌─────────────┐
          │      ┌─────────────────────────── │    READY    │
          │      │                            └─────────────┘
          │      ▼                                   │
     ┌─────────┐                                     │
     │  FINAL  │ <───────────────────────────────────┘
     └─────────┘
          │
          │ POST /api/exam/reset
          └──────────────────────────────────────────> [NO_KEY]
```

- **`NO_KEY`:** Fresh database or post-reset. `GET /api/exam` returns empty questions list. All `/api/students/**` routes return `409 WRONG_STATE`.
- **`KEY_PARSED`:** Answer key uploaded and parsed into an uncommitted draft (`drafts` table). Lecturer edits rubric in Setup UI.
- **`READY`:** Rubric confirmed; questions and key-point embeddings stored in SQLite. Student creation, photo upload, evaluation, review, and marksheet generation are fully enabled.
- **`FINAL`:** Lecturer approved the marksheet via `POST /api/exam/approve`. Exam and evaluations are locked read-only. `POST /api/exam/key/parse` and `POST /api/exam/key/confirm` return `409 WRONG_STATE`.
- **`POST /api/exam/reset`:** Permitted in any state; wipes students, answers, jobs, questions, key points, drafts, and uploaded files, resetting exam state back to `NO_KEY`.

### 1.3 Contract Rules Easy to Get Wrong
1. **Case Convention:** Strict `snake_case` across all JSON keys, query params, and form field names.
2. **Explicit Nullability:** Nullable keys must **never be omitted** from JSON payloads. They must be explicitly sent with value `null` (e.g., `key_filename: null`, `transcript: null`, `decision: null`).
3. **Question Numbers are Strings:** Question labels (`"1a"`, `"2b"`, `"4(c)"`) are free-form strings end-to-end. Never cast to integers.
4. **Uniform Error Structure:** All non-2xx responses must use the exact contract shape:
   ```json
   {
     "error": {
       "code": "ERROR_CODE",
       "message": "Human readable message",
       "detail": {}
     }
   }
   ```
5. **Always-Present Pending Answers:** `GET /api/students/{usn}` must return an `Answer` object for every confirmed question, even before any script is uploaded. Unevaluated questions have `answer_id: null`, `status: "pending"`, `decision: null`, `key_points` with `covered: false, similarity: 0, borderline: false`, and `needs_review: false`.
6. **Upload `202` Response:** `POST /api/students/{usn}/answers/{question_id}` must return HTTP `202 Accepted` with exact body: `{"job_id": "j_..."}`.
7. **Marksheet Keys:** `Marksheet.rows[i].marks` must be a dictionary keyed by `question_id` **as a string** (e.g. `{"1": 4.5, "2": 3.0}`).
8. **Marks Representation:** Marks are floating point numbers with 0.5 precision (e.g. `3.5`, not `"3.5"`).

---

## 2. Endpoint-by-Endpoint Checklist

| # | Method | Path | Request Model / Params | Response Model & Code | Error Codes | DB Tables Touched | Validation & Business Rules |
|---|---|---|---|---|---|---|---|
| 1 | `GET` | `/api/exam` | None | `200 ExamState` | `500 INTERNAL` | `exam`, `questions`, `key_points`, `students` | Returns singleton exam row. Computes `question_count` and `student_count`. Returns `state: "NO_KEY"` and `questions: []` if fresh. |
| 2 | `POST` | `/api/exam/key/parse` | `file: UploadFile` (multipart) | `200 KeyDraft` | `400 INVALID_FILE`<br>`409 WRONG_STATE` | `exam`, `drafts` | Guard: `state == "FINAL"` -> 409.<br>File must be `.pdf` or `.docx`, <= 10 MB. Saves to `data/keys/{uuid}_{filename}`. Calls `parse_key_file()`. Stores draft in `drafts`. Updates `exam.state = "KEY_PARSED"`. |
| 3 | `POST` | `/api/exam/key/confirm` | `ConfirmKeyRequest` (JSON) | `200 ExamState` | `409 WRONG_STATE`<br>`422 VALIDATION_ERROR` | `exam`, `questions`, `key_points`, `answers` | Guard: `state == "FINAL"` -> 409.<br>Validates: unique non-empty numbers, `max_marks > 0`, >= 1 key point per question, key point text non-empty.<br>Transaction: deletes existing questions/key points/answers, inserts new, calls `embed_texts()`, stores BLOBs, sets `state = "READY"`. |
| 4 | `PATCH` | `/api/exam/settings` | `SettingsRequest` (JSON) | `200 ExamState` | `422 VALIDATION_ERROR` | `exam`, `questions`, `key_points`, `students` | Optional fields: `subject`, `point_threshold` (0.40–0.75), `borderline_band` (0.05–0.20). Updates exam row and returns updated `ExamState`. |
| 5 | `GET` | `/api/exam/key/file` | None | `200 FileResponse` (binary) | `404 NOT_FOUND` | `exam` | Streams saved `.pdf` / `.docx` with `Content-Disposition`. 404 if no key file exists on disk. |
| 6 | `POST` | `/api/exam/reset` | None | `200 ExamState` | `500 INTERNAL` | `exam`, `questions`, `key_points`, `students`, `answers`, `jobs`, `drafts` | Clears all data rows (except re-initializing singleton `exam`). Deletes physical files in `data/keys` and `data/images`. Sets `state = "NO_KEY"`. |
| 7 | `POST` | `/api/students` | `{usn, name?}`, query `replace: bool = false` | `201 StudentSummary`<br>(or `200` on replace) | `409 DUPLICATE_USN`<br>`409 WRONG_STATE`<br>`422 VALIDATION_ERROR` | `students`, `answers`, `jobs` | Guard: `state == "NO_KEY"` -> 409.<br>USN trimmed, non-empty. If exists and `replace=false` -> 409 `DUPLICATE_USN`. If `replace=true` -> overwrites student, resets answers and jobs for student. |
| 8 | `GET` | `/api/students` | None | `200 StudentSummary[]` | `409 WRONG_STATE` | `students`, `answers`, `questions` | Guard: `state == "NO_KEY"` -> 409.<br>Computes `answered`, `total`, `average`, `flags`, and `status` (`not_started` / `in_progress` / `complete`). |
| 9 | `GET` | `/api/students/{usn}` | Path `usn` | `200 StudentDetail` | `404 NOT_FOUND`<br>`409 WRONG_STATE` | `students`, `questions`, `answers`, `key_points` | Guard: `state == "NO_KEY"` -> 409.<br>404 if student missing. Returns student info, `total_marks`, `max_marks`, and full `Answer[]` list containing every question in sequence (synthesizing pending answers if not uploaded). |
| 10 | `POST` | `/api/students/{usn}/answers/{question_id}` | Path `usn`, `question_id`; `file: UploadFile` | `202 {"job_id": "j_..."}` | `400 INVALID_FILE`<br>`404 NOT_FOUND`<br>`409 WRONG_STATE` | `students`, `questions`, `answers`, `jobs` | Guard: `state == "NO_KEY"` -> 409.<br>Validates student & question existence (404). File: `image/jpeg`, `image/png`, `image/webp`, <= 10 MB (400). Saves file, upserts `answers` row (`status = "processing"`), creates `jobs` row (`status = "queued"`), commits, calls `enqueue(job_id)`. |
| 11 | `DELETE` | `/api/students/{usn}/answers/{question_id}` | Path `usn`, `question_id` | `204 No Content` | `404 NOT_FOUND`<br>`409 WRONG_STATE` | `answers`, `jobs` | Guard: `state == "NO_KEY"` -> 409.<br>404 if student or question missing. Removes image file, deletes associated jobs, resets answer row to `status = "pending"` with nullified metrics. |
| 12 | `PATCH` | `/api/answers/{answer_id}` | Path `answer_id`; `ReviewRequest` (JSON) | `200 Answer` | `404 NOT_FOUND`<br>`422 VALIDATION_ERROR` | `answers`, `questions`, `key_points` | 404 if answer not found. Validates `0 <= final_marks <= max_marks`. If `decision == "overridden"`, `reason` is required. Updates `final_marks`, `decision`, `review_reason`. Returns reconstructed `Answer`. |
| 13 | `GET` | `/api/answers/{answer_id}/image` | Path `answer_id` | `200 FileResponse` (image) | `404 NOT_FOUND` | `answers` | Serves normalized JPEG from `image_path`. 404 if answer or file missing. |
| 14 | `GET` | `/api/jobs/{job_id}` | Path `job_id` | `200 Job` | `404 NOT_FOUND` | `jobs` | Returns `Job` schema. 404 if unknown job. If `error_code` is set, maps into `error: {code, message}`. |
| 15 | `GET` | `/api/exam/marksheet` | None | `200 Marksheet` | `500 INTERNAL` | `exam`, `questions`, `students`, `answers` | Returns matrix of marks keyed by string question_id, totals, flags, student status, review status (`pending` vs `reviewed`), and `class_average`. |
| 16 | `GET` | `/api/exam/marksheet.csv` | None | `200 Response` (`text/csv; charset=utf-8`) | `500 INTERNAL` | `exam`, `questions`, `students`, `answers` | Generates CSV with header `USN,Name,Q<number1>,...,Total,Max,Flags,Review_Status`. Blank cell for unevaluated answers. Values match JSON marksheet exactly. |
| 17 | `POST` | `/api/exam/approve` | None | `200 ExamState` | `409 WRONG_STATE`<br>`409 UNREVIEWED_ANSWERS` | `exam`, `answers` | Guard: `state != "READY"` -> 409 `WRONG_STATE`.<br>Checks if any answer has `needs_review = true` and `decision == "pending"`. If any exist, returns 409 `UNREVIEWED_ANSWERS` with `detail: {"unreviewed_count": N}`. Otherwise sets `state = "FINAL"`. |

---

## 3. Database Plan

### 3.1 SQLite DDL Schema (`backend/app/core/db.py`)
```sql
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
```

### 3.2 Connection Lifecycle & Concurrency
- **File Location:** `data/smarteval.db`.
- **WAL Mode & Foreign Keys:** Every connection executes:
  ```python
  conn = sqlite3.connect(settings.DATABASE_PATH, timeout=30.0)
  conn.row_factory = sqlite3.Row
  conn.execute("PRAGMA journal_mode = WAL;")
  conn.execute("PRAGMA foreign_keys = ON;")
  ```
- **Connection Isolation:** No shared global connection.
  - FastAPI requests utilize a dependency generator:
    ```python
    def get_db():
        conn = get_conn()
        try:
            yield conn
        finally:
            conn.close()
    ```
  - Worker thread opens its own independent connection per job.
- **Transactions:** Write operations use `with conn:` context managers ensuring automatic `COMMIT` on success and `ROLLBACK` on exception.

### 3.3 Core Helpers in `backend/app/core/db.py`
- `init_db()`: Idempotently creates tables and seeds the singleton `exam` row (`id = 1`) if missing.
- `now_iso() -> str`: Returns `datetime.now(timezone.utc).strftime("%Y-%m-%dT%H:%M:%SZ")`.
- `vec_to_blob(vector: list[float]) -> bytes`: Serializes a float list to 384-dimensional `float32` bytes using `struct.pack` or numpy.
- `blob_to_vec(blob: bytes) -> list[float]`: Deserializes `float32` bytes back into float values.

---

## 4. Dependency Plan on Dev B

Dev A must remain completely decoupled from Dev B's work while guaranteeing immediate plug-and-play integration.

### 4.1 Interface Signatures (from `WORK_SPLIT.md` §1)
```python
# ml/types.py
@dataclass
class KeyParseResult:
    questions: list[dict]
    warnings: list[str] = field(default_factory=list)

@dataclass
class TranscriptResult:
    text: str
    confidence: float
    legibility: str
    contains_diagram: bool
    model: str
    cached: bool = False

@dataclass
class ScoreResult:
    matches: list[dict]
    coverage: float
    covered_count: int
    key_point_count: int
    suggested_marks: float
    flags: list[str]

# ml/key_parse.py:  parse_key_file(path: Path, filename: str) -> KeyParseResult
# ml/score.py:      embed_texts(texts: list[str]) -> list[list[float]]
# ml/score.py:      score_answer(transcript, key_points, max_marks, point_threshold, borderline_band) -> ScoreResult
# ml/transcribe.py: transcribe_image(path: Path, question_number: str) -> TranscriptResult
# core/worker.py:   enqueue(job_id: str) -> None
```

### 4.2 Pre-Delivery Strategy (Mocking in Dev A Scope)
Dev A owns `backend/tests/test_api.py` and application code, but **must NOT edit `backend/app/ml/**` or `backend/app/core/worker.py`**.
To build and test Dev A endpoints before Dev B delivers:
1. **Fallback Safe Imports:** In `app/api/exam.py` and `app/api/answers.py`, import from `app.ml.*` and `app.core.worker` inside a try-except block or thin wrapper:
   ```python
   # Inside app/core/dependencies.py or local router imports:
   try:
       from app.ml.key_parse import parse_key_file
       from app.ml.score import embed_texts
       from app.core.worker import enqueue
   except ImportError:
       # Safe fallback stubs for Dev A standalone test runner
       ...
   ```
2. **Pytest Fixtures:** In `tests/test_api.py`, use `pytest.fixture(autouse=True)` or `monkeypatch` / `unittest.mock.patch` to mock:
   - `app.ml.key_parse.parse_key_file` -> returns mock `KeyParseResult` with 3 demo questions (`1a`, `1b`, `2a`).
   - `app.ml.score.embed_texts` -> returns list of dummy 384-dim normalized float vectors (`[0.1] * 384`).
   - `app.core.worker.enqueue` -> mock recording the `job_id`.
3. **Phase 0 Integration:** Once Dev B commits `ml/types.py` and fixture stubs, Dev A removes test mocks and verifies that the real fixture-backed ML code runs seamlessly with zero changes to Dev A routes.

---

## 5. Work Packages for Parallel Execution

```
                     ┌───────────────────────────────┐
                     │            WAVE 1             │
                     │  WP1: Core (Config, DB, Err)  │
                     │  WP2: Pydantic Schemas        │
                     └───────────────────────────────┘
                                     │
         ┌───────────────────────────┼───────────────────────────┐
         ▼                           ▼                           ▼
  ┌──────────────┐            ┌──────────────┐            ┌──────────────┐
  │    WAVE 2    │            │    WAVE 2    │            │    WAVE 2    │
  │  WP3: Exam   │            │ WP4: Student │            │  WP5: Answer │
  │    Router    │            │    Router    │            │    & Jobs    │
  └──────────────┘            └──────────────┘            └──────────────┘
         │                           │                           │
         └───────────────────────────┼───────────────────────────┘
                                     ▼
                              ┌──────────────┐
                              │    WAVE 2    │
                              │ WP6: Marksht │
                              │    Router    │
                              └──────────────┘
                                     │
                                     ▼
                     ┌───────────────────────────────┐
                     │            WAVE 3             │
                     │  WP7: Demo Seed Script        │
                     │  WP8: Comprehensive Tests     │
                     └───────────────────────────────┘
```

### Wave 1: Foundation (Prerequisites)

#### WP1: Core Foundation & Infrastructure
- **Owned Files:**
  - `backend/app/core/config.py`
  - `backend/app/core/db.py`
  - `backend/app/core/errors.py`
  - `backend/app/main.py`
  - `backend/requirements.txt`
- **Inputs:** `BACKEND.md` §2, §4, §10; `API_CONTRACT.md` Errors section.
- **Outputs:**
  - `Settings` class loading all env vars with defaults.
  - SQLite database initialization (`init_db`), WAL mode, `get_conn()` context manager, table DDL.
  - `ApiError` exception class and custom exception handler mapping all HTTP errors and validation errors to contract shape `{"error": {"code", "message", "detail"}}`.
  - FastAPI application in `main.py` configured with CORS (`http://localhost:5173`), error handlers, and lifecycle setup.
- **Dependencies:** None.
- **Acceptance Criteria:**
  - Running `uvicorn app.main:app` starts without errors.
  - Request to non-existent route returns `404` with contract error envelope.

#### WP2: API Request & Response Schemas
- **Owned Files:**
  - `backend/app/api/schemas.py`
- **Inputs:** `docs/API_CONTRACT.md` v1.4 Schemas & Enums.
- **Outputs:**
  - Pydantic models for: `ExamKeyPoint`, `ExamQuestion`, `ExamState`, `DraftKeyPoint`, `DraftQuestion`, `KeyDraft`, `ConfirmQuestion`, `ConfirmKeyRequest`, `SettingsRequest`, `StudentSummary`, `MatchedKeyPoint`, `Answer`, `StudentDetail`, `ReviewRequest`, `Job`, `MarksheetQuestion`, `MarksheetRow`, `Marksheet`, `ApiErrorBody`.
- **Dependencies:** WP1.
- **Acceptance Criteria:**
  - Models enforce strict serialization of `snake_case`.
  - All nullable fields have explicit `None` defaults so they serialize as `null` instead of being omitted.
  - Question `number` typed as string.

---

### Wave 2: Core Endpoints (Parallel Execution)

#### WP3: Exam & Key Management Router
- **Owned Files:**
  - `backend/app/api/exam.py`
- **Inputs:** WP1, WP2; Dev B interface `parse_key_file`, `embed_texts`.
- **Outputs:** Endpoints:
  - `GET /api/exam`
  - `POST /api/exam/key/parse`
  - `POST /api/exam/key/confirm`
  - `PATCH /api/exam/settings`
  - `GET /api/exam/key/file`
  - `POST /api/exam/reset`
- **Dependencies:** WP1, WP2.
- **Acceptance Criteria:**
  - Fresh DB returns `state: "NO_KEY"`.
  - Validates file type and size.
  - Confirms key, calculates vectors, updates state to `READY`.
  - Guard: rejects `parse`/`confirm` when state is `FINAL` with `409 WRONG_STATE`.

#### WP4: Students Router
- **Owned Files:**
  - `backend/app/api/students.py`
- **Inputs:** WP1, WP2.
- **Outputs:** Endpoints:
  - `POST /api/students` (with `?replace=true`)
  - `GET /api/students`
  - `GET /api/students/{usn}`
- **Dependencies:** WP1, WP2.
- **Acceptance Criteria:**
  - Guard: returns `409 WRONG_STATE` if exam is `NO_KEY`.
  - Duplicate USN returns `409 DUPLICATE_USN` unless `replace=true`.
  - `GET /api/students/{usn}` returns an `Answer` object for every question defined in the exam, even if unsubmitted.

#### WP5: Answers & Jobs Router
- **Owned Files:**
  - `backend/app/api/answers.py`
  - `backend/app/api/jobs.py`
- **Inputs:** WP1, WP2; Dev B interface `enqueue`.
- **Outputs:** Endpoints:
  - `POST /api/students/{usn}/answers/{question_id}`
  - `DELETE /api/students/{usn}/answers/{question_id}`
  - `PATCH /api/answers/{answer_id}`
  - `GET /api/answers/{answer_id}/image`
  - `GET /api/jobs/{job_id}`
- **Dependencies:** WP1, WP2.
- **Acceptance Criteria:**
  - Upload validates MIME types (`image/jpeg`, `image/png`, `image/webp`) and 10MB limit. Returns `202 {"job_id": "j_..."}`.
  - `DELETE` resets answer to `pending` and purges jobs.
  - `PATCH` validates `0 <= final_marks <= max_marks` and requires `reason` when `decision == "overridden"`.
  - `GET /api/jobs/{job_id}` returns job status and error payload if failed.

#### WP6: Marksheet & Approval Router
- **Owned Files:**
  - `backend/app/api/marksheet.py`
- **Inputs:** WP1, WP2.
- **Outputs:** Endpoints:
  - `GET /api/exam/marksheet`
  - `GET /api/exam/marksheet.csv`
  - `POST /api/exam/approve`
- **Dependencies:** WP1, WP2.
- **Acceptance Criteria:**
  - JSON marksheet contains string-keyed marks dictionary per student.
  - CSV output contains columns `USN,Name,Q<num1>,...,Total,Max,Flags,Review_Status` and matches JSON numbers exactly.
  - `approve` returns `409 UNREVIEWED_ANSWERS` if any answer has flags and `decision == "pending"`.
  - `approve` locks exam state to `FINAL`.

---

### Wave 3: Integration, Demo Seed & Testing

#### WP7: Demo Seed Script
- **Owned Files:**
  - `backend/fixtures/demo_seed.py`
- **Inputs:** Database schema, sample CN key data.
- **Outputs:**
  - Executable standalone module: `python -m fixtures.demo_seed`.
  - Idempotent database seeder configuring:
    - Exam `Computer Networks` in `READY` state.
    - Questions `1a` (3 marks), `1b` (3 marks), `2a` (6 marks).
    - Dynamically queries generated `key_point` IDs from SQLite.
    - Inserts Student 1 (`4SF22CS001`, Asha Rao) - clean slate for live demo.
    - Inserts Student 2 (`4SF22CS002`, Ravi Kumar) - pre-evaluated with accepted marks.
- **Dependencies:** WP1, WP2, WP3, WP4, WP5.
- **Acceptance Criteria:**
  - Can run multiple times without primary key or unique constraint violations.
  - After seeding, `GET /api/exam` returns `READY`, `GET /api/students` lists 2 students.

#### WP8: Comprehensive API Test Suite
- **Owned Files:**
  - `backend/tests/test_api.py`
- **Inputs:** Full test plan, all API routers.
- **Outputs:**
  - Automated pytest test suite exercising all endpoints and contract edge cases against an isolated temporary SQLite database.
- **Dependencies:** WP1 through WP6.
- **Acceptance Criteria:**
  - 100% of tests pass via `pytest tests/test_api.py -q`.

---

## 6. Test Plan (`backend/tests/test_api.py`)

All tests run using `httpx.AsyncClient` or `starlette.testclient.TestClient` against a fresh temporary SQLite database (`tmp_path / "test.db"`).

### Required Test Cases
1. **Fresh DB State (`test_fresh_db_state`):**
   - Assert `GET /api/exam` returns HTTP 200, `state == "NO_KEY"`, `questions == []`, `question_count == 0`, `student_count == 0`.
2. **Duplicate USN (`test_student_duplicate_usn`):**
   - `POST /api/students` with `{usn: "4SF22CS001"}` returns 201.
   - Repeated `POST /api/students` returns 409 with error code `DUPLICATE_USN`.
   - `POST /api/students?replace=true` returns 200 and updates the student.
3. **State Guard Enforcement (`test_state_guards`):**
   - In `NO_KEY`, verify `POST /api/students`, `GET /api/students`, and `POST /api/students/{usn}/answers/1` all return 409 `WRONG_STATE`.
4. **Invalid Upload Type (`test_upload_invalid_file`):**
   - Upload text file (`notes.txt`, `text/plain`) to `/api/exam/key/parse` -> 400 `INVALID_FILE`.
   - Upload PDF to `/api/students/{usn}/answers/{qid}` -> 400 `INVALID_FILE`.
5. **Key Confirm Validation (`test_confirm_key_validation`):**
   - Duplicate question numbers (e.g. two `1a` questions) -> 422 `VALIDATION_ERROR`.
   - Question with `max_marks <= 0` -> 422 `VALIDATION_ERROR`.
   - Question with empty `key_points` -> 422 `VALIDATION_ERROR`.
6. **Pending Answers Presence (`test_student_detail_pending_answers`):**
   - Confirm key with 3 questions. Create student `4SF22CS001`.
   - `GET /api/students/4SF22CS001` returns HTTP 200.
   - `answers` array has length 3.
   - Each answer has `answer_id: null`, `status: "pending"`, `needs_review: false`, `decision: null`.
7. **Answer Review Validation (`test_answer_review_validation`):**
   - Score answer for question with `max_marks = 5`.
   - `PATCH /api/answers/{id}` with `final_marks = 6.0` -> 422 `VALIDATION_ERROR`.
   - `PATCH /api/answers/{id}` with `final_marks = -1.0` -> 422 `VALIDATION_ERROR`.
   - `PATCH /api/answers/{id}` with `decision = "overridden"` and missing `reason` -> 422 `VALIDATION_ERROR`.
   - `PATCH` with `decision = "overridden"` and valid `reason` -> 200 `Answer`.
8. **Approval Guard (`test_approve_unreviewed_guard`):**
   - Insert evaluated answer with `flags = ["borderline"]` and `decision = "pending"`.
   - `POST /api/exam/approve` returns 409 `UNREVIEWED_ANSWERS` with `detail.unreviewed_count >= 1`.
   - Update decision to `accepted` or `overridden`.
   - `POST /api/exam/approve` succeeds (200), setting state to `FINAL`.
   - In `FINAL` state, `POST /api/exam/key/parse` returns 409 `WRONG_STATE`.
9. **Marksheet JSON vs CSV Agreement (`test_marksheet_json_csv_agreement`):**
   - Fetch `GET /api/exam/marksheet` and `GET /api/exam/marksheet.csv`.
   - Parse CSV into rows and headers.
   - Assert CSV headers match `USN,Name,Q<num1>,...,Total,Max,Flags,Review_Status`.
   - Assert every student's total, marks, and status in CSV match the JSON object verbatim.
10. **Contract Nullability Check (`test_contract_null_fields_present`):**
    - Assert `key_filename`, `transcript`, `ocr_confidence`, `suggested_marks`, etc., are present as explicit `None` / `null` in the JSON response when unevaluated.

---

## 7. Demo Seed Plan (`backend/fixtures/demo_seed.py`)

- **Execution Command:**
  ```powershell
  cd backend
  python -m fixtures.demo_seed
  ```
- **Requirements & Invariants:**
  1. **Idempotence:** Safe to run repeatedly without primary key collision. Cleans or resets existing data prior to seeding.
  2. **Exam Row:**
     - State: `READY`
     - Subject: `"Computer Networks"`
     - `point_threshold`: 0.55, `borderline_band`: 0.10
     - `key_filename`: `"CN_CIE1_AnswerKey.docx"`
  3. **Questions:**
     - `1a`: `"Define the OSI reference model and explain the functions of the Physical, Data Link, and Network layers."`, `max_marks: 3.0`
     - `1b`: `"Differentiate between TCP and UDP protocols based on connection type, reliability, and header size."`, `max_marks: 3.0`
     - `2a`: `"Explain the working of Dijkstra's shortest path routing algorithm with an example network."`, `max_marks: 6.0`
  4. **Dynamic Key-Point IDs:**
     - Key points are inserted per question.
     - Key point IDs are dynamically retrieved via `SELECT id FROM key_points WHERE question_id = ?` and used to construct `matches` JSON for Student 2. Never hardcode numeric IDs.
  5. **Students:**
     - **Student 1 (Live Demo):** `4SF22CS001`, `"Asha Rao"`. No evaluated answers; ready for on-stage live upload of question `2a`.
     - **Student 2 (Pre-Evaluated Benchmark):** `4SF22CS002`, `"Ravi Kumar"`.
       - Fully evaluated on all 3 questions (`1a`: 3.0, `1b`: 2.5, `2a`: 5.0 = 10.5 total).
       - Decisions marked as `accepted`.
       - `review_status`: `"reviewed"`.

---

## 8. Git Plan

### 8.1 Branch Safety
- **Active Branch:** `BackendDev-A`.
- Never commit to `main`, `BackendDev-B`, `F1`, or `F2`.
- Never force push (`git push -f`).

### 8.2 Commit Granularity & Conventions
Each work package corresponds to clean, atomic commits following conventional commit tags:

| Wave / Step | Commit Message | Files Included |
|---|---|---|
| Wave 1 (Core) | `feat(api): setup config, database schema, and custom error handlers` | `backend/app/core/config.py`, `backend/app/core/db.py`, `backend/app/core/errors.py`, `backend/app/main.py` |
| Wave 1 (Schemas) | `feat(api): define pydantic schemas matching contract v1.4` | `backend/app/api/schemas.py` |
| Wave 2 (Exam) | `feat(api): implement exam setup and key management endpoints` | `backend/app/api/exam.py` |
| Wave 2 (Students) | `feat(api): implement student management and detail endpoints` | `backend/app/api/students.py` |
| Wave 2 (Answers) | `feat(api): implement answer upload, review, and job status endpoints` | `backend/app/api/answers.py`, `backend/app/api/jobs.py` |
| Wave 2 (Marksheet) | `feat(api): implement marksheet calculation, CSV export, and approval` | `backend/app/api/marksheet.py` |
| Wave 3 (Seed) | `feat(api): add idempotent demo seed script for two students` | `backend/fixtures/demo_seed.py` |
| Wave 3 (Tests) | `test(api): add complete contract test suite in test_api.py` | `backend/tests/test_api.py` |
| Integration | `chore(backend): finalize dependencies and integration wiring` | `backend/requirements.txt` |

---

## 9. Risks, Ambiguities, and Open Questions

> [!IMPORTANT]
> The following items represent subtle ambiguities or edge cases observed across `docs/API_CONTRACT.md`, `docs/BACKEND.md`, and `frontend/src/api/types.ts`. They are flagged here for user/lecturer confirmation. No contract or schema changes are assumed.

### 9.1 Open Questions for User Approval
1. **StudentSummary `average` Calculation:**
   - In `StudentSummary`, is `average` the average mark per question (i.e. `total_marks / answered_count`), or percentage score?
   - *Observation:* In `frontend/src/api/mocks/marksheet.json` and `students.json`, Asha Rao has total marks 11.0 over 3 questions with `average: 3.7` ($11.0 / 3 \approx 3.67$). We propose computing: `round(sum(marks) / answered, 1)` when `answered > 0`, else `None`.
2. **StudentSummary `flags` Count:**
   - Does `flags: number` in `StudentSummary` count the total number of flagged answer items (e.g. 1 student answer has 2 flags -> count 2), or the number of answers that require review (count 1)?
   - *Observation:* `API_CONTRACT.md` line 357 notes `flags: 1`. We propose counting the distinct number of evaluated answers that have `len(flags) > 0`.
3. **`needs_review` After Review Completion:**
   - When an answer with `flags: ["borderline"]` is reviewed via `PATCH /api/answers/{answer_id}` with `decision: "accepted"`, does `needs_review` remain `true` (reflecting the flag presence) or become `false` (since it has already been reviewed)?
   - *Observation:* `API_CONTRACT.md` says: "`needs_review` is `true` when any flag is set". However, `approve` checks: `needs_review: true and decision: "pending"`. We propose keeping `needs_review = bool(flags)` and checking `decision == "pending"` for approval blocking, exactly as contract specifies.
4. **`POST /api/exam/reset` Scope on Filesystem:**
   - `docs/BACKEND.md` §5 notes reset deletes students, answers, jobs, questions, drafts, and images. Should it physically remove all stored files in `data/keys/` and `data/images/`, or just truncate the database tables?
   - *Observation:* We propose cleaning both the database tables and purging files inside `data/keys/` and `data/images/` (preserving directory structure and `.gitkeep`).
5. **Manual Key Entry File Serving:**
   - If a lecturer inputs questions manually, `draft_id` is `null` and no physical key file is uploaded. If `GET /api/exam/key/file` is called in this state, should it return 404 `NOT_FOUND`?
   - *Observation:* We propose returning HTTP 404 with error code `NOT_FOUND` and message `"No key file associated with this exam"`.

---

## 10. Definition-of-Done Checklist (Dev A)

Directly copied from `docs/WORK_SPLIT.md` §7, with concrete automated and manual verification methods:

- [ ] **Fresh DB → `GET /api/exam` returns `NO_KEY`.**
  - *Verification:* `pytest tests/test_api.py::test_fresh_db_state` and manual curl on empty `data/smarteval.db`.
- [ ] **Key upload/confirm → `READY`; numbers are strings.**
  - *Verification:* `pytest tests/test_api.py::test_key_parse_and_confirm` verifies HTTP 200, state `READY`, and `questions[0]["number"] == "1a"` (type `str`).
- [ ] **Two students; duplicate USN → `409`.**
  - *Verification:* `pytest tests/test_api.py::test_student_duplicate_usn` checks HTTP 409 and error code `DUPLICATE_USN`.
- [ ] **Three uploads → `202`, jobs poll to `done`.**
  - *Verification:* `pytest tests/test_api.py::test_answer_upload_and_job_poll` checks `202 {"job_id": "j_..."}` and polls `/api/jobs/{id}`.
- [ ] **Review accepted and overridden answers.**
  - *Verification:* `pytest tests/test_api.py::test_answer_review_validation` checks accept, override with reason, and rejection of out-of-bounds marks.
- [ ] **Marksheet + CSV match; approve guard works.**
  - *Verification:* `pytest tests/test_api.py::test_marksheet_json_csv_agreement` and `test_approve_unreviewed_guard`.
- [ ] **All errors use the contract shape.**
  - *Verification:* `pytest tests/test_api.py::test_contract_error_envelope` checks structure `{"error": {"code", "message", "detail"}}` on 400, 404, 409, 422.
- [ ] **`pytest tests/test_api.py` passes.**
  - *Verification:* PowerShell: `pytest tests/test_api.py -q` reports 100% passed.
