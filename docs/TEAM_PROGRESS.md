# SmartEval Dev A — Team Progress & Work Package Tracker

**Branch:** `BackendDev-A`  
**Contract Version:** `docs/API_CONTRACT.md` v1.4 (frozen)  
**Plan Reference:** `docs/PLAN_DEV_A.md`  
**Last Updated:** 2026-11-15T22:32:00Z  

---

## 1. Work Package Status Table

Status values: `todo` | `doing` | `done` | `blocked`

| ID | Package / Milestone | Wave | Assigned Owner | Target Files | Dependencies | Status |
|:---|:---|:---:|:---:|:---|:---:|:---:|
| **WP0** | Preflight Initialization | Step 0 | worker_preflight | `docs/TEAM_PROGRESS.md` | None | **done** |
| **WP1** | Core Foundation & Infrastructure | Wave 1 | Dev A (worker_core) | `backend/app/core/config.py`<br>`backend/app/core/db.py`<br>`backend/app/core/errors.py`<br>`backend/app/main.py`<br>`backend/requirements.txt` | WP0 | **done** |
| **WP2** | API Request & Response Schemas | Wave 1 | Dev A (worker_schemas) | `backend/app/api/schemas.py` | WP1 | **done** |
| **Gate 1** | Wave 1 Gate Check (`uvicorn` start & `GET /api/exam`) | Wave 1 Gate | Coordinator / Dev A | Server runtime verification | WP1, WP2 | **done** |
| **WP3** | Exam & Key Lifecycle Endpoints | Wave 2 | Dev A (worker_exam) | `backend/app/api/exam.py` | Gate 1 | **done** |
| **WP4** | Students Management Endpoints | Wave 2 | Dev A (worker_students) | `backend/app/api/students.py` | Gate 1 | **done** |
| **WP5** | Answers & Jobs Endpoints | Wave 2 | Dev A (worker_answers) | `backend/app/api/answers.py`<br>`backend/app/api/jobs.py` | Gate 1 | **done** |
| **WP6** | Marksheet & Approve Endpoints | Wave 2 | Dev A (worker_marksheet) | `backend/app/api/marksheet.py` | Gate 1 | **done** |
| **WP7** | Demo Seed Script | Wave 3 | Dev A (worker_seed) | `backend/fixtures/demo_seed.py` | WP3, WP4, WP5, WP6 | **done** |
| **WP8** | Comprehensive API Test Suite | Wave 3 | Dev A (worker_tests) | `backend/tests/test_api.py` | WP3, WP4, WP5, WP6 | **done** |
| **Verif** | System Verification & Manual Checks | Verification | Dev A / QA | CLI, server checks, double seed | WP7, WP8 | **done** |
| **Audit** | API Contract Audit (v1.4) | Audit | Reviewer subagent | All routes & responses | Verif | **todo** |
| **Report**| Step 6 Final Report (max 15 lines) | Final | Coordinator | Chat / report artifact | Audit | **todo** |

---

## 2. Structured Execution Checklist

### Step 0: Preflight
- [x] **WP0: Initialize Progress Tracking**
  - [x] Create `docs/TEAM_PROGRESS.md` with structured work packages and checklist.
  - [x] Set WP0 to `done`, WP1/WP2 to `todo`.
  - [x] Verify scope boundaries and constraints.

---

### Wave 1: Foundation (Core & Schemas)
- [x] **WP1: Core Foundation & Infrastructure**
  - [x] Implement `backend/app/core/config.py` (load env vars with fallback defaults).
  - [x] Implement `backend/app/core/db.py` (SQLite connection, WAL mode, foreign keys, table DDL, singleton exam, vector helpers).
  - [x] Implement `backend/app/core/errors.py` (contract error envelope `{"error": {"code", "message", "detail"}}`).
  - [x] Implement `backend/app/main.py` (FastAPI app, CORS, exception handlers, lifespan).
  - [x] Update `backend/requirements.txt` with required dependencies.
- [x] **WP2: API Request & Response Schemas**
  - [x] Implement `backend/app/api/schemas.py` matching `docs/API_CONTRACT.md` v1.4.
  - [x] Enforce strict `snake_case` naming across all models.
  - [x] Enforce explicit `None` defaults for all nullable fields so they serialize as `null`.
  - [x] Enforce string question numbers (`number: str`).
- [x] **Wave 1 Gate Check**
  - [x] Verify `uvicorn app.main:app` starts up cleanly.
  - [x] Verify `GET /api/exam` returns `state: "NO_KEY"` matching the exact contract shape.

---

### Wave 2: Core Endpoints (Parallel Execution)
- [x] **WP3: Exam & Key Management Router (`backend/app/api/exam.py`)**
  - [x] `GET /api/exam` (singleton state, question/student counts).
  - [x] `POST /api/exam/key/parse` (file upload, draft creation, state `KEY_PARSED`).
  - [x] `POST /api/exam/key/confirm` (replace questions/key points, vector storage, state `READY`).
  - [x] `PATCH /api/exam/settings` (subject, point_threshold, borderline_band).
  - [x] `GET /api/exam/key/file` (stream stored file or return 404 `"No key file associated with this exam"`).
  - [x] `POST /api/exam/reset` (clear DB tables and files in `data/keys/` and `data/images/`, preserving dirs & `.gitkeep`).
  - [x] Guard: Rejects `parse`/`confirm` when state is `FINAL` with `409 WRONG_STATE`.
- [x] **WP4: Students Management Router (`backend/app/api/students.py`)**
  - [x] Guard: Rejects requests when state is `NO_KEY` with `409 WRONG_STATE`.
  - [x] `POST /api/students` (create student; reject duplicate with `409 DUPLICATE_USN` unless `replace=true`).
  - [x] `GET /api/students` (list students with `answered`, `total`, `average`, `flags`, `status`).
  - [x] `GET /api/students/{usn}` (detail view; returns an `Answer` object for every confirmed question in sequence).
- [x] **WP5: Answers & Jobs Router (`backend/app/api/answers.py`, `backend/app/api/jobs.py`)**
  - [x] Guard: Rejects requests when state is `NO_KEY` with `409 WRONG_STATE`.
  - [x] `POST /api/students/{usn}/answers/{question_id}` (validates file mime/size, returns `202 {"job_id": "j_..."}`).
  - [x] `DELETE /api/students/{usn}/answers/{question_id}` (removes image/jobs, resets to pending).
  - [x] `PATCH /api/answers/{answer_id}` (validates marks bounds, requires reason for `overridden`, updates decision).
  - [x] `GET /api/answers/{answer_id}/image` (serves normalized JPEG).
  - [x] `GET /api/jobs/{job_id}` (polls job status, maps errors into contract shape).
- [x] **WP6: Marksheet & Approval Router (`backend/app/api/marksheet.py`)**
  - [x] `GET /api/exam/marksheet` (marks dictionary keyed by string `question_id`, totals, class average).
  - [x] `GET /api/exam/marksheet.csv` (CSV format matching JSON marksheet values exactly).
  - [x] `POST /api/exam/approve` (guard blocks with `409 UNREVIEWED_ANSWERS` if any answer has `needs_review == true` and `decision == "pending"`; locks exam state to `FINAL`).

---

### Wave 3: Integration, Seeder & Test Suite
- [x] **WP7: Demo Seed Script (`backend/fixtures/demo_seed.py`)**
  - [x] Executable via `python -m fixtures.demo_seed`.
  - [x] Idempotent execution (runs cleanly multiple times without constraint errors).
  - [x] Configures exam `Computer Networks` in `READY` state.
  - [x] Seeds 3 questions: `1a` (3.0 marks), `1b` (3.0 marks), `2a` (6.0 marks).
  - [x] Dynamically queries `key_point` IDs from SQLite.
  - [x] Seeds Student 1 (`4SF22CS001`, Asha Rao) - clean slate for live demo.
  - [x] Seeds Student 2 (`4SF22CS002`, Ravi Kumar) - pre-evaluated with accepted marks (10.5 total).
- [x] **WP8: Comprehensive API Test Suite (`backend/tests/test_api.py`)**
  - [x] Fresh DB state test (`test_fresh_db_state`).
  - [x] Duplicate USN and replace test (`test_student_duplicate_usn`).
  - [x] State guard enforcement test (`test_state_guards`).
  - [x] Invalid upload type test (`test_upload_invalid_file`).
  - [x] Key confirm validation test (`test_confirm_key_validation`).
  - [x] Pending answers presence in student detail test (`test_student_detail_pending_answers`).
  - [x] Answer review validation test (`test_answer_review_validation`).
  - [x] Approval unreviewed guard test (`test_approve_unreviewed_guard`).
  - [x] Marksheet JSON vs CSV agreement test (`test_marksheet_json_csv_agreement`).
  - [x] Contract nullability check test (`test_contract_null_fields_present`).

---

## 3. Verification & Quality Assurance
- [x] **Automated Test Run**
  - [x] `pytest tests/test_api.py -q` passes with 0 failures.
- [x] **Idempotence & Seeder Run**
  - [x] `python -m fixtures.demo_seed` runs cleanly twice in succession.
- [x] **Manual Endpoint Verification**
  - [x] `GET /api/exam` returns `READY` post-seeding.
  - [x] `GET /api/students` returns 2 students.
  - [x] `GET /api/exam/marksheet` returns correct JSON totals and class average.
  - [x] `GET /api/exam/marksheet.csv` returns valid CSV matching JSON.
- [ ] **Contract Audit (Reviewer Sub-Agent)**
  - [ ] Strict `snake_case` on all keys.
  - [ ] Explicit `null` for nullable fields (not omitted).
  - [ ] Question numbers are strings.
  - [ ] Standard error envelope `{"error": {"code", "message", "detail"}}`.
  - [ ] Answer upload returns HTTP `202 Accepted` with `{"job_id": "j_..."}`.
  - [ ] Full question answers list returned in `GET /api/students/{usn}`.
- [ ] **Final Report**
  - [ ] Max 15 lines summary report delivered to coordinator/user.

---

## 3. Approved Decisions (Contract v1.4) Tracking

| # | Approved Decision | Implementation Target | Verification Check | Status |
|:---|:---|:---|:---|:---:|
| 1 | `StudentSummary.average = round(sum(marks) / answered, 1)` if `answered > 0`, else `null` | `app/api/students.py` | Student list calculation test | verified |
| 2 | `StudentSummary.flags = number of evaluated answers with at least one flag` | `app/api/students.py` | Distinct flagged answers count | verified |
| 3 | `needs_review = bool(flags)` persists after review; approve blocks only when `needs_review == true` AND `decision == "pending"` | `app/api/answers.py`<br>`app/api/marksheet.py` | Approve guard test | verified (full) |
| 4 | `POST /api/exam/reset` clears DB rows AND files in `data/keys/` and `data/images/`, keeping directories and `.gitkeep` | `app/api/exam.py` | Reset filesystem cleanup test | verified |
| 5 | `GET /api/exam/key/file` returns 404 NOT_FOUND with message `"No key file associated with this exam"` when no key file exists | `app/api/exam.py` | Key file 404 test | verified |

---

## 4. Updates & Changelog

- **2026-11-15T22:32:00Z**: Completed Verification & Quality Assurance (Verif).
  - Automated Test Run: Ran `pytest tests/test_api.py -q` passing 100% (12 passed, 0 failures in 1.38s).
  - Seeder Idempotency Verification: Executed `python -m fixtures.demo_seed` twice consecutively; both runs completed cleanly with exit code 0.
  - Manual Endpoint & Data Verification against seeded database (`data/smarteval.db`):
    - `GET /api/exam`: Confirmed state is `READY`, questions count is 3, and question numbers are strings (`"1a"`, `"1b"`, `"2a"`).
    - `GET /api/students`: Confirmed 2 students returned (Asha Rao: answered=0, status=not_started, average=null; Ravi Kumar: answered=3, status=complete, average=3.5).
    - `GET /api/students/4SF22CS001`: Confirmed 3 synthesized pending Answer objects returned with null marks and pending status.
    - `GET /api/students/4SF22CS002`: Confirmed 3 evaluated Answer objects returned with total marks = 10.5.
    - `GET /api/exam/marksheet`: Confirmed JSON response with string-keyed marks dictionary, total marks, and class average (10.5).
    - `GET /api/exam/marksheet.csv`: Confirmed CSV export with header `USN,Name,Q1a,Q1b,Q2a,Total,Max,Flags,Review_Status`, blank cells for unevaluated answers, and values matching JSON marksheet exactly.

- **2026-11-15T22:20:00Z**: Completed WP8 Comprehensive API Test Suite (`backend/tests/test_api.py`). Implemented isolated temporary database testing harness and all 10 required test cases per docs/PLAN_DEV_A.md §6: `test_fresh_db_state`, `test_student_duplicate_usn`, `test_state_guards`, `test_upload_invalid_file`, `test_confirm_key_validation`, `test_student_detail_pending_answers`, `test_answer_review_validation`, `test_approve_unreviewed_guard`, `test_marksheet_json_csv_agreement`, `test_contract_null_fields_present`, plus additional edge case verifications (`test_exam_reset_cleanup`, `test_key_file_missing_404`). All 12 tests pass cleanly with 0 warnings and 0 failures via `pytest tests/test_api.py -q` in ~1.5 seconds.

- **2026-11-15T22:10:00Z**: Completed WP7 Demo Seed Script (`backend/fixtures/demo_seed.py`). Implemented standalone executable module and programmatic `seed_db(db_path)` function with full idempotence (clears tables, resets autoincrements, updates/inserts singleton exam row in READY state for Computer Networks, seeds 3 questions with 384-dimensional key point float embeddings, seeds clean slate Student 1 Asha Rao, dynamically queries key point IDs from SQLite, and seeds pre-evaluated benchmark Student 2 Ravi Kumar with 10.5 total marks and accepted answers). Verified double execution idempotence and direct database/API contract compliance.

- **2026-11-15T22:00:00Z**: Completed WP6 Marksheet & Approval Router (`backend/app/api/marksheet.py`, `backend/app/main.py`). Implemented `GET /api/exam/marksheet` (matrix with string-keyed marks, question max_marks sum, student status, review_status, and class_average across evaluated students), `GET /api/exam/marksheet.csv` (CSV export formatted with header `USN,Name,Q<num1>,...,Total,Max,Flags,Review_Status`, blank cell for unevaluated answers, and values matching JSON marksheet exactly), and `POST /api/exam/approve` (guards: 409 `WRONG_STATE` if exam state != `READY`, 409 `UNREVIEWED_ANSWERS` if any answer has flags and `decision == 'pending'`, transitions exam state to `FINAL` when all reviewed). All direct verification checks passed.

- **2026-11-15T21:50:00Z**: Completed WP5 Answers & Jobs Router (`backend/app/api/answers.py`, `backend/app/api/jobs.py`, `backend/app/main.py`). Implemented `POST /api/students/{usn}/answers/{question_id}` (validates MIME/size, saves image, upserts answer row, inserts job row, triggers lazy enqueue, returns HTTP 202 {"job_id": job_id}), `DELETE /api/students/{usn}/answers/{question_id}` (cleans up image and jobs, resets answer row to pending, returns 204), `PATCH /api/answers/{answer_id}` (validates marks and override reason, updates decision/reason/status, enforces Approved Decision 3 needs_review = bool(flags)), `GET /api/answers/{answer_id}/image` (serves image or 404), and `GET /api/jobs/{job_id}` (returns job progress and mapped error contract payload). All 11 verification checks passed.

- **2026-11-15T21:35:00Z**: Completed WP4 Students Management Router (`backend/app/api/students.py`, `backend/app/main.py`). Implemented `POST /api/students` (with ?replace=true support and duplicate USN guard), `GET /api/students` (with computed metrics per Approved Decisions 1 & 2), and `GET /api/students/{usn}` (with full synthesized pending Answer[] array per Rules 5 & 6 and Approved Decision 3). All 12 verification checks passed.

- **2026-11-15T21:15:00Z**: Completed Wave 1 Gate Check and WP3 Exam & Key Management Router (`backend/app/api/exam.py`, `backend/app/main.py`). All 6 endpoints (`GET /api/exam`, `POST /api/exam/key/parse`, `POST /api/exam/key/confirm`, `PATCH /api/exam/settings`, `GET /api/exam/key/file`, `POST /api/exam/reset`), approved decisions 4 & 5, and state guards verified.

- **2026-11-15T20:50:00Z**: Completed WP2 API Request & Response Schemas (`backend/app/api/schemas.py`). All contract models, enums, nullability defaults, and serialization tests verified.
- **2026-11-15T20:40:00Z**: Completed WP1 Core Foundation & Infrastructure (config, db, errors, main, requirements). All verifications passed.
- **2026-11-15T20:29:00Z**: Initialized `docs/TEAM_PROGRESS.md` for Step 0 Preflight. Marked WP0 as `done`, all downstream packages initialized to `todo`.
