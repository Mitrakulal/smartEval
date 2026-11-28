# SmartEval — Technical Specification

> **Implementation note:** This document is the original pre-implementation
> specification. The current demo uses Gemini vision + local MiniLM and a
> React/FastAPI stack; see `README.md` and `docs/BACKEND.md` for the source of
> truth. TrOCR/Streamlit references below are historical.



**AI-Assisted Evaluation of Handwritten Answer Scripts**

Version 1.0 · Status: agreed scope, pre-implementation
Team: Mitra Kulal · Sanvil S Bhandary · Vikas Tharanath Shettigar · Puneet K C
Guide: Ms. Shreekshitha

---

## Contents

1. [What we are building](#1-what-we-are-building)
2. [Scope](#2-scope)
3. [Locked decisions](#3-locked-decisions)
4. [Architecture](#4-architecture)
5. [The pipeline](#5-the-pipeline)
6. [Scoring](#6-scoring)
7. [Flags and review](#7-flags-and-review)
8. [Data model](#8-data-model)
9. [API contract](#9-api-contract)
10. [Screens](#10-screens)
11. [Failure handling](#11-failure-handling)
12. [Repo layout](#12-repo-layout)
13. [Team split](#13-team-split)
14. [Milestones](#14-milestones)
15. [Validation](#15-validation)
16. [Demo plan](#16-demo-plan)
17. [Risks](#17-risks)
18. [Non-goals](#18-non-goals)

---

## 1. What we are building

> A lecturer uploads one answer key for one CIE exam. They then photograph each
> student's answer book, question by question. The system transcribes each
> answer, compares it against the key, proposes marks with a reason for every
> mark, flags anything it is unsure about, and exports a marksheet as CSV.

The lecturer is always the final authority. The system drafts; the human decides.

**One-sentence acceptance test:**

> A lecturer creates an exam from a real answer-key document, photographs one
> handwritten answer on a phone, and within ~15 seconds sees the transcript, the
> matched key points, and a suggested mark — and can explain to a bystander
> exactly where that mark came from.

If that sentence is true, the project succeeded. Everything else is polish.

### Why this shape

> The temptation is to build a general multi-exam grading platform. That version
> never ships. One exam, one key, N students is small enough to finish and
> complete enough to be genuinely useful. The narrowness is the feature.

---

## 2. Scope

### In scope

- One exam, one subject, one answer key (singleton, reset explicitly)
- Answer key uploaded as a PDF or DOCX, auto-parsed into questions and key points
- Lecturer confirmation screen to fix the parse
- Manual review of every suggested mark, with the reason visible
- One photo per question per student
- Semantic scoring with per-key-point coverage
- Flags for low-confidence OCR and borderline marks
- CSV marksheet export

### Out of scope (v1)

- Multiple exams / subjects / semesters
- Login, accounts, roles
- Whole-page photos with automatic answer segmentation
- Automatic grading of diagrams, equations, or numerical derivations
- Answer key upload as a photo or scan (born-digital documents only in v1)
- Batch upload of many students at once
- Mobile app, offline mode
- Model fine-tuning

> These are not oversights. Each one is a project on its own. Say so plainly in
> the viva — knowing what you deliberately excluded is worth marks.

---

## 3. Locked decisions

| # | Decision | Rationale |
|---|---|---|
| 1 | **React + Vite + TypeScript** frontend, **FastAPI** backend | Real 2/2 frontend-backend split; makes the poster's "3-tier" claim true |
| 2 | **SQLite**, raw `sqlite3`, no ORM | Zero setup, inspectable, easy to explain |
| 3 | **One exam**, singleton row | Removes an entire CRUD surface |
| 4 | **Student identity = USN**, typed before upload | It is the join key for the marksheet |
| 5 | **Phone camera**, one photo per question | UI does the segmentation the model cannot |
| 6 | Answer key = **born-digital PDF/DOCX only** | Avoids OCR on the key, which would corrupt every score |
| 7 | Answer key **contains question text and marks** | Parse gets both for free |
| 8 | **TrOCR** primary, with a VLM fallback path kept open | Poster fidelity, with insurance |
| 9 | **Key points, not one global cosine** | Makes the mark explainable and defensible |
| 10 | Demo runs as **one process, one port** | Demo day is not the day to debug CORS |

---

## 4. Architecture

```
┌─────────────────────────────────────────────┐
│  React SPA  (Vite + TS + MUI)               │
│  /setup   /evaluate   /marksheet            │
└──────────────────┬──────────────────────────┘
                   │  HTTP/JSON  (TanStack Query)
┌──────────────────▼──────────────────────────┐
│  FastAPI                                    │
│  ├── api/      routes + Pydantic models     │
│  ├── core/     config, db, job worker       │
│  └── ml/       vision, ocr, embed, score    │
│                                             │
│  SQLite  ·  files on disk                   │
└─────────────────────────────────────────────┘
```

**Two rules that keep the split clean:**

1. Nothing in `backend/ml/` knows the web exists — plain functions in, plain dicts out.
2. Nothing in `frontend/` knows what a model is — it consumes the generated API types.

**Demo build:** `npm run build` → FastAPI mounts `frontend/dist` at `/` with a catch-all for client-side routes. One `uvicorn` command runs everything.

> Dev uses two servers (Vite `:5173` proxying `/api` → `:8000`). Production is one
> process. Get the single-port build working in week 2, not week 6 — static asset
> routing is a stupid thing to lose a night to.

### Stack

| Layer | Choice |
|---|---|
| Frontend | React 18, Vite, TypeScript, MUI, TanStack Query, react-router |
| Backend | FastAPI, Pydantic v2, uvicorn |
| Vision | OpenCV (`opencv-python-headless`), Pillow |
| OCR | `transformers` + `trocr-base-handwritten` (PyTorch) |
| Embeddings | `sentence-transformers`, `all-MiniLM-L6-v2` |
| Storage | SQLite + filesystem |

---

## 5. The pipeline

Per uploaded answer image:

```
1. Load + fix EXIF rotation          ← do this first, always
2. Downscale to 1600px long edge
3. Rectify (optional, graceful)      ← find page quad, warp; skip if not found
4. Detect text lines
5. Filter degenerate lines           ← too short, too thin, low ink
6. TrOCR each line → text + confidence
7. Join lines with "\n"
8. Embed transcript, embed key points
9. Compare → coverage → marks
10. Decide flags
```

### 5.1 Line detection

TrOCR reads **one line at a time**. It has no concept of a page. Feed it a
paragraph and it returns garbled text with high apparent confidence — the worst
possible failure mode.

Two implementations, in order of preference:

**A. Tesseract for boxes only** (try this first)
`pytesseract.image_to_data()` gives line-level bounding boxes. Its *layout
analysis* is good even when its handwriting recognition is poor. Crop each box,
send the crop to TrOCR.

**B. Horizontal projection profile** (fallback)
Binarize → row-wise ink sums → find low-ink valleys → split. Works well on clean
ruled paper, degrades on slanted writing and shadows.

> Spend at most two days trying A before falling back to B. Do not write a custom
> segmenter from scratch.

### 5.2 Recognition

- Checkpoint: **`microsoft/trocr-base-handwritten`** — not `-printed`. People mix
  these up constantly and it silently ruins results.
- `TrOCRProcessor` resizes to 384×384, so crop lines tightly with a small margin.
- Set `max_length` generously (64+); the default truncates.
- Confidence: `exp(mean(token_logprobs))` from `generate(output_scores=True,
  return_dict_in_generate=True)`. A heuristic, not a calibrated probability —
  never describe it as one.
- Warm the model at server startup. First load downloads ~1.3 GB.

### 5.3 Interface

```python
transcribe(image_path: str) -> { "text": str, "confidence": float, "line_count": int }
```

Everything downstream depends on this signature and nothing else. If TrOCR
underperforms, a VLM implementation can be dropped in behind it in an afternoon
without touching the API, the scoring, or the UI.

> This indirection is the single most important design decision in the document.
> It is what makes the OCR risk survivable instead of fatal.

> The optional cloud adapter (Gemini) and its rollout rules are documented in
> `docs/GEMINI.md`. The default path described above stays local.

---

## 6. Scoring

Per question. `P = [p₁ … pₙ]` are key points; `S = [s₁ … sₘ]` are transcript
sentences.

**Step 1 — best match per key point**

```
simᵢ = max over j of cosine(embed(pᵢ), embed(sⱼ))
```

**Step 2 — coverage**

```
coveredᵢ = simᵢ ≥ point_threshold          (default 0.55)
coverage  = count(covered) / n
```

**Step 3 — marks**

```
marks = round_half(max_marks × coverage)
```

**Step 4 — borderline**

Flag the answer if either:
- any uncovered `simᵢ` is a near miss within `borderline_band` below `point_threshold` (default band 0.10), or
- `max_marks × coverage` lands within `borderline_band` of a half-mark boundary
  (i.e. the rounding decision flips the result)

### Why this instead of one global cosine

> A single cosine between a two-sentence answer and a two-paragraph model answer
> is compressed, biased, and unexplainable — "0.63" tells a lecturer nothing. Key
> point coverage answers the question they actually ask: *which points did the
> student miss?* It also produces a UI that shows its work, which is the whole
> credibility argument for an assisted-grading tool.

### The lecturer's control

Two sliders on the setup screen:

| Control | Meaning | Range |
|---|---|---|
| **Strictness** (`point_threshold`) | How close a sentence must be to count as covering a point | 0.40 – 0.75 |
| **Review band** (`borderline_band`) | How wide the "not sure" zone is | 0.05 – 0.20 |

Higher strictness + wider band = more marks withheld and more answers flagged.
Both settings are stored with the exam and reported in the marksheet header.

### Grading modes

`question.grading_mode` ∈ `semantic` | `manual`.

v1 implements `semantic` fully and `manual` as a trivial pass-through (empty
score, always flagged). `exact` is reserved but unused.

> `manual` is how diagrams, equations, and derivations stay out of the automated
> path — structurally, not as a special case buried in code.

---

## 7. Flags and review

| Flag | Trigger | What the reviewer does |
|---|---|---|
| `low_ocr_confidence` | `confidence < 0.60` | Read the image, correct the transcript |
| `degenerate_transcript` | Empty, < 3 chars, or repeated n-gram | Re-capture the photo |
| `borderline` | Per §6 Step 4 | Confirm or override the mark |
| `zero_coverage` | `coverage == 0` with confident OCR | Suspect a wrong or missing answer |
| `manual_question` | `grading_mode == manual` | Enter the mark by hand |

**Every override is logged:** `(transcript, key_points_covered, similarity,
suggested_marks, final_marks, reason, timestamp)`.

> Add these columns in the first schema migration even though the UI comes later.
> This log is simultaneously your validation dataset, your future calibration
> set, and your "future work" slide. It costs nothing now and cannot be
> backfilled.

---

## 8. Data model

```sql
CREATE TABLE exam (
  id              INTEGER PRIMARY KEY CHECK (id = 1),
  subject         TEXT    NOT NULL DEFAULT '',
  state           TEXT    NOT NULL DEFAULT 'NO_KEY',
                  -- NO_KEY | KEY_PARSED | READY | FINAL
  point_threshold REAL    NOT NULL DEFAULT 0.55,
  borderline_band REAL    NOT NULL DEFAULT 0.10,
  key_filename    TEXT,
  key_path        TEXT,
  created_at      TEXT    NOT NULL
);

CREATE TABLE question (
  id           INTEGER PRIMARY KEY,
  number       INTEGER NOT NULL,
  text         TEXT    NOT NULL,
  max_marks    REAL    NOT NULL,
  grading_mode TEXT    NOT NULL DEFAULT 'semantic',
  position     INTEGER NOT NULL
);

CREATE TABLE key_point (
  id          INTEGER PRIMARY KEY,
  question_id INTEGER NOT NULL REFERENCES question(id) ON DELETE CASCADE,
  text        TEXT    NOT NULL,
  embedding   BLOB    NOT NULL,      -- float32 bytes
  model_name  TEXT    NOT NULL,
  dim         INTEGER NOT NULL
);

CREATE TABLE student (
  usn        TEXT PRIMARY KEY,
  name       TEXT,
  created_at TEXT NOT NULL
);

CREATE TABLE answer (
  id              INTEGER PRIMARY KEY,
  usn             TEXT    NOT NULL REFERENCES student(usn) ON DELETE CASCADE,
  question_id     INTEGER NOT NULL REFERENCES question(id),
  image_path      TEXT,
  transcript      TEXT,
  ocr_confidence  REAL,
  similarity      REAL,
  coverage        REAL,
  suggested_marks REAL,
  final_marks     REAL,
  decision        TEXT NOT NULL DEFAULT 'pending',
                  -- pending | accepted | overridden
  flags           TEXT NOT NULL DEFAULT '[]',   -- JSON array
  reason          TEXT,
  created_at      TEXT NOT NULL,
  UNIQUE (usn, question_id)
);

CREATE TABLE job (
  id          TEXT PRIMARY KEY,
  status      TEXT NOT NULL,       -- queued | running | done | error
  step        TEXT,
  progress    REAL DEFAULT 0,
  detail      TEXT,
  created_at  TEXT NOT NULL
);
```

**Storage rules**

- Embeddings: `numpy` → `float32.tobytes()` in a BLOB. Cosine is brute force in
  Python. At a few hundred vectors this is sub-millisecond. **No vector database.**
- `model_name` + `dim` on every embedding row so a model change is *detectable*
  and re-embedding is a script, not a migration.
- Images on disk under `data/images/{usn}/q{n}.jpg`. Never blobs.
- Store the original key document. "Which key graded this?" is a question faculty
  will ask.

---

## 9. API contract

All endpoints under `/api`. All responses JSON unless noted.

### Setup

| Method | Path | Purpose |
|---|---|---|
| `GET` | `/exam` | `{state, subject, point_threshold, borderline_band, question_count}` |
| `POST` | `/exam/key/parse` | Upload document → **draft only** |
| `POST` | `/exam/key/confirm` | Commit edited draft → embed → `state = READY` |
| `PATCH` | `/exam/settings` | Update subject + sliders |
| `GET` | `/exam/key/file` | Original document, for the side-by-side viewer |
| `POST` | `/exam/reset` | Explicit wipe → `state = KEY_PARSED` |

**Parse response (draft):**

```json
{
  "draft_id": "d_9f2a",
  "questions": [
    {
      "number": 1,
      "text": "Explain Dijkstra's algorithm.",
      "max_marks": 5,
      "key_points": [
        {"text": "Finds shortest path from a source", "confidence": "parsed"},
        {"text": "Uses a priority queue", "confidence": "guessed"}
      ]
    }
  ],
  "warnings": ["No marks found for Q3; defaulted to 5"]
}
```

`confidence` ∈ `parsed | guessed | missing` — surfaced as badges in the UI so the
lecturer knows where the parser was unsure rather than being told everything is
fine.

### Evaluate

| Method | Path | Purpose |
|---|---|---|
| `POST` | `/students` | `{usn, name?}` → **409 if exists** |
| `GET` | `/students` | `[{usn, name, answered, total, flags, average}]` |
| `POST` | `/students/{usn}/answers/{question_id}` | multipart image → `202 {job_id}` |
| `GET` | `/jobs/{job_id}` | `{status, step, progress}` |
| `GET` | `/students/{usn}` | Full record with per-question results |
| `DELETE` | `/students/{usn}/answers/{question_id}` | Re-capture |
| `GET` | `/answers/{id}/image` | Image bytes for display |

**One job per answer, not per student.** Each photo takes seconds; the lecturer
gets feedback while still holding the phone. A per-student batch means a dead
spinner and one failure killing the whole run.

### Evaluation result (the fixture shape)

```json
{
  "question_id": 3,
  "answer_id": 11,
  "question_number": 3,
  "max_marks": 5,
  "transcript": "Dijkstra algorithm is used to find the shortest path...",
  "ocr_confidence": 0.81,
  "key_points": [
    {"id": 7, "text": "shortest path from source", "covered": true,  "similarity": 0.84},
    {"id": 8, "text": "uses a priority queue",     "covered": false, "similarity": 0.41},
    {"id": 9, "text": "non-negative edge weights", "covered": true,  "similarity": 0.72}
  ],
  "coverage": 0.67,
  "suggested_marks": 3.5,
  "flags": ["borderline"],
  "needs_review": true
}
```

> Commit this file as `fixtures/eval_result.json` on day one. It is what lets the
> frontend work for two weeks without a backend.

### Marksheet

| Method | Path | Purpose |
|---|---|---|
| `PATCH` | `/answers/{id}` | `{final_marks, decision, reason}` |
| `GET` | `/exam/marksheet` | JSON table |
| `GET` | `/exam/marksheet.csv` | Download |
| `POST` | `/exam/approve` | Lock → `state = FINAL` |

**CSV columns:** `USN, Name, Q1 … Qn, Total, Flags, Review_Status`

---

## 10. Screens

### Page 1 — Setup

Upload key → parse → **confirm**.

Two-pane layout: the original document on the left (PDF in an iframe, DOCX shown
as extracted text), the parsed questions on the right.

Each question row: number · text · max marks · expandable key points
(edit / delete / add / merge). Confidence badges on parsed fields.

Validation before confirm: unique numbers, marks > 0, at least one key point each.

**Failure path is mandatory:** if the parser returns zero questions, show an
empty manual form with "we couldn't read this document — enter the questions
below." This path *will* be exercised in the demo.

### Page 2 — Evaluate

USN input → for each question: upload photo → job progress → result.

Result panel, side by side:

```
IMAGE              TRANSCRIPT              KEY POINTS
[crop]             "Dijkstra..."           ✓ shortest path from source   0.84
                                           ✗ uses a priority queue       0.41
                                           ✓ non-negative weights        0.72

                   coverage 2/3 → 3.5 / 5     [Accept]  [Edit mark]
```

The transcript and per-point ticks are non-negotiable. A screen that shows only a
final number proves nothing to an audience.

### Page 3 — Marksheet

Table of all students. Per-cell flag icons. Editable final marks. Export CSV.
Approve button locks the exam.

---

## 11. Failure handling

| Situation | Behaviour |
|---|---|
| Parser finds nothing | Empty manual form + warning, never a crash |
| PDF is actually a scan | Detect low extracted-text length → warn "this may be a scan" |
| Photo is sideways | EXIF fix handles it; verify with a real iPhone JPEG |
| No page quad found | Skip rectification, continue |
| Zero lines detected | `degenerate_transcript` flag, no TrOCR call |
| TrOCR produces repetition | N-gram repetition check → flag |
| Duplicate USN | 409 + explicit "replace existing" action |
| Key re-uploaded after grading | **Blocked.** Offer explicit "Reset exam (deletes results)" |
| Model download slow | Warm at startup; never on first demo request |
| Job crashes | `status = error` + message; answer row remains editable |

---

## 12. Repo layout

```
smartEval/
├── backend/
│   ├── app/
│   │   ├── main.py            FastAPI app + static mount
│   │   ├── api/               routes, Pydantic models
│   │   ├── core/              config, db, job worker
│   │   └── ml/
│   │       ├── vision.py      rectify, detect lines, crop
│   │       ├── ocr.py         transcribe() — the swappable interface
│   │       ├── embed.py
│   │       └── score.py       coverage, marks, flags
│   ├── tests/
│   ├── fixtures/              eval_result.json + sample images
│   └── requirements.txt
├── frontend/
│   ├── src/
│   │   ├── routes/            setup, evaluate, marksheet
│   │   ├── components/
│   │   ├── api/               generated types + client
│   │   └── App.tsx
│   ├── vite.config.ts         /api proxy → :8000
│   └── package.json
├── data/                      images, uploaded keys (gitignored)
├── docs/                      this file, poster, eval protocol
└── README.md
```

---

## 13. Team split

| Person | Owns | First task |
|---|---|---|
| **F1** | Page 1 setup, key upload, confirmation editor | Page shell against `fixtures/` |
| **F2** | Page 2 evaluate loop, job polling, result panel | USN → upload → poll → render |
| **B1** | Vision + OCR: rectify, detect, transcribe, CER harness | **The spike (§14 week 2)** |
| **B2** | FastAPI, contract, jobs, DB, scoring, CSV | Pydantic models + fixture endpoints |

**B2 also owns the contract** — the `fixtures/eval_result.json` file and any
change to a response shape.

**B1's work is the risk; B2's work is the volume.** Rebalance around week 4 if B2
is drowning: hand the CSV export and flag logic to whoever is ahead.

---

## 14. Milestones

### Week 1 — Green light
- Repo skeleton, both servers running, `/api` proxy working
- `fixtures/eval_result.json` committed
- Pydantic models for the six core shapes
- **Collect 2 real answer-key documents and 5 real graded answer scripts**

### Week 2 — The spike (most important week)
- **No UI work on the critical path this week.**
- B1: EXIF → rectify → line detect → TrOCR on 5 real photos
- Run the same image as (a) one cropped line, (b) the full answer crop, (c) a
  hand-typed reference transcript
- **Report: CER per image, lines detected per image, seconds per answer**
- **Gate:** if CER > 35%, switch `transcribe()` to a VLM before building further

> This week decides the project. Everything after it assumes an answer. Do not
> build a UI first and discover the accuracy problem in week 6.

### Week 3 — Page 1 end to end
Parse PDF/DOCX → draft → confirm → embed → `state = READY`

### Week 4 — Page 2 end to end
Upload → job → result → accept/override → saved

### Week 5 — Page 3 + export
Marksheet, CSV, approve, flags surfaced

### Week 6 — Hardening
Single-port build, error states, demo rehearsal, report, poster update

---

## 15. Validation

**Dataset:** minimum 10 students × all questions, from one real CIE paper, with
marks awarded by a faculty member. Start collecting in week 1 — this is the
critical path and nobody's favourite job.

**Report these numbers:**

| Metric | Definition |
|---|---|
| **CER** | Character error rate, transcript vs hand-typed ground truth, on 20 answers |
| **Score MAE** | Mean absolute error, suggested vs faculty marks |
| **Agreement** | % of answers within ±0.5 marks |
| **Flag rate** | % of answers routed to review |
| **Correction rate** | % of suggestions the lecturer changed |

**Also report the honest negatives** — which handwriting styles failed, which
questions the key-point splitting mangled. A well-documented failure is worth
more than a suspiciously perfect number.

> The correction rate from the override log is the strongest number you will
> have. It answers "does the human actually trust this?" with data.

---

## 16. Demo plan

**3 minutes:**

1. Upload a real answer key → show the parse → fix one wrong key point → confirm
2. Enter a USN, photograph an answer **live**, show the transcript appearing
3. Show the key-point ticks and the mark derivation out loud
4. Show one deliberately flagged answer and override it
5. Export the CSV, open it

**Rules:**
- Warm the model before the demo starts
- Have a pre-computed student ready in case the venue's lighting defeats capture
- Have a screen recording as backup
- Never demo a feature that is not committed and tested

---

## 17. Risks

| Risk | Severity | Mitigation |
|---|---|---|
| TrOCR accuracy on real handwriting | **High** | Week-2 spike; VLM behind the same interface |
| Line detection fails on slanted writing | High | Tesseract boxes first; projection fallback; degrade to manual |
| No real data / no faculty marks | **High** | Start week 1; 10 scripts is enough |
| Similarity ≠ marks (faculty disagree) | Medium | Tolerance sliders + override log; report MAE honestly |
| Parse mangles the answer key | Medium | Confirmation screen is mandatory, not optional |
| Latency kills the demo | Medium | Async jobs, model warm, pre-computed backup |
| Team splits and never integrates | Medium | Weekly integration checkpoint, contract frozen week 1 |
| Scope creep back to "platform" | Medium | §18 is the answer |

---

## 18. Non-goals

Repeat these out loud when someone suggests them mid-project:

- Whole-page capture with automatic answer segmentation
- Multi-exam, multi-subject, multi-college
- Authentication and roles
- Auto-grading diagrams, equations, or derivations
- Fine-tuning TrOCR on college handwriting
- Docker, Kubernetes, CI/CD pipelines, cloud deployment
- A vector database
- Mobile app

> The wide version of this idea is unbuildable in six weeks. The narrow version
> is buildable, demoable, and honest. Narrowness is the plan, not a compromise.

---

## Appendix — Open questions

| # | Question | Owner | Needed by |
|---|---|---|---|
| 1 | Are answer-key documents reliably born-digital, or sometimes scans? | Guide | Week 1 |
| 2 | GPU available, or CPU only? | Team | Week 1 |
| 3 | Exact CSV format the department already uses | Guide | Week 4 |
| 4 | Do faculty marks exist for the scripts we collect? | Guide | Week 1 |
| 5 | Is `trocr-base-handwritten` acceptable, or must the poster say TrOCR specifically? | Guide | Week 2 |
