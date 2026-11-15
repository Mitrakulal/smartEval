# SmartEval Dev A — Team Progress & Work Package Tracker

**Branch:** `BackendDev-A`  
**Contract Version:** `docs/API_CONTRACT.md` v1.4 (frozen)  
**Plan Reference:** `docs/PLAN_DEV_A.md`  
**Last Updated:** 2026-11-15T20:29:00Z  

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
| **WP4** | Students Management Endpoints | Wave 2 | Dev A (worker_students) | `backend/app/api/students.py` | Gate 1 | **todo** |
| **WP5** | Answers & Jobs Endpoints | Wave 2 | Dev A (worker_answers) | `backend/app/api/answers.py`<br>`backend/app/api/jobs.py` | Gate 1 | **todo** |
| **WP6** | Marksheet & Approve Endpoints | Wave 2 | Dev A (worker_marksheet) | `backend/app/api/marksheet.py` | Gate 1 | **todo** |
| **WP7** | Demo Seed Script | Wave 3 | Dev A (worker_seed) | `backend/fixtures/demo_seed.py` | WP3, WP4, WP5, WP6 | **todo** |
| **WP8** | Comprehensive API Test Suite | Wave 3 | Dev A (worker_tests) | `backend/tests/test_api.py` | WP3, WP4, WP5, WP6 | **todo** |
| **Verif** | System Verification & Manual Checks | Verification | Dev A / QA | CLI, server checks, double seed | WP7, WP8 | **todo** |
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
- [ ] **WP4: Students Management Router (`backend/app/api/students.py`)**
  - [ ] Guard: Rejects requests when state is `NO_KEY` with `409 WRONG_STATE`.
  - [ ] `POST /api/students` (create student; reject duplicate with `409 DUPLICATE_USN` unless `replace=true`).
  - [ ] `GET /api/students` (list students with `answered`, `total`, `average`, `flags`, `status`).
  - [ ] `GET /api/students/{usn}` (detail view; returns an `Answer` object for every confirmed question in sequence).
- [ ] **WP5: Answers & Jobs Router (`backend/app/api/answers.py`, `backend/app/api/jobs.py`)**
  - [ ] Guard: Rejects requests when state is `NO_KEY` with `409 WRONG_STATE`.
  - [ ] `POST /api/students/{usn}/answers/{question_id}` (validates file mime/size, returns `202 {"job_id": "j_..."}`).
  - [ ] `DELETE /api/students/{usn}/answers/{question_id}` (removes image/jobs, resets to pending).
  - [ ] `PATCH /api/answers/{answer_id}` (validates marks bounds, requires reason for `overridden`, updates decision).
  - [ ] `GET /api/answers/{answer_id}/image` (serves normalized JPEG).
  - [ ] `GET /api/jobs/{job_id}` (polls job status, maps errors into contract shape).
- [ ] **WP6: Marksheet & Approval Router (`backend/app/api/marksheet.py`)**
  - [ ] `GET /api/exam/marksheet` (marks dictionary keyed by string `question_id`, totals, class average).
  - [ ] `GET /api/exam/marksheet.csv` (CSV format matching JSON marksheet values exactly).
  - [ ] `POST /api/exam/approve` (guard blocks with `409 UNREVIEWED_ANSWERS` if any answer has `needs_review == true` and `decision == "pending"`; locks exam state to `FINAL`).

---

### Wave 3: Integration, Seeder & Test Suite
- [ ] **WP7: Demo Seed Script (`backend/fixtures/demo_seed.py`)**
  - [ ] Executable via `python -m fixtures.demo_seed`.
  - [ ] Idempotent execution (runs cleanly multiple times without constraint errors).
  - [ ] Configures exam `Computer Networks` in `READY` state.
  - [ ] Seeds 3 questions: `1a` (3.0 marks), `1b` (3.0 marks), `2a` (6.0 marks).
  - [ ] Dynamically queries `key_point` IDs from SQLite.
  - [ ] Seeds Student 1 (`4SF22CS001`, Asha Rao) - clean slate for live demo.
  - [ ] Seeds Student 2 (`4SF22CS002`, Ravi Kumar) - pre-evaluated with accepted marks (10.5 total).
- [ ] **WP8: Comprehensive API Test Suite (`backend/tests/test_api.py`)**
  - [ ] Fresh DB state test (`test_fresh_db_state`).
  - [ ] Duplicate USN and replace test (`test_student_duplicate_usn`).
  - [ ] State guard enforcement test (`test_state_guards`).
  - [ ] Invalid upload type test (`test_upload_invalid_file`).
  - [ ] Key confirm validation test (`test_confirm_key_validation`).
  - [ ] Pending answers presence in student detail test (`test_student_detail_pending_answers`).
  - [ ] Answer review validation test (`test_answer_review_validation`).
  - [ ] Approval unreviewed guard test (`test_approve_unreviewed_guard`).
  - [ ] Marksheet JSON vs CSV agreement test (`test_marksheet_json_csv_agreement`).
  - [ ] Contract nullability check test (`test_contract_null_fields_present`).

---

### Verification & Quality Assurance
- [ ] **Automated Test Run**
  - [ ] `pytest tests/test_api.py -q` passes with 0 failures.
- [ ] **Idempotence & Seeder Run**
  - [ ] `python -m fixtures.demo_seed` runs cleanly twice in succession.
- [ ] **Manual Endpoint Verification**
  - [ ] `GET /api/exam` returns `READY` post-seeding.
  - [ ] `GET /api/students` returns 2 students.
  - [ ] `GET /api/exam/marksheet` returns correct JSON totals and class average.
  - [ ] `GET /api/exam/marksheet.csv` returns valid CSV matching JSON.
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
| 1 | `StudentSummary.average = round(sum(marks) / answered, 1)` if `answered > 0`, else `null` | `app/api/students.py` | Student list calculation test | pending |
| 2 | `StudentSummary.flags = number of evaluated answers with at least one flag` | `app/api/students.py` | Distinct flagged answers count | pending |
| 3 | `needs_review = bool(flags)` persists after review; approve blocks only when `needs_review == true` AND `decision == "pending"` | `app/api/answers.py`<br>`app/api/marksheet.py` | Approve guard test | pending |
| 4 | `POST /api/exam/reset` clears DB rows AND files in `data/keys/` and `data/images/`, keeping directories and `.gitkeep` | `app/api/exam.py` | Reset filesystem cleanup test | verified |
| 5 | `GET /api/exam/key/file` returns 404 NOT_FOUND with message `"No key file associated with this exam"` when no key file exists | `app/api/exam.py` | Key file 404 test | verified |

---

## 4. Updates & Changelog

- **2026-11-15T21:15:00Z**: Completed Wave 1 Gate Check and WP3 Exam & Key Management Router (`backend/app/api/exam.py`, `backend/app/main.py`). All 6 endpoints (`GET /api/exam`, `POST /api/exam/key/parse`, `POST /api/exam/key/confirm`, `PATCH /api/exam/settings`, `GET /api/exam/key/file`, `POST /api/exam/reset`), approved decisions 4 & 5, and state guards verified.

- **2026-11-15T20:50:00Z**: Completed WP2 API Request & Response Schemas (`backend/app/api/schemas.py`). All contract models, enums, nullability defaults, and serialization tests verified.
- **2026-11-15T20:40:00Z**: Completed WP1 Core Foundation & Infrastructure (config, db, errors, main, requirements). All verifications passed.
- **2026-11-15T20:29:00Z**: Initialized `docs/TEAM_PROGRESS.md` for Step 0 Preflight. Marked WP0 as `done`, all downstream packages initialized to `todo`.
