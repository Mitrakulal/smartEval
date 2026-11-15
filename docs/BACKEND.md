# Backend — Demo Build Plan

**Status:** Planned — no backend code yet
**Scope:** Demo-first, one exam, 2 students, 3 questions, 3 photos (2 warmed, 1 live)
**Contract:** `docs/API_CONTRACT.md` v1.4 (frozen)
**Owners:** Dev A (API & Data) and Dev B (AI & Pipeline) — see `docs/WORK_SPLIT.md`

---

## 1. What "demo-first" means

The backend exists to make one 5-minute demo work:

```text
Setup (before the demo)
  DOCX answer key
    → local text extraction
    → Gemini structured JSON
    → lecturer confirms
    → questions + key points + embeddings in SQLite
    → state READY

Evaluate (live)
  student photo
    → background job
    → Gemini vision transcription
    → MiniLM cosine scoring
    → suggested marks + flags
    → lecturer accepts or overrides

Marksheet (live)
  rows → totals → CSV
```

The live demo uses:

- **2 students** — one live, one already evaluated
- **3 questions** — `1a` (3 marks), `1b` (3 marks), `2a` (6 marks) = 12 marks
- **3 photos** — two warmed in rehearsal, one fresh for a live Gemini call
- **free Gemini tier** — one to three OCR calls is well inside any reasonable limit

If a feature is not on this path, it is out. No production hardening, no full-class
load, no exhaustive edge cases.

---

## 2. Stack

| Piece | Choice | Why |
|---|---|---|
| API | FastAPI + uvicorn | Already in `requirements.txt`; automatic JSON validation |
| DB | `sqlite3` (stdlib) | No ORM, no migrations, one file |
| Jobs | `ThreadPoolExecutor(max_workers=1)` | One worker is enough for the demo |
| Key parsing | `python-docx` / `pdfplumber` + Gemini | Born-digital text is exact; Gemini structures it |
| Handwriting | Gemini `gemini-3.5-flash-lite` | Vision + PDF/image input, free tier, structured output |
| Scoring | `sentence-transformers` `all-MiniLM-L6-v2` | Local, deterministic, explainable, no extra API calls |
| Images | Pillow | EXIF rotation, resize, JPEG conversion |
| Tests | pytest + httpx | Same stack as the frontend contract |

**Not using:** ORM, Alembic, Redis, Celery, Docker, auth, S3, Postgres, GPU.

---

## 3. Layout

```text
backend/
├── app/
│   ├── main.py                 FastAPI app, CORS, error handlers, routers
│   ├── core/
│   │   ├── config.py           env settings
│   │   ├── db.py               schema, connection helper, transactions
│   │   ├── errors.py           ApiError + contract error shape
│   │   └── worker.py           ThreadPoolExecutor job runner
│   ├── api/
│   │   ├── schemas.py          Pydantic request/response models
│   │   ├── exam.py             exam state, key parse/confirm, settings, reset
│   │   ├── students.py         create/list/detail
│   │   ├── answers.py          upload, image, delete, review
│   │   ├── jobs.py             poll
│   │   └── marksheet.py        marksheet, CSV, approve
│   └── ml/
│       ├── types.py            shared dataclasses (see WORK_SPLIT.md)
│       ├── gemini.py           SDK wrapper, JSON parsing, one retry
│       ├── key_parse.py        DOCX/PDF text extraction + Gemini + fixture
│       ├── transcribe.py       preprocess + Gemini vision + cache + fixture
│       ├── score.py            MiniLM embeddings + cosine + flags
│       └── preprocess.py       EXIF rotate, RGB, resize, JPEG
├── fixtures/
│   ├── demo_key_draft.json     3-question fallback draft
│   ├── demo_transcripts.json   fallback transcripts by question number
│   └── demo_seed.py            two-student demo data
├── tests/
│   ├── test_api.py
│   └── test_ml.py
└── requirements.txt
```

Runtime files live outside the repo, under `data/`:

```text
data/keys/      uploaded answer key
data/images/    normalized answer photos, by USN
data/smarteval.db
```

`data/` is gitignored.

---

## 4. Data model

SQLite with `PRAGMA journal_mode=WAL` and `PRAGMA foreign_keys=ON`. Each request
opens its own connection; the worker opens its own connection. No shared global
connection.

| Table | Purpose | Important columns |
|---|---|---|
| `exam` | Single exam row (`id = 1`) | `state`, `subject`, `point_threshold`, `borderline_band`, `key_filename`, `key_path`, `updated_at` |
| `questions` | Confirmed questions | `id`, `number TEXT`, `text`, `max_marks REAL`, `grading_mode`, `position` |
| `key_points` | Rubric points | `id`, `question_id`, `text`, `embedding BLOB`, `position` |
| `students` | Students | `usn TEXT PRIMARY KEY`, `name`, `created_at` |
| `answers` | One row per student/question | `id`, `usn`, `question_id`, `status`, `image_path`, `transcript`, `ocr_confidence`, `matches TEXT`, `coverage`, `suggested_marks`, `final_marks`, `decision`, `flags TEXT`, `review_reason`, `evaluated_at` |
| `jobs` | OCR/score jobs | `id TEXT PRIMARY KEY`, `answer_id`, `status`, `step`, `progress`, `message`, `error_code`, `error_message`, timestamps |
| `drafts` | Parsed key drafts | `id TEXT PRIMARY KEY`, `filename`, `payload TEXT`, `created_at` |
| `transcript_cache` | Demo insurance | `image_hash TEXT PRIMARY KEY`, `transcript`, `confidence`, `legibility`, `model`, `created_at` |

Notes:

- `questions.number` is **TEXT** (contract v1.4): `"1a"`, `"2b"`, `"4(c)"`.
- `answers` has `UNIQUE(usn, question_id)`.
- `key_points.embedding` is a normalized `float32` NumPy array stored as a BLOB,
  384 dimensions for MiniLM.
- `answers.matches` is JSON: `[{id, text, covered, similarity, borderline}]`.
- `answers.flags` is JSON: `["borderline", "zero_coverage", ...]`.
- All timestamps are ISO 8601 UTC strings ending in `Z`.

---

## 5. API surface

Implement every endpoint in `docs/API_CONTRACT.md`; the frontend already builds
against them. Demo behavior is deliberately simple.

### Exam / setup

| Method | Path | Notes |
|---|---|---|
| `GET` | `/api/exam` | Build from DB; `NO_KEY` on a fresh DB |
| `POST` | `/api/exam/key/parse` | Save upload, extract text, call `parse_key_file()`, store draft, state `KEY_PARSED` |
| `POST` | `/api/exam/key/confirm` | Validate, replace questions/key points, embed key points, state `READY` |
| `PATCH` | `/api/exam/settings` | Subject, threshold, band only |
| `GET` | `/api/exam/key/file` | Serve the saved PDF/DOCX |
| `POST` | `/api/exam/reset` | Delete students/answers/jobs/questions/drafts/images/key; state `NO_KEY` |

### Students

| Method | Path | Notes |
|---|---|---|
| `POST` | `/api/students` | `{usn, name?}`; `409 DUPLICATE_USN` unless `?replace=true` |
| `GET` | `/api/students` | `StudentSummary[]` |
| `GET` | `/api/students/{usn}` | `StudentDetail`; include a pending `Answer` for every question |

### Answers and jobs

| Method | Path | Notes |
|---|---|---|
| `POST` | `/api/students/{usn}/answers/{question_id}` | Save image, upsert answer, create job, `202 {job_id}` |
| `DELETE` | `/api/students/{usn}/answers/{question_id}` | Remove image, reset answer to `pending`, delete jobs |
| `PATCH` | `/api/answers/{answer_id}` | `ReviewRequest`; validate marks and override reason |
| `GET` | `/api/answers/{answer_id}/image` | Serve the normalized image |
| `GET` | `/api/jobs/{job_id}` | Poll job state |

### Marksheet

| Method | Path | Notes |
|---|---|---|
| `GET` | `/api/exam/marksheet` | Rows, totals, class average |
| `GET` | `/api/exam/marksheet.csv` | One `Q<number>` column per question |
| `POST` | `/api/exam/approve` | `409 UNREVIEWED_ANSWERS` if any flagged answer still has `decision: "pending"` |

`review_status` is `"reviewed"` when every evaluated answer has a decision other
than `"pending"`; otherwise `"pending"`. `class_average` is the mean of the
student totals that have at least one evaluated answer.

### Contract rules

- `snake_case` JSON keys.
- Always include nullable keys with `null`, never omit them.
- Question numbers are strings end to end.
- Marks are floats.
- Every non-2xx response uses:

```json
{"error": {"code": "VALIDATION_ERROR", "message": "...", "detail": {}}}
```

- `GET /api/students/{usn}` must return an `Answer` for every question, even
  before upload. Pending answers have `answer_id: null`, `status: "pending"`,
  `key_points` with `covered: false`, `similarity: 0`, `borderline: false`, and
  `needs_review: false`.

---

## 6. Answer-key parsing

### Input

- Accept `.pdf` and `.docx`, max 10 MB.
- Save to `data/keys/{uuid}_{original_name}`.
- Keep the original file for `GET /api/exam/key/file`.

### Text extraction

- **DOCX:** `python-docx`; read paragraphs and tables. The sample key stores its
  rubric in tables, so table rows must be included.
- **PDF:** `pdfplumber`; page text and extracted tables.
- A born-digital key does **not** need OCR. Do not send page images for the demo.
- If the text layer is empty (scanned PDF), the demo can reject with
  `INVALID_FILE` or send the PDF to Gemini. Not required for demo day.

### Gemini call

One call per exam, model `gemini-3.5-flash-lite`, temperature `0`, JSON response.

Prompt requirements:

- Extract every question and sub-question.
- Keep labels exactly: `1a`, `1b`, `2a`, `4(c)`.
- Read marks from brackets or the mark-distribution table.
- Extract the rubric key points, one point per row.
- Return JSON only, no prose.

Expected shape (matches `KeyDraft` minus backend IDs):

```json
{
  "questions": [
    {
      "number": "1a",
      "text": "Define the OSI reference model...",
      "max_marks": 3,
      "grading_mode": "semantic",
      "key_points": [
        {"text": "Names the seven layers in order.", "confidence": "parsed"}
      ],
      "confidence": {"text": "parsed", "max_marks": "parsed"}
    }
  ],
  "warnings": []
}
```

Validate the payload with Pydantic. Normalize any numeric question number to a
string. Reject negative or zero marks.

### Fallback

If Gemini is unavailable, times out, or returns invalid JSON:

1. Try the heuristic parser.
2. If that fails, load `backend/fixtures/demo_key_draft.json`.
3. Return it with `warnings: ["Demo fallback: 3-question subset"]`.

The fixture must contain the same three questions used on stage: `1a`, `1b`,
`2a`. The demo starts at `READY`, so a live key parse is demonstrated only in
rehearsal, not on stage.

### Confirm

- Reject duplicate numbers, `max_marks <= 0`, or zero key points.
- Delete old questions, key points, and answers (question IDs change).
- Insert questions and key points in order.
- Embed each key point with `embed_texts()` and store the normalized BLOB.
- Set state `READY`, update `updated_at`.
- Return the full `ExamState`.

---

## 7. Handwriting transcription

### Preprocess

- Read with Pillow.
- Apply EXIF orientation.
- Convert to RGB.
- Resize so the long edge is at most **2000 px** (do not upscale).
- Save JPEG quality 90 to `data/images/{usn}/{question_id}_{uuid}.jpg`.
- The image endpoint serves this normalized file.

### Cache

Compute SHA-256 of the normalized JPEG bytes. Look up `transcript_cache` first.
A cache hit returns the stored transcript without a Gemini call. This is the
main demo-day insurance: rehearsal warms the cache; the live run can fall back
to it. If you want one genuine live call on stage, use a photo that was **not**
rehearsed.

### Gemini call

- Model: `gemini-3.5-flash-lite`.
- Send the image inline as `image/jpeg`.
- Temperature `0`.
- JSON response.
- One retry on timeout, `429`, or `5xx`; then fail.

Prompt:

> Transcribe the handwritten answer exactly as written. Do not answer the
> question. Do not correct spelling or grammar. Preserve line breaks. Write
> `[illegible]` for words you cannot read. If the page is blank, return an empty
> transcript. Return JSON only.

Expected response:

```json
{
  "transcript": "The OSI model has seven layers...",
  "legibility": "high",
  "contains_diagram": false,
  "notes": ""
}
```

Validate the JSON. Empty transcript is allowed; it becomes a
`degenerate_transcript` answer rather than a crash.

### Confidence

Gemini does not provide calibrated OCR confidence. Map legibility:

| Legibility | `ocr_confidence` |
|---|---|
| `high` | `0.90` |
| `medium` | `0.65` |
| `low` | `0.35` |

If the field is missing, use `0.80`. Document in code that this is a proxy, not
a probability. Add `low_ocr_confidence` when the value is below `0.55`.

### Fallback

If the live call fails and `DEMO_MODE=1`, use
`backend/fixtures/demo_transcripts.json` keyed by question number. The cache is
checked before the call, so a cache hit never reaches this path. Mark the result
as `fixture` in logs; do not add fields to the API.

---

## 8. Scoring

Gemini reads. Our code grades. The mark never comes directly from an LLM.

### Embeddings

- Model `all-MiniLM-L6-v2`, 384 dimensions.
- Encode with `normalize_embeddings=True`.
- Key points are embedded at confirm.
- Answer sentences are embedded at evaluation.
- Store normalized key-point vectors as `float32` BLOBs.

### Similarity

Split the transcript into lines/sentences:

```text
split on newlines, then sentence-ending punctuation
drop empty/whitespace-only pieces
cap at 60 pieces
```

For each key point:

```text
similarity_i = max_j cosine(key_point_i, sentence_j)
covered_i    = similarity_i >= point_threshold
borderline_i = abs(similarity_i - point_threshold) <= borderline_band
```

Then:

```text
coverage        = covered_count / key_point_count
suggested_marks = round_to_nearest_half(max_marks * coverage)
```

Defaults: `point_threshold = 0.55`, `borderline_band = 0.10`.

### Flags

| Flag | When |
|---|---|
| `degenerate_transcript` | transcript is empty or fewer than 3 words |
| `zero_coverage` | `covered_count == 0` |
| `borderline` | any key point is within the borderline band |
| `low_ocr_confidence` | `ocr_confidence < 0.55` |
| `manual_question` | `grading_mode == "manual"`; not demoed |

`needs_review` is `true` when `flags` is non-empty. `decision` starts as
`"pending"`; `final_marks` stays `null` until the lecturer reviews.

### Why local

- Marks stay explainable: the UI shows similarity per key point.
- Scoring works offline once the transcript is cached.
- The threshold and sample tests remain stable.
- No extra Gemini calls, no embedding-model change to recalibrate.

Do **not** ask Gemini to assign marks or compare the answer to the rubric.

---

## 9. Jobs

- One `ThreadPoolExecutor(max_workers=1)` created at app startup.
- `enqueue(job_id)` is called **after** the job row is committed.
- The worker opens its own SQLite connection.

Lifecycle:

```text
queued
  → running / preprocess  0.10
  → running / ocr         0.30
  → running / embed       0.60
  → running / score       0.80
  → done                  1.00
```

On failure:

- `answers.status = "error"`
- `jobs.status = "error"`
- `jobs.error_code` / `error_message` set
- `GET /api/jobs/{id}` returns `error: {code, message}` and keeps `answer_id`
- The UI can show a retry prompt; the demo falls back to cached/fixture first

One retry maximum for Gemini. Do not build a queue, scheduler, or worker pool.

---

## 10. Configuration

`backend/.env` (gitignored; copy from `.env.example`):

```env
GEMINI_API_KEY=
GEMINI_OCR_MODEL=gemini-3.5-flash-lite
GEMINI_KEY_MODEL=gemini-3.5-flash-lite

DEMO_MODE=1
MOCK_TRANSCRIBE=0
POINT_THRESHOLD=0.55
BORDERLINE_BAND=0.10
```

Rules:

- `GEMINI_API_KEY` is backend-only. Never put it in `frontend/.env*` or the
  built bundle.
- If the key is empty, use fixtures; the app must still start and score.
- `DEMO_MODE=1` enables cache/fixture fallback. `MOCK_TRANSCRIBE=1` skips Gemini
  even when a key exists (useful for API tests).
- Thresholds are also stored in the `exam` row; env values are defaults for a
  fresh database.

Run:

```powershell
cd backend
.\.venv\Scripts\Activate.ps1
uvicorn app.main:app --reload --port 8000
```

Frontend dev server proxies `/api` to `http://localhost:8000`.

---

## 11. Demo data and fallback

### Seed

- Exam: `READY`, subject `Computer Networks`, questions `1a`, `1b`, `2a`.
- Student 1: `4SF22CS001`, Asha Rao — live upload.
- Student 2: `4SF22CS002`, Ravi Kumar — pre-evaluated, reviewed.
- Key points: 3 + 3 + 6 from the sample CN key.
- Fixture transcripts: one per question, written to cover most key points.

### Before the demo

1. Parse and confirm the key; verify `READY`.
2. Create both students.
3. Pre-evaluate student 2 fully; accept the marks.
4. Rehearse **two** of student 1's photos and warm their cache; keep the third
   photo fresh for one genuine Gemini call on stage.
5. Verify marksheet totals and CSV.
6. Test with Wi-Fi off (cache/fixture path) and on (live path).

### How the live run uses the cache

- `1a`, `1b`: rehearsed photos → cache hit → instant transcript.
- `2a`: fresh photo → live Gemini call.
- If `2a` fails: fixture transcript written for the same question.
- If the whole network is down: cache + fixture still produce the marksheet.

### On-stage fallback ladder

1. Cache hit (rehearsed photos)
2. Live Gemini call (fresh photo)
3. Fixture transcript
4. Pre-evaluated student 2 / marksheet only.

The demo must never depend on a live Gemini call succeeding.

### Privacy

Demo uses sample or own handwriting, not real student scripts. That is why the
free tier is acceptable. Do not upload real scripts without a paid key and
departmental approval.

---

## 12. Definition of done

The backend is demo-ready when all of these pass:

- [ ] `uvicorn app.main:app` starts on a fresh DB; `GET /api/exam` returns `NO_KEY`.
- [ ] Upload the sample key → draft → confirm → `READY` with string question numbers.
- [ ] Create two students; duplicate USN returns `409 DUPLICATE_USN`.
- [ ] Upload three images → `202` jobs → poll to `done`.
- [ ] Each answer has transcript, `ocr_confidence`, matches, coverage, suggested marks, flags.
- [ ] Review one answer as accepted and one as overridden (with reason).
- [ ] Marksheet totals and CSV match the database.
- [ ] `approve` returns `409` while a flagged answer is still `pending`.
- [ ] Errors use `{"error": {"code", "message", "detail"}}`.
- [ ] The flow works with `GEMINI_API_KEY` empty (fixtures) and set (live).
- [ ] Frontend runs against the real API with `VITE_MOCK=0`; no console errors.
- [ ] Rehearsal passes on the demo laptop.

---

## 13. Not building

- Authentication, roles, or user accounts
- Multiple exams or multiple subjects per run
- Batch import of a whole class
- Choice groups ("answer any two of Q2–Q4") — the demo uses a 3-question subset
- Scanned PDF OCR for the key
- Transcript editing (only mark override)
- Local OCR (EasyOCR/TrOCR) or a fallback OCR provider
- Docker, Redis, Celery, cloud deployment, CI/CD
- Migrations, ORM, pagination, audit logs
- Confidence calibration or model fine-tuning
- Any new field or endpoint not in `API_CONTRACT.md` v1.4

If the demo path is green and there is time left, improve only within these
boundaries. Never trade demo reliability for completeness.

---

## 14. Known stale docs

These still describe the earlier local-TrOCR design and are **not** the backend
source of truth for the demo:

- `README.md` — architecture and references mention TrOCR
- `docs/SPEC.md` — pipeline and locked decisions mention TrOCR
- `docs/GEMINI.md` — records the original local-first/optional-adapter decision

`docs/API_CONTRACT.md` v1.4 and this file win for implementation. Rewrite the
stale docs after the demo path works.
