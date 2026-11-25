# SmartEval

**AI-assisted evaluation of handwritten answer scripts using Gemini handwriting
transcription and local semantic similarity.**

> Sahyadri College of Engineering & Management, Mangaluru
> Department of Computer Science & Engineering (AI & ML)
> Mini-Project Poster Presentation

---

## Overview

SmartEval is a lecturer-in-the-loop web application that reads photographed
handwritten answers, compares each transcript against a confirmed answer key,
and proposes marks. The lecturer remains the final authority and can accept or
override every suggestion.

The current demo path is intentionally small:

- one subject and one CIE
- two students (`4SF22CS001`, `4SF22CS002`)
- three questions: `1a` (3 marks), `1b` (3 marks), `2a` (6 marks) = 12 marks
- one photo per question

---

## How it works

```text
DOCX/PDF answer key
  -> local paragraph/table extraction
  -> lecturer confirms questions + rubric points
  -> key points embedded with local MiniLM
  -> exam state READY

Answer photo
  -> Pillow EXIF rotation, resize, JPEG normalization
  -> Gemini vision transcribes handwriting (cached by image hash)
  -> MiniLM compares answer sentences with key points
  -> suggested marks + coverage + review flags
  -> lecturer accepts or overrides
  -> marksheet JSON / CSV
```

Gemini only performs perception (key structuring when needed, handwriting
transcription). It never assigns marks. Scoring is local and explainable.

---

## Tech stack

| Area | Choice |
| --- | --- |
| Frontend | React, Vite, TypeScript, MUI, TanStack Query |
| Backend | FastAPI, SQLite, one `ThreadPoolExecutor` worker |
| Key parsing | `python-docx`, `pdfplumber`, Gemini fallback |
| Handwriting | Gemini `gemini-3.5-flash-lite` vision |
| Scoring | `transformers` MiniLM `sentence-transformers/all-MiniLM-L6-v2` |
| Images | Pillow |
| Tests | pytest |

No Docker, Redis, Celery, auth, or production queue is required for the demo.

---

## Repository layout

```text
backend/
  app/
    api/          FastAPI routers and schemas
    core/         config, SQLite helpers, errors, worker
    ml/           key parse, Gemini wrapper, transcription, scoring
  fixtures/       demo seed, 3-question key draft, transcript fixtures
  tests/          API and ML tests
  requirements.txt
  .env.example

frontend/
  src/            React screens, API client, mock fixtures
  package.json

docs/
  API_CONTRACT.md     frozen backend contract
  BACKEND.md          backend design and implementation notes
  WORK_SPLIT.md       two-developer ownership
  samples/            sample answer keys
```

Runtime photos, keys, and the SQLite database live under `data/` and are ignored
by git.

---

## Running the demo

### 1. Backend

```powershell
cd backend
python -m venv .venv
.\.venv\Scripts\Activate.ps1
pip install -r requirements.txt
copy .env.example .env
# edit .env and set GEMINI_API_KEY for a live call; leave it empty for fixtures
python -m fixtures.demo_seed
uvicorn app.main:app --reload --port 8000
```

The first scoring run downloads the MiniLM model once. After that it works
offline. Without a Gemini key, `DEMO_MODE=1` uses the demo transcript fixtures;
the rest of the pipeline still runs for real.

### 2. Frontend

```powershell
cd frontend
npm install
npm run dev          # mock mode by default; no backend needed
```

To use the real API instead of the frontend mocks, set `VITE_MOCK=0` before
starting Vite, or edit `frontend/.env.development`:

```powershell
$env:VITE_MOCK="0"
npm run dev
```

Vite proxies `/api` to `http://localhost:8000`.

### 3. Demo key

Use the 3-question sample at `docs/samples/CN_CIE1_AnswerKey_3Q.docx` for the
demo. The original 8-question sample remains available for parser testing.

The seeded database is already `READY` with the same three questions and with
Ravi Kumar pre-evaluated. Asha Rao is the clean student for a live upload.

---

## Tests

```powershell
cd backend
.\.venv\Scripts\python.exe -m pytest -q

cd ..\frontend
npm run build
npm run lint
```

The fixture path exercises upload -> background job -> transcript -> score ->
review without a Gemini key. A live Gemini rehearsal still needs a real key and
sample handwriting photos.

---

## Privacy and free-tier note

Gemini's free tier may use content to improve Google products. Use only sample
or team-owned handwriting for the demo. Do not upload real student scripts
without a paid key and departmental approval.

---

## Team

| Name | USN | Role |
| --- | --- | --- |
| Mitra Kulal | 4SF24CI085 | Team Leader |
| Sanvil S Bhandary | 4SF24CI146 | Team Member |
| Vikas Tharanath Shettigar | 4SF24CI185 | Team Member |
| Puneet K C | 4SF34CI129 | Team Member |

**Guide:** Ms. Shreekshitha
**Domain:** Artificial Intelligence - Computer Vision & Natural Language Processing

---

## References

1. Google, "Gemini API documentation," 2026.
2. N. Reimers and I. Gurevych, "Sentence-BERT: Sentence Embeddings using
   Siamese BERT-Networks," EMNLP-IJCNLP, 2019.
3. `sentence-transformers/all-MiniLM-L6-v2`, Hugging Face model card.
4. M. D. Shermis and J. Burstein (Eds.), *Handbook of Automated Essay Scoring*,
   Routledge, 2013.

---

## License

Released under the MIT License. See `LICENSE` for details.
