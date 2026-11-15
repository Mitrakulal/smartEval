# Work Split — Two Backend Developers

**Goal:** a demo-ready backend in the smallest path, not a production system.
**Read first:** `docs/BACKEND.md`, `docs/API_CONTRACT.md` v1.4, `docs/FRONTEND.md`.
**Rule:** one owner per file. Do not edit the other person's files without a handoff.

This split is only for the **backend pair**. Frontend ownership stays with F1/F2
as defined in `docs/FRONTEND.md`.

This split is by **layer**, not by endpoint, so both people can work in parallel
without constant merge conflicts.

| Area | Dev A — API & Data | Dev B — AI & Pipeline |
|---|---|---|
| FastAPI app, routers, schemas | **Owns** | — |
| SQLite schema, connections | **Owns** | Uses `get_conn()` |
| Job rows and API polling | **Owns** | — |
| Worker process | Uses `enqueue()` | **Owns** |
| Key text extraction + Gemini parse | Uses `parse_key_file()` | **Owns** |
| Gemini vision + transcript cache | Uses `transcribe_image()` | **Owns** |
| MiniLM embeddings + scoring | Uses `embed_texts()` / `score_answer()` | **Owns** |
| Demo seed + rehearsal | **Owns** | Provides fixtures |
| API tests | **Owns** | — |
| ML tests | — | **Owns** |

---

## 1. Shared interface (freeze this first)

Dev B commits `backend/app/ml/types.py` and stubs before Dev A writes endpoints.
Both sides code against these signatures.

```python
# backend/app/ml/types.py
from dataclasses import dataclass, field


@dataclass
class KeyParseResult:
    questions: list[dict]          # matches DraftQuestion minus draft_id
    warnings: list[str] = field(default_factory=list)


@dataclass
class TranscriptResult:
    text: str
    confidence: float              # 0.0 – 1.0, proxy from legibility
    legibility: str                # "high" | "medium" | "low"
    contains_diagram: bool
    model: str
    cached: bool = False


@dataclass
class ScoreResult:
    matches: list[dict]            # {id, text, covered, similarity, borderline}
    coverage: float
    covered_count: int
    key_point_count: int
    suggested_marks: float
    flags: list[str]
```

```python
# backend/app/ml/key_parse.py
from pathlib import Path

def parse_key_file(path: Path, filename: str) -> KeyParseResult: ...


# backend/app/ml/score.py
def embed_texts(texts: list[str]) -> list[list[float]]: ...
def score_answer(
    transcript: str,
    key_points: list[dict],        # {id: int, text: str, embedding: bytes | None}
    max_marks: float,
    point_threshold: float,
    borderline_band: float,
) -> ScoreResult: ...


# backend/app/ml/transcribe.py
def transcribe_image(path: Path, question_number: str) -> TranscriptResult: ...


# backend/app/core/worker.py
def enqueue(job_id: str) -> None: ...
```

Rules:

- `parse_key_file` never creates a `draft_id`; Dev A does that and stores the draft.
- `embed_texts` returns normalized vectors; Dev A stores them as `float32` BLOBs.
- `score_answer` may recompute embeddings if `embedding` is `None`.
- `enqueue` must be called only after the job row is committed.
- Both sides use the schema in `BACKEND.md` §4. If a column is missing, ask the
  other person; do not silently alter the schema.

---

## 2. Dev A — API & Data

**Files you own**

```text
backend/app/main.py
backend/app/core/config.py
backend/app/core/db.py
backend/app/core/errors.py
backend/app/api/**
backend/tests/test_api.py
backend/fixtures/demo_seed.py
backend/requirements.txt
```

**Do not edit:** `backend/app/ml/**`, `backend/app/core/worker.py`.

### Deliverables, in order

1. **Bootstrap**
   - `main.py` with FastAPI, CORS for `http://localhost:5173`, routers, and the
     contract error handler.
   - `config.py` with every env var in `BACKEND.md` §10.
   - `db.py`: schema creation, `PRAGMA journal_mode=WAL`,
     `PRAGMA foreign_keys=ON`, `get_conn()` context manager, `now_iso()`,
     `init_db()`.
   - Fresh DB returns `NO_KEY` from `GET /api/exam`.

2. **Exam endpoints**
   - `GET /api/exam` builds `ExamState` from the DB.
   - `POST /api/exam/key/parse`: validate `.pdf`/`.docx` and 10 MB, save under
     `data/keys/`, call `parse_key_file()`, create `draft_id`, store the draft,
     set state `KEY_PARSED`.
   - `POST /api/exam/key/confirm`: validate duplicates, marks, key points;
     replace questions/key points; call `embed_texts()`; store BLOBs; set
     `READY`.
   - `PATCH /api/exam/settings`, `GET /api/exam/key/file`, `POST /api/exam/reset`.
   - Return `409 WRONG_STATE` for parse/confirm when `FINAL`.

3. **Students**
   - `POST /api/students` with `?replace=true`.
   - `GET /api/students` summaries: answered, total, average, flags, status.
   - `GET /api/students/{usn}` detail with one `Answer` per question. Pending
     answers must still be present, with `answer_id: null` and zeroed matches.

4. **Answers and jobs**
   - Upload: validate `image/jpeg|png|webp` and 10 MB; save image; upsert the
     answer; create job; `enqueue(job_id)`; return `202 {job_id}`.
   - `GET`/`DELETE` the answer image; delete resets to `pending` and removes jobs.
   - `PATCH /api/answers/{answer_id}`: validate `0 <= final_marks <= max_marks`;
     require `reason` for `overridden`; return the rebuilt `Answer`.
   - `GET /api/jobs/{job_id}`.

5. **Marksheet**
   - `GET /api/exam/marksheet`: rows keyed by `question_id` string, totals,
     flags, review status, class average.
   - `GET /api/exam/marksheet.csv`: `Q<number>` columns, blank for unevaluated.
   - `POST /api/exam/approve`: `409 UNREVIEWED_ANSWERS` if any answer has flags
     and `decision == "pending"`.

6. **Demo seed**
   - Two students, three questions (`1a`, `1b`, `2a`), student 2 fully evaluated.
   - Load key-point IDs from the confirmed key; do not hardcode IDs.
   - Seed must be idempotent (`python -m fixtures.demo_seed` can be run twice).

### Contract checks you own

- `snake_case`; nullable keys always present.
- Question numbers are strings.
- Errors are `{"error": {"code", "message", "detail"}}`.
- `202` upload response is exactly `{"job_id": "j_..."}`.
- `GET /api/students/{usn}` never omits a question.
- No new endpoints, fields, or state names.

### Tests

```powershell
cd backend
.\.venv\Scripts\Activate.ps1
pytest tests/test_api.py -q
```

Minimum cases:

- fresh DB → `NO_KEY`
- duplicate USN → `409`
- upload wrong type → `400 INVALID_FILE`
- review out of range → `422`
- approve with pending review → `409`
- marksheet JSON and CSV agree

---

## 3. Dev B — AI & Pipeline

**Files you own**

```text
backend/app/ml/**
backend/app/core/worker.py
backend/tests/test_ml.py
backend/fixtures/demo_key_draft.json
backend/fixtures/demo_transcripts.json
```

**Do not edit:** `backend/app/api/**`, `main.py`, `core/db.py`,
`core/config.py`, `core/errors.py`, `requirements.txt`.

### Deliverables, in order

1. **Phase 0 — interfaces and fixtures**
   - Commit `ml/types.py` with the dataclasses above.
   - Commit fixture-backed versions of `parse_key_file`, `transcribe_image`,
     `score_answer`, and `embed_texts` so Dev A can build endpoints before
     Gemini is wired.
   - Fixtures:
     - `demo_key_draft.json`: the three demo questions `1a`, `1b`, `2a`, with
       3 + 3 + 6 key points.
     - `demo_transcripts.json`: one answer per question, written to cover most
       key points.
   - Notify Dev A of the commit hash and the fixture paths.

2. **Gemini wrapper**
   - `ml/gemini.py`: lazy `google-genai` client, JSON response mode, one retry
     on timeout/`429`/`5xx`, clear exception when the key is missing.
   - Never log the API key or full student transcript.

3. **Key parsing**
   - DOCX paragraphs + tables via `python-docx`; PDF text + tables via
     `pdfplumber`.
   - Gemini prompt and JSON validation per `BACKEND.md` §6.
   - Normalize question numbers to strings.
   - Fallback ladder: Gemini → heuristic → `demo_key_draft.json`.

4. **Preprocess and transcribe**
   - Pillow: EXIF rotate, RGB, long edge ≤ 2000 px, JPEG 90.
   - SHA-256 cache lookup in `transcript_cache`.
   - Gemini vision prompt and JSON validation per `BACKEND.md` §7.
   - Map legibility to `ocr_confidence`.
   - Fallback: cache → `demo_transcripts.json` when `DEMO_MODE=1`.

5. **Scoring**
   - `all-MiniLM-L6-v2`, normalized embeddings.
   - Split transcript into lines/sentences; cap at 60.
   - Max cosine per key point; threshold and band from arguments.
   - Coverage, nearest-half marks, flags.
   - `matches` must contain exactly the contract fields.

6. **Worker**
   - One `ThreadPoolExecutor(max_workers=1)`.
   - `enqueue(job_id)` submits.
   - Worker opens its own connection via `get_conn()`.
   - Steps and progress per `BACKEND.md` §9.
   - On success: update `answers`, `jobs`.
   - On failure: `answer.status = "error"`, `job.status = "error"`, set
     `error_code`/`error_message`, keep `answer_id`.
   - One retry only; no queue library.

### Tests

```powershell
cd backend
.\.venv\Scripts\Activate.ps1
pytest tests/test_ml.py -q
```

Minimum cases:

- fixture key parse returns 3 questions with string numbers
- empty transcript → `degenerate_transcript`, zero coverage
- perfect transcript → full coverage, full marks
- borderline similarity → `borderline` flag
- marks round to nearest 0.5
- cache hit does not call Gemini
- Gemini JSON wrapped in markdown fences still parses

---

## 4. Agent autonomy

Each developer's AI assistant is allowed to make local decisions without asking.
This is deliberate: the docs define the boundaries, not every line of code.

### It may decide on its own

- Helper and variable names inside owned files
- SQL statements, indexes, and query structure that match the schema
- Prompt wording, as long as the required fields and rules stay the same
- Retry counts, backoff, logging format, and test structure
- How to split owned code into private helpers
- Fixture content, as long as it matches the demo questions and key points
- Exact Pydantic model layout, as long as JSON matches the contract

### It must stop and ask

- Changing `docs/API_CONTRACT.md` or any field/endpoint/state name
- Adding a new endpoint, DB column, env var, or dependency
- Touching files outside its ownership
- Changing the demo question set or the 5-minute script
- Adding another cloud provider, auth, Docker, Redis, Celery, or an ORM
- Sending real student data to a free-tier API

### Default assumptions when the docs are silent

Pick the option that keeps the demo working:

1. Demo over production.
2. Fixture/cache over a failed live call.
3. One worker over concurrency.
4. SQLite over anything external.
5. Stdlib or an already-installed package over a new dependency.
6. The simplest contract-compliant JSON shape.
7. No new UI state, endpoint, or database table.

Leave a short `# DEMO:` comment when you make a non-obvious call. Do not stall on
a question that `BACKEND.md` or `API_CONTRACT.md` already answers.

---

## 5. Handoff and integration

### Phase 0 — both, first

- Dev B: interfaces + fixture implementations committed.
- Dev A: app skeleton + schema + `GET /api/exam` committed.
- Both: verify `uvicorn app.main:app` starts and `GET /api/exam` returns
  `NO_KEY`.

### Phase 1 — parallel

- Dev A: exam endpoints, students, marksheet skeleton.
- Dev B: Gemini key parse, preprocess/transcribe, scoring.

### Phase 2 — integration

- Dev A: upload/job/review endpoints and image serving.
- Dev B: worker end-to-end against Dev A's DB.
- Joint test: upload one fixture image → poll → answer evaluated → marksheet.

### Phase 3 — demo

- Dev A: seed two students, verify marksheet/CSV, rehearse server.
- Dev B: warm cache with two demo photos, keep the third fresh for a live call,
  verify fixture fallback, rehearse Gemini with the key.
- Both: full 5-minute run on the demo laptop, Wi-Fi on and off.

If a phase slips, cut from `BACKEND.md` §13, never from the demo path.

### Git

- Branches: `backend-api` (Dev A), `backend-ml` (Dev B).
- Commits: `feat(api): ...`, `feat(ml): ...`, `test(api): ...`,
  `test(ml): ...`, `chore(backend): ...`.
- Do not commit `.env`, `data/`, images, `.venv/`, or caches.
- Merge into the team's integration branch only after tests pass.
- No force pushes, no editing the other branch directly.

### Bug ownership

| Failing area | Owner |
|---|---|
| HTTP status, JSON shape, missing field | Dev A |
| DB constraint, migration, state transition | Dev A |
| Gemini response, transcript, cache | Dev B |
| Embedding, similarity, marks, flags | Dev B |
| Worker not picking up a committed job | Dev B |
| Job row never created / wrong `answer_id` | Dev A |

The non-owner provides the failing request/response or log; the owner fixes it.

---

## 6. Demo-day responsibilities

| Task | Owner |
|---|---|
| Start backend, confirm `READY` | Dev A |
| Seed student 2 and verify marksheet | Dev A |
| Check CORS/proxy and browser console | Dev A |
| Gemini key/quota, model availability | Dev B |
| Three demo photos and fixture transcripts | Dev B |
| Warm transcript cache | Dev B |
| Verify fallback with Wi-Fi off | Both |
| Final 5-minute rehearsal | Both |

If Gemini fails on stage, Dev B triggers the cache/fixture path; Dev A keeps the
server up and moves to the marksheet. Do not debug live.

---

## 7. Definition of done

### Dev A

- [ ] Fresh DB → `GET /api/exam` returns `NO_KEY`.
- [ ] Key upload/confirm → `READY`; numbers are strings.
- [ ] Two students; duplicate USN → `409`.
- [ ] Three uploads → `202`, jobs poll to `done`.
- [ ] Review accepted and overridden answers.
- [ ] Marksheet + CSV match; approve guard works.
- [ ] All errors use the contract shape.
- [ ] `pytest tests/test_api.py` passes.

### Dev B

- [ ] Fixture key parse returns the three demo questions.
- [ ] Perfect fixture transcript earns full marks.
- [ ] Empty transcript flags `degenerate_transcript` and scores zero.
- [ ] Borderline similarity flags `borderline`.
- [ ] Live Gemini transcribes the fresh demo photo; cache covers the other two.
- [ ] Cache hit avoids a second Gemini call.
- [ ] Worker completes an upload end-to-end.
- [ ] `pytest tests/test_ml.py` passes.

### Pair

- [ ] Backend works with `GEMINI_API_KEY` empty and set.
- [ ] Frontend runs with `VITE_MOCK=0` against the real API.
- [ ] The 5-minute demo passes on the demo laptop.
- [ ] Wi-Fi-off fallback shows the same marksheet.
