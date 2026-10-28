# API Contract

**Version 1.0 · 2026-10-28**

This is the agreement between `frontend/` and `backend/`.

**The backend must match this document exactly.** The frontend may build against the
mock files in `frontend/src/api/mocks/` from day one and must not invent fields.

> Changing this contract requires: edit this file → bump the version → tell the
> other pair in the group chat → regenerate frontend types. Never change a field
> silently.

---

## Rules

| Rule | Detail |
|---|---|
| Base path | Everything under `/api` |
| Casing | `snake_case` everywhere — JSON keys, query params, form fields |
| Content type | `application/json`, except uploads (`multipart/form-data`) and binaries (`image/*`, `text/csv`, `application/pdf`) |
| Timestamps | ISO 8601 UTC — `2026-10-28T09:30:00Z` |
| IDs | Database rows → integers. Drafts and jobs → strings (`"d_9f2a"`, `"j_7c1"`) |
| Marks | Floats, 0.5 precision — `3.5`, not `"3.5"` |
| Nullability | Always send the key. Use `null` — never omit a field |
| Lists | Bare JSON arrays. No `{data: [...]}` envelopes (marksheet is the exception: it carries metadata) |
| Errors | Uniform shape, see [Errors](#errors) |

---

## Endpoints

### Exam / setup

| Method | Path | Body | Returns |
|---|---|---|---|
| `GET` | `/api/exam` | — | `ExamState` |
| `POST` | `/api/exam/key/parse` | `multipart` file | `KeyDraft` |
| `POST` | `/api/exam/key/confirm` | `ConfirmKeyRequest` | `ExamState` |
| `PATCH` | `/api/exam/settings` | `SettingsRequest` | `ExamState` |
| `GET` | `/api/exam/key/file` | — | binary (PDF/DOCX) |
| `POST` | `/api/exam/reset` | — | `ExamState` |

**Guards**

- `parse` and `confirm` → `409 WRONG_STATE` if `state == "FINAL"`.
- `confirm` → `422 VALIDATION_ERROR` if question numbers repeat, any `max_marks <= 0`, or any question has zero key points.
- `reset` → deletes all students, answers and images. Returns `state: "NO_KEY"`.

### Students

| Method | Path | Body | Returns |
|---|---|---|---|
| `POST` | `/api/students` | `{usn, name?}` | `201 StudentSummary` |
| `GET` | `/api/students` | — | `StudentSummary[]` |
| `GET` | `/api/students/{usn}` | — | `StudentDetail` |

**Guards**

- `POST /students` → `409 DUPLICATE_USN` if the USN exists.
  Pass `?replace=true` to overwrite the existing record (`200`).
- All student routes require `state != "NO_KEY"` → `409 WRONG_STATE`.

### Answers

| Method | Path | Body | Returns |
|---|---|---|---|
| `POST` | `/api/students/{usn}/answers/{question_id}` | `multipart` file | `202 {job_id}` |
| `DELETE` | `/api/students/{usn}/answers/{question_id}` | — | `204` |
| `PATCH` | `/api/answers/{answer_id}` | `ReviewRequest` | `Answer` |
| `GET` | `/api/answers/{answer_id}/image` | — | binary |

**Guards**

- Upload accepts `image/jpeg`, `image/png`, `image/webp`. Max 10 MB → `400 INVALID_FILE`.
- `PATCH` → `422` if `final_marks` is outside `0 … max_marks`.
- `DELETE` removes the image and resets the answer to `status: "pending"`.

### Jobs

| Method | Path | Returns |
|---|---|---|
| `GET` | `/api/jobs/{job_id}` | `Job` |

Poll every **2 seconds**. Stop polling when `status` is `done` or `error`.

### Marksheet

| Method | Path | Returns |
|---|---|---|
| `GET` | `/api/exam/marksheet` | `Marksheet` |
| `GET` | `/api/exam/marksheet.csv` | `text/csv` |
| `POST` | `/api/exam/approve` | `ExamState` |

**Guards**

- `approve` → `409 UNREVIEWED_ANSWERS` if any answer has `needs_review: true` and `decision: "pending"`. The error `detail` carries the count.

---

## Schemas

### `ExamState`

```json
{
  "state": "READY",
  "subject": "Computer Networks",
  "point_threshold": 0.55,
  "borderline_band": 0.10,
  "question_count": 3,
  "student_count": 2,
  "key_filename": "cn_cie1_key.pdf",
  "updated_at": "2026-10-28T09:30:00Z"
}
```

| Field | Type | Notes |
|---|---|---|
| `state` | `"NO_KEY" \| "KEY_PARSED" \| "READY" \| "FINAL"` | Drives which screens are enabled |
| `point_threshold` | float | `0.40 – 0.75` |
| `borderline_band` | float | `0.05 – 0.20` |
| `key_filename` | string \| null | Original upload name |

### `KeyDraft`

Returned by `parse`. **Nothing is committed yet.**

```json
{
  "draft_id": "d_9f2a",
  "filename": "cn_cie1_key.pdf",
  "questions": [
    {
      "number": 1,
      "text": "Explain Dijkstra's algorithm.",
      "max_marks": 5,
      "grading_mode": "semantic",
      "key_points": [
        { "text": "Finds the shortest path from a source node", "confidence": "parsed" },
        { "text": "Uses a priority queue to pick the next node", "confidence": "guessed" }
      ],
      "confidence": { "text": "parsed", "max_marks": "guessed" }
    }
  ],
  "warnings": ["No marks found for Q3 — defaulted to 5"]
}
```

`confidence` values: `"parsed" | "guessed" | "missing"`.

### `ConfirmKeyRequest`

```json
{
  "draft_id": "d_9f2a",
  "questions": [
    {
      "number": 1,
      "text": "Explain Dijkstra's algorithm.",
      "max_marks": 5,
      "grading_mode": "semantic",
      "key_points": [{ "text": "Finds the shortest path from a source node" }]
    }
  ]
}
```

Frontend may change anything the lecturer edited. `confidence` is dropped.

### `SettingsRequest`

All fields optional.

```json
{ "subject": "Computer Networks", "point_threshold": 0.6, "borderline_band": 0.1 }
```

### `StudentSummary`

```json
{
  "usn": "4SF22CS001",
  "name": "Asha Rao",
  "answered": 3,
  "total": 3,
  "average": 3.7,
  "flags": 1,
  "status": "complete"
}
```

`status`: `"not_started" | "in_progress" | "complete"`. `average` is `null` when nothing is evaluated.

### `StudentDetail`

```json
{
  "usn": "4SF22CS001",
  "name": "Asha Rao",
  "total_marks": 10.5,
  "max_marks": 15,
  "answers": [ /* Answer, one per question, in question order */ ]
}
```

### `Answer`

One object per question. **Always present**, even before upload.

```json
{
  "answer_id": 11,
  "question_id": 1,
  "question_number": 1,
  "question_text": "Explain Dijkstra's algorithm.",
  "max_marks": 5,
  "status": "evaluated",
  "image_url": "/api/answers/11/image",
  "transcript": "Dijkstra's algorithm finds the shortest path from a source node...",
  "ocr_confidence": 0.81,
  "key_points": [
    { "id": 7, "text": "Finds the shortest path from a source node", "covered": true, "similarity": 0.84, "borderline": false },
    { "id": 8, "text": "Uses a priority queue to pick the next node", "covered": false, "similarity": 0.41, "borderline": true },
    { "id": 9, "text": "Requires non-negative edge weights", "covered": true, "similarity": 0.72, "borderline": false }
  ],
  "coverage": 0.67,
  "covered_count": 2,
  "key_point_count": 3,
  "suggested_marks": 3.5,
  "final_marks": 3.5,
  "decision": "pending",
  "flags": ["borderline"],
  "needs_review": true,
  "review_reason": null,
  "evaluated_at": "2026-10-28T09:45:00Z"
}
```

| Field | Notes |
|---|---|
| `status` | `"pending" \| "processing" \| "evaluated" \| "error"` |
| `decision` | `"pending" \| "accepted" \| "overridden"` — `null` before evaluation |
| `flags` | Array, may be empty. See enum below |
| `needs_review` | `true` when any flag is set |
| Nullable group | `answer_id`, `image_url`, `transcript`, `ocr_confidence`, `coverage`, `suggested_marks`, `final_marks`, `decision`, `evaluated_at` are `null` while `status == "pending"` |

### `ReviewRequest`

```json
{ "final_marks": 4.0, "decision": "overridden", "reason": "Mentioned priority queue in the next line" }
```

`reason` is required when `decision == "overridden"`.

### `Job`

```json
{
  "job_id": "j_7c1",
  "status": "running",
  "step": "ocr",
  "progress": 0.45,
  "message": "Transcribing line 3 of 6",
  "answer_id": 11,
  "error": null
}
```

`status`: `"queued" | "running" | "done" | "error"`
`step`: `"preprocess" | "ocr" | "embed" | "score" | "done" | null`
On error: `error` is `{"code": "...", "message": "..."}` and `answer_id` is still set so the UI can mark that question.

### `Marksheet`

```json
{
  "subject": "Computer Networks",
  "max_marks": 15,
  "questions": [
    { "question_id": 1, "number": 1, "max_marks": 5 },
    { "question_id": 2, "number": 2, "max_marks": 5 },
    { "question_id": 3, "number": 3, "max_marks": 5 }
  ],
  "rows": [
    {
      "usn": "4SF22CS001",
      "name": "Asha Rao",
      "marks": { "1": 4.5, "2": 3.0, "3": 3.5 },
      "total": 11.0,
      "flags": 1,
      "status": "complete",
      "review_status": "pending"
    }
  ],
  "class_average": 9.6,
  "generated_at": "2026-10-28T10:00:00Z"
}
```

`marks` is keyed by `question_id` **as a string** (JSON keys are always strings). Missing key = not evaluated.
`review_status`: `"pending" | "reviewed"`.

---

## Enums

| Name | Values |
|---|---|
| `exam.state` | `NO_KEY`, `KEY_PARSED`, `READY`, `FINAL` |
| `answer.status` | `pending`, `processing`, `evaluated`, `error` |
| `answer.decision` | `pending`, `accepted`, `overridden` |
| `answer.flags` | `low_ocr_confidence`, `degenerate_transcript`, `borderline`, `zero_coverage`, `manual_question` |
| `job.status` | `queued`, `running`, `done`, `error` |
| `job.step` | `preprocess`, `ocr`, `embed`, `score`, `done` |
| `student.status` | `not_started`, `in_progress`, `complete` |
| `confidence` | `parsed`, `guessed`, `missing` |
| `grading_mode` | `semantic`, `manual` |
| `review_status` | `pending`, `reviewed` |

---

## Errors

Every non-2xx response:

```json
{
  "error": {
    "code": "DUPLICATE_USN",
    "message": "Student 4SF22CS001 already exists",
    "detail": {}
  }
}
```

| HTTP | `code` | When |
|---|---|---|
| 400 | `INVALID_FILE` | Wrong type, empty, or over 10 MB |
| 404 | `NOT_FOUND` | Unknown USN, question, answer or job |
| 409 | `DUPLICATE_USN` | USN already exists, no `?replace=true` |
| 409 | `WRONG_STATE` | Action not allowed in the current exam state |
| 409 | `UNREVIEWED_ANSWERS` | Approve called with pending reviews |
| 422 | `VALIDATION_ERROR` | `detail` holds the Pydantic error list |
| 500 | `INTERNAL` | Unhandled |

---

## CSV format

`GET /api/exam/marksheet.csv` — `text/csv`, UTF-8, comma separated.

```
USN,Name,Q1,Q2,Q3,Total,Max,Flags,Review_Status
4SF22CS001,Asha Rao,4.5,3.0,3.5,11.0,15,1,pending
```

Blank cell = not evaluated.

---

## Mock data

Frontend works against these until the backend exists:

| File | Replaces |
|---|---|
| `frontend/src/api/mocks/exam.json` | `GET /api/exam` |
| `frontend/src/api/mocks/key_draft.json` | `POST /api/exam/key/parse` |
| `frontend/src/api/mocks/students.json` | `GET /api/students` |
| `frontend/src/api/mocks/student.json` | `GET /api/students/{usn}` |
| `frontend/src/api/mocks/job_done.json` | `GET /api/jobs/{id}` |
| `frontend/src/api/mocks/marksheet.json` | `GET /api/exam/marksheet` |

Enable with `VITE_MOCK=1`. No backend required.
