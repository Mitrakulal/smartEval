# Frontend — What to Build

The complete inventory of screens, elements, states and API calls.
Rules for *how* to build it: [`FRONTEND_AGENTS.md`](./FRONTEND_AGENTS.md).
Response shapes: [`API_CONTRACT.md`](./API_CONTRACT.md).

This is the whole frontend. If it isn't on this page, it isn't in scope.

---

## Screen map

| # | Route | Screen | Owner | Purpose |
|---|---|---|---|---|
| 1 | `/setup` | Setup | **F1** | Upload key → parse → lecturer confirms questions and key points |
| 2 | `/evaluate` | Evaluate | **F2** | USN → photo per question → transcript + markers → accept/override |
| 3 | `/marksheet` | Marksheet | **F1** | All students, totals, export CSV, approve |

`/` redirects to `/setup`. Anything else → 404.

### App shell (F1)

Persistent across all three routes:

- `AppBar` with the app name and current subject
- `NavStepper` — Setup → Evaluate → Marksheet, clickable, disabled according to `exam.state`
- Content area
- Global `Snackbar` host for errors and confirmations
- Query client provider, theme provider, router

`App.tsx` stays thin. No business logic in it.

---

## Page 1 — Setup (`/setup`)

**Goal:** turn a PDF into structured questions the lecturer has approved.

**Calls:** `GET /api/exam`, `POST /api/exam/key/parse`, `POST /api/exam/key/confirm`,
`PATCH /api/exam/settings`, `POST /api/exam/reset`, `GET /api/exam/key/file`

### Elements

| Element | Behaviour |
|---|---|
| `StateBanner` | Shows `NO_KEY` / `KEY_PARSED` / `READY` / `FINAL`; disables actions that don't apply |
| `FileDropzone` | `.pdf` / `.docx`, single file, ≤10 MB; drag + click; rejects wrong type with a message |
| Upload progress | Determinate bar while parsing |
| `WarningsList` | Parse warnings, e.g. "No marks found for Q3 — defaulted to 5" |
| `PdfPreview` | Left pane. `<iframe>` with a blob URL, or the extracted text for DOCX |
| `QuestionList` | Right pane. Add / delete / reorder |
| `QuestionRow` | Number, question text (multiline), max marks, grading mode (`semantic` / `manual`) |
| `KeyPointList` | Per question: add / edit / delete key points |
| `ConfidenceBadge` | `parsed` / `guessed` / `missing` on each field, so the lecturer sees where the parser was unsure |
| `SliderField` | Strictness `0.40–0.75`, review band `0.05–0.20`, with live value labels |
| `ValidationSummary` | Lists blocking problems; confirm stays disabled until clean |
| `ConfirmBar` | Sticky footer: "Confirm & start evaluating" |
| `ConfirmDialog` | "Reset exam — deletes all student results" |

### States

| State | Rendering |
|---|---|
| **Empty** (`NO_KEY`) | Dropzone only. No question list |
| **Parsing** | Dropzone disabled, progress bar, skeleton on the right pane |
| **Parsed** (`KEY_PARSED`) | Two panes populated, editable, confirm enabled if valid |
| **Parse failed** | Warning + an **empty manual form** — "we couldn't read this document, enter questions below". Never a crash |
| **Confirming** | Button spinner, list read-only |
| **Ready** (`READY`) | Read-only view, settings still editable, reset available |
| **Final** (`FINAL`) | Everything read-only, banner explains why |

### Validation rules (block confirm)

- At least one question
- Question numbers unique and non-empty (text labels allowed — `1a`, `2b`)
- `max_marks > 0` for every question
- Every question has ≥ 1 key point
- Key point text non-empty

---

## Page 2 — Evaluate (`/evaluate`)

**Goal:** one student's answers, transcribed, scored and reviewed. This is the screen
that sells the project.

**Calls:** `GET /api/students`, `POST /api/students`, `GET /api/students/{usn}`,
`POST /api/students/{usn}/answers/{qid}`, `GET /api/jobs/{id}` (poll 2 s),
`DELETE /api/students/{usn}/answers/{qid}`, `PATCH /api/answers/{id}`

### Layout

```
┌───────────────┬──────────────────────────────────────────────┐
│ StudentList   │  ResultPanel                                 │
│               │  ┌────────┬─────────────┬──────────────────┐ │
│ 4SF..001  ✓   │  │ Image  │ Transcript  │ Key points       │ │
│ 4SF..002  …   │  │        │             │ ✓ ...  0.84      │ │
│               │  │        │             │ ✗ ...  0.41      │ │
│ [+ New USN]   │  └────────┴─────────────┴──────────────────┘ │
│               │  2 of 3 covered · 3.5 / 5  [Accept] [Edit]   │
└───────────────┴──────────────────────────────────────────────┘
```

### Elements

| Element | Behaviour |
|---|---|
| `StudentList` | Sidebar: USN, `answered/total`, flag count, average. Highlights the active student |
| `StudentLookup` | USN + optional name → `POST /students`. On **409**, dialog: "USN exists — replace results?" |
| `QuestionNav` | Q1..Qn tabs with status dots: pending / processing / done / error |
| `PhotoCapture` | File picker **and** camera (`capture="environment"`), thumbnail preview, retake |
| `JobProgress` | Progress bar + `job.message`. Keeps polling across navigation |
| `ResultPanel` | Three columns: image, transcript, key points |
| ↳ image | The uploaded crop, click to zoom |
| ↳ `TranscriptPanel` | Monospace, copy button, OCR confidence shown |
| ↳ `KeyPointMatchList` | One row per point: ✓/✗, text, similarity, `borderline` marker |
| Coverage line | `2 of 3 key points covered` |
| Suggested marks | `3.5 / 5` |
| `FlagBadge` | `low_ocr_confidence`, `borderline`, `zero_coverage`, `manual_question` |
| `MarkControl` | Accept, or Override with numeric input + required reason |
| Error state | Distinguish: upload failed / extraction failed / network lost |

### States

| Answer status | Rendering |
|---|---|
| `pending` | Empty upload prompt for that question |
| `processing` | Progress bar, panel disabled |
| `evaluated` | Full result panel |
| `error` | Message + Retry button (re-upload) |

### Rules

- Polling stops on `done` or `error`. Never leave an interval running.
- Override reason is **required** when `decision == "overridden"`.
- `final_marks` is clamped and validated to `0 … max_marks`.
- Accept/Override updates the sidebar counts immediately (invalidate the students query).

---

## Page 3 — Marksheet (`/marksheet`)

**Goal:** the output the lecturer actually walks away with.

**Calls:** `GET /api/exam/marksheet`, `GET /api/exam/marksheet.csv`,
`POST /api/exam/approve`, `GET /api/exam`

### Elements

| Element | Behaviour |
|---|---|
| `MarksheetTable` | USN, name, Q1..Qn, total, max, flags, review status |
| Cell rendering | Blank when not evaluated; flag **count** per row (the marksheet API exposes counts, not per-answer flags) |
| Filter chips | All / Needs review / Incomplete |
| Row click | Navigates to `/evaluate` with that USN selected |
| Totals row | Class average, max, flagged count |
| `ExportButton` | Downloads the CSV from the API. Do not generate it client-side |
| `ApproveBar` | "Approve & lock" + confirmation. Disabled unless `state == READY`; 409 shows the unreviewed count |
| Empty state | "No students evaluated yet" + link to Evaluate |

### States

| State | Rendering |
|---|---|
| No students | Empty state |
| Loading | Skeleton table |
| Loaded | Table + totals |
| `FINAL` | Banner "Approved", export still enabled, table read-only |

---

## Component inventory

| # | Component | Owner | Used by |
|---|---|---|---|
| 1 | `AppShell` | F1 | all |
| 2 | `NavStepper` | F1 | all |
| 3 | `StateBanner` | F1 | 1, 3 |
| 4 | `FileDropzone` | F1 | 1 |
| 5 | `PdfPreview` | F1 | 1 |
| 6 | `QuestionRow` | F1 | 1 |
| 7 | `KeyPointList` | F1 | 1 |
| 8 | `ConfidenceBadge` | F1 | 1 |
| 9 | `ValidationSummary` | F1 | 1 |
| 10 | `SliderField` | F1 | 1 |
| 11 | `ConfirmDialog` | F1 | 1, 3 |
| 12 | `MarksheetTable` | F1 | 3 |
| 13 | `EmptyState` / `ErrorState` / `LoadingState` | F1 | all |
| 14 | `StudentList` | F2 | 2 |
| 15 | `StudentLookup` | F2 | 2 |
| 16 | `PhotoCapture` | F2 | 2 |
| 17 | `JobProgress` | F2 | 2 |
| 18 | `TranscriptPanel` | F2 | 2 |
| 19 | `KeyPointMatchList` | F2 | 2 |
| 20 | `ResultPanel` | F2 | 2 |
| 21 | `FlagBadge` | F2 | 2, 3 *(F1 imports)* |
| 22 | `MarkInput` | F2 | 2, 3 *(F1 imports)* |
| 23 | `ApproveBar` | F1 | 3 |

## Hooks

| Hook | Owner | Endpoint |
|---|---|---|
| `useExam` | F1 | `GET /api/exam` |
| `useParseKey` | F1 | `POST /api/exam/key/parse` |
| `useConfirmKey` | F1 | `POST /api/exam/key/confirm` |
| `useSettings` | F1 | `PATCH /api/exam/settings` |
| `useResetExam` | F1 | `POST /api/exam/reset` |
| `useMarksheet` | F1 | `GET /api/exam/marksheet` |
| `useStudents` | F2 | `GET /api/students` |
| `useStudent(usn)` | F2 | `GET /api/students/{usn}` |
| `useCreateStudent` | F2 | `POST /api/students` |
| `useUploadAnswer` | F2 | `POST /api/students/{usn}/answers/{qid}` |
| `useJob(id)` | F2 | `GET /api/jobs/{id}` — `refetchInterval: 2000` |
| `useReviewAnswer` | F2 | `PATCH /api/answers/{id}` |

---

## Work split

| | **F1** | **F2** |
|---|---|---|
| Screens | Setup, Marksheet | Evaluate |
| Components | 13 | 9 |
| Also owns | `App.tsx`, `theme.ts`, `layout/`, `api/`, routing, mock mode | `hooks/useJob`, all evaluate components |
| Hard part | Editable structured data + validation | Job polling + state machine + 3-column layout |
| Starts with | Shell + routing + api client | `PhotoCapture` + `useJob` against mocks |

F1 is front-loaded: nothing runs until the shell exists, so F1 does that first.
F2's work is concentrated in one screen but it carries the most logic.

If F1 finishes Marksheet early, the stretch feature is **editable transcripts** on
Page 2 — but only after F2's page is done.

---

## Not in scope

Charts · auth · search · pagination · dark mode · i18n · animations · unit tests ·
bulk upload · mobile app · multi-exam · approval workflow beyond a single lock.
