# Gemini Integration — Decision and Plan

**Status:** Proposed — key parsing adapter pending API access; transcription adapter optional
**Date:** 2026-11-15
**Related:** `docs/SPEC.md` §5–6, `docs/API_CONTRACT.md` v1.4, `backend/requirements.txt`

---

## 1. Summary

SmartEval has two different extraction jobs, and they deserve different answers.

| Job | Frequency | Input | Default | Gemini role |
|---|---|---|---|---|
| Answer-key parsing | once per exam | born-digital PDF/DOCX | local heuristic parser | optional primary |
| Answer transcription | per student, per question | phone photo of handwriting | local EasyOCR + TrOCR | optional fallback |

The demo-critical path stays **local**. Gemini sits behind the same interfaces as an
adapter, enabled by configuration, never required for the app to work.

This document records why the original decision was local-first, why Gemini is still
worth adding, and how it will be introduced without breaking the API contract, the
scoring model, or demo day.

---

## 2. Why local is the default for answer photos

The original decision was not "local because we don't know how to call an API". It was
a deliberate trade-off:

1. **Demo-day reliability.** The venue Wi-Fi is unknown. A dropped request in the middle
   of a live evaluation stalls the demo in a way the audience can see. Local inference
   only depends on the laptop.
2. **Privacy.** Handwritten scripts are student work. Uploading them to a third party
   requires consent and a departmental decision; that is not a call four students should
   make silently.
3. **Cost and quota.** One class of 60 students with 6 questions each is 360 photos per
   exam. Even a generous free tier rate-limits that, and a paid key turns a college
   project into a recurring expense.
4. **Latency.** Each photo already waits for preprocessing, line detection, and
   recognition. Adding a network round trip and a remote queue makes every upload slower
   and less predictable.
5. **The project claim.** "Extraction stays on the lecturer's machine" is a real feature
   for a grading tool. Faculty will ask where the scripts go; the answer should not be
   "a Google data centre".
6. **Testability.** The local pipeline runs offline in tests and produces the same result
   twice. A cloud dependency makes CI and debugging depend on a key and a network.

TrOCR has real risk, which is why the pipeline is wrapped in one function
(`transcribe(image_path)`). If it underperforms, the provider can change without touching
the API, the scoring, or the UI. That indirection is what makes this decision reversible.

---

## 3. Why Gemini is still worth adding

The answer key is a different problem from handwriting:

- it is **born-digital**, so no OCR is involved;
- it runs **once per exam**, not once per student;
- it contains **no student data**;
- a bad parse is cheap — the lecturer edits the draft before confirming.

It is also the weakest part of the current backend plan. Regex over PDFs and DOCX tables
handles a clean document, but question numbering (`1a`, `2b`, `4(c)`), marks in brackets,
and key points stored in tables are exactly the kind of layout understanding LLMs are
good at.

The second, optional use is transcription fallback: if a real script defeats local OCR,
the lecturer could re-run that one answer through Gemini. That should be an explicit
action, not a silent default.

---

## 4. Decision

1. **Answer transcription stays local by default.** EasyOCR for line detection, TrOCR per
   line, EasyOCR text as the degenerate-output fallback. This is the demo path.
2. **Gemini is added first for answer-key parsing**, behind `KEY_PARSER=gemini`. The
   heuristic parser remains the default until the Gemini path is validated against the
   sample key and a real paper.
3. **Cloud transcription is opt-in only**, behind `TRANSCRIBER=gemini`, after privacy
   sign-off and a CER comparison on the same scripts. It is never triggered automatically.
4. **Marks are never assigned by Gemini.** The model may transcribe text and extract
   structure; the score still comes from the local key-point coverage formula. This keeps
   grading explainable and reproducible.
5. **The frontend never calls Gemini.** No API key in the bundle, no direct browser
   requests. The backend owns the integration.

---

## 5. Interfaces and configuration

Both adapters sit behind interfaces that already exist in the design:

```python
# app/ml/parse_key.py
def parse_key(file_path: str, filename: str) -> KeyDraft: ...

# app/ml/transcribe.py
def transcribe(image_path: str) -> dict:
    # {"text": str, "confidence": float, "line_count": int}
```

Configuration is backend-only:

```env
# backend/.env  (gitignored — never commit)
GEMINI_API_KEY=...
GEMINI_MODEL=...            # a currently available Flash model; confirm the exact id

KEY_PARSER=heuristic        # heuristic | gemini
TRANSCRIBER=local           # local | gemini
```

- `GEMINI_API_KEY` must never appear in `frontend/.env*` or in the built bundle.
- The frontend does not need a new field or endpoint; the contract is unchanged.
- Adding a provider means a new branch inside the adapter, not a new API shape.

---

## 6. Prompt and validation rules

The key parser asks for strict JSON, nothing else:

```json
{
  "questions": [
    {
      "number": "1a",
      "text": "Define the OSI reference model...",
      "max_marks": 3,
      "grading_mode": "semantic",
      "key_points": [{ "text": "Names the seven layers in order." }],
      "confidence": { "text": "parsed", "max_marks": "parsed" }
    }
  ],
  "warnings": []
}
```

Rules:

- **Validate before returning.** Parse the response with the `KeyDraft` Pydantic model.
  Invalid JSON, missing fields, or negative marks are a failed parse, not a draft.
- **Question numbers are strings** (`1a`, `2b`, `4(c)`) per contract v1.4. Never coerce to
  an integer.
- **Marks are numbers**, not `"3 marks"`. The prompt and validator both enforce this.
- **Confidence is honest.** `parsed` only when the value is explicit in the document;
  `guessed` when inferred; `missing` when absent. This drives the badges in Setup.
- **Timeout and retry.** Roughly 30 seconds per call, one retry. On failure, fall back to
  the heuristic parser; if that also fails, return `422` so the frontend opens manual
  entry. The lecturer is never blocked.
- **A parse creates a draft, not an exam.** Nothing is committed until confirm. The
  uploaded file is kept so `GET /api/exam/key/file` still works.

The same "validate, then fall back" rule applies to transcription: if Gemini returns
empty text or a response that fails the transcript checks, the job fails visibly with
`{code, message}` — it does not invent an answer.

---

## 7. Privacy and data handling

- **Phase 1 sends only the answer key.** No USN, name, or student photo leaves the laptop.
- **Answer photos require departmental approval.** If that approval is not given, the
  `TRANSCRIBER=gemini` path stays disabled.
- **Check the provider's data-use terms** before uploading anything departmental; the
  department, not the team, decides what is acceptable.
- **Do not log prompt or response bodies** containing student data. Log provider, model,
  latency, and token counts only.
- **Do not retain cloud responses** beyond the parsed draft. The local draft is the
  source of truth.

---

## 8. Rollout plan

**Phase 0 — access and approval (now).**
Confirm whether the department provides a key/quota, which model id is available, and
whether answer photos may be sent to a cloud API. Until then, nothing changes: local is
the default.

**Phase 1 — Gemini key parser.**
Implement `app/ml/gemini.py` and dispatch from `parse_key.py`. Test against
`docs/samples/CN_CIE1_AnswerKey.docx` and one real paper.

Success: every sub-question and mark extracted with no structural edits, and key points
usable after at most a couple of corrections. If it does not beat the heuristic parser,
keep the heuristic default and leave the adapter disabled.

**Phase 2 — optional transcription adapter.**
Implement the same boundary for `transcribe()`. Run both providers on the same scripts
and compare character error rate (CER), confidence calibration, and seconds per image.

Success: Gemini wins clearly enough to justify the network, cost, and privacy trade-off.
If it does not, the adapter stays as a fallback and the demo stays local.

**Phase 3 — demo configuration.**
Likely combination: **local transcription + Gemini key parsing**, with the heuristic
parser as fallback if the network or quota fails. The demo must still work with
`KEY_PARSER=heuristic` and `TRANSCRIBER=local`.

---

## 9. Non-goals

- Replacing local transcription as the default without measured evidence.
- Sending answer photos to a cloud API automatically or without consent.
- Letting an LLM assign marks or override the coverage formula.
- Calling Gemini from the frontend or shipping an API key to the browser.
- Depending on Gemini for the demo to start or run.

---

## 10. Open questions

1. Does the department provide an API key and quota, or only verbal encouragement?
2. Which model id is actually available to that key?
3. Is there written approval to send student scripts to a cloud provider?
4. Is the demo venue network reliable enough to risk a cloud call at all?

Until questions 1 and 3 are answered, Gemini remains a proposed adapter, not part of the
main path.

---

## Current state (2026-11-15)

- `google-genai` is installed in `backend/requirements.txt`.
- No backend code calls it yet; `backend/app/` contains only `.gitkeep` files.
- The frontend, contract, and scoring model do not know Gemini exists — and that is the
  point.
