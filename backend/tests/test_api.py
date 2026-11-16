"""Comprehensive API contract and integration test suite for SmartEval Dev A.

Strictly adheres to:
- docs/API_CONTRACT.md v1.4 (frozen)
- docs/PLAN_DEV_A.md §6 (Test Plan) and §10 (Definition-of-Done)

Tests run against an isolated temporary SQLite database fixture with WAL mode
and foreign keys enabled.
"""

import csv
import io
import json
import re
import sys
import urllib.parse
from io import BytesIO
from pathlib import Path
from typing import Any, Dict, List, Optional

# Ensure backend root is in sys.path for app and fixtures imports
backend_dir = Path(__file__).resolve().parent.parent
if str(backend_dir) not in sys.path:
    sys.path.insert(0, str(backend_dir))

import pytest
from fastapi import Response
from pydantic import ValidationError
from starlette.datastructures import Headers, UploadFile
from starlette.responses import FileResponse

from app.api.answers import (
    delete_answer,
    get_answer_image,
    review_answer,
    upload_answer,
)
from app.api.exam import (
    confirm_key,
    get_exam,
    get_key_file,
    parse_key,
    reset_exam,
    update_settings,
)
from app.api.jobs import get_job
from app.api.marksheet import (
    approve_exam,
    get_marksheet,
    get_marksheet_csv,
)
from app.api.schemas import (
    ConfirmKeyRequest,
    ReviewRequest,
    SettingsRequest,
    StudentCreateRequest,
)
from app.api.students import (
    create_student,
    get_student,
    list_students,
)
from app.core.config import settings
from app.core.db import blob_to_vec, get_conn, init_db, now_iso
from app.core.errors import ApiError
from fixtures.demo_seed import seed_db


# ==============================================================================
# Isolated Direct Test Client
# ==============================================================================

class ClientResponse:
    """Mock HTTP response matching FastAPI TestClient interface."""

    def __init__(
        self,
        status_code: int,
        json_data: Any = None,
        text: str = "",
        headers: Optional[Dict[str, str]] = None,
    ):
        self.status_code = status_code
        self._json_data = json_data
        self.text = text if text else (json.dumps(json_data) if json_data is not None else "")
        self.headers = headers or {}

    def json(self) -> Any:
        if self._json_data is not None:
            return self._json_data
        if self.text:
            return json.loads(self.text)
        return None


class DirectClient:
    """Direct dispatcher that invokes FastAPI router functions cleanly.
    
    Prevents anyio event loop and threading deadlocks in Windows sandbox
    while executing genuine endpoint handlers, database transactions,
    and contract validation envelopes.
    """

    def __init__(self, db_path: Optional[str] = None):
        self.db_path = db_path

    def get_connection(self):
        return get_conn(self.db_path)

    def _prepare_upload_file(self, files: Optional[Dict[str, Any]]) -> UploadFile:
        if not files or "file" not in files:
            return UploadFile(file=BytesIO(b""), filename="")
        f_val = files["file"]
        if isinstance(f_val, UploadFile):
            return f_val
        if isinstance(f_val, tuple):
            fname = f_val[0]
            fbytes = f_val[1]
            mtype = f_val[2] if len(f_val) > 2 else "application/octet-stream"
            return UploadFile(
                file=BytesIO(fbytes),
                filename=fname,
                headers=Headers({"content-type": mtype}),
            )
        if hasattr(f_val, "read"):
            fname = getattr(f_val, "name", "upload.bin")
            fbytes = f_val.read()
            return UploadFile(
                file=BytesIO(fbytes),
                filename=fname,
                headers=Headers({"content-type": "application/octet-stream"}),
            )
        return UploadFile(
            file=BytesIO(bytes(f_val)),
            filename="upload.bin",
            headers=Headers({"content-type": "application/octet-stream"}),
        )

    def request(
        self,
        method: str,
        url: str,
        json_data: Optional[Dict[str, Any]] = None,
        params: Optional[Dict[str, Any]] = None,
        files: Optional[Dict[str, Any]] = None,
    ) -> ClientResponse:
        parsed_url = urllib.parse.urlparse(url)
        path = parsed_url.path
        query_dict = urllib.parse.parse_qs(parsed_url.query)
        merged_params = {}
        for k, v in query_dict.items():
            merged_params[k] = v[0] if len(v) == 1 else v
        if params:
            merged_params.update(params)

        method = method.upper()
        conn = self.get_connection()

        try:
            # 1. GET /api/exam
            if method == "GET" and path == "/api/exam":
                res = get_exam(conn)
                return ClientResponse(200, json_data=json.loads(res.model_dump_json()))

            # 2. POST /api/exam/key/parse
            elif method == "POST" and path == "/api/exam/key/parse":
                uf = self._prepare_upload_file(files)
                res = parse_key(uf, conn)
                return ClientResponse(200, json_data=json.loads(res.model_dump_json()))

            # 3. POST /api/exam/key/confirm
            elif method == "POST" and path == "/api/exam/key/confirm":
                req_model = ConfirmKeyRequest(**(json_data or {}))
                res = confirm_key(req_model, conn)
                return ClientResponse(200, json_data=json.loads(res.model_dump_json()))

            # 4. PATCH /api/exam/settings
            elif method == "PATCH" and path == "/api/exam/settings":
                req_model = SettingsRequest(**(json_data or {}))
                res = update_settings(req_model, conn)
                return ClientResponse(200, json_data=json.loads(res.model_dump_json()))

            # 5. GET /api/exam/key/file
            elif method == "GET" and path == "/api/exam/key/file":
                res = get_key_file(conn)
                if isinstance(res, FileResponse):
                    content = Path(res.path).read_bytes()
                    return ClientResponse(
                        200,
                        text=content.decode("latin1", errors="ignore"),
                        headers=dict(res.headers),
                    )
                return ClientResponse(200, text=res.body.decode("utf-8"), headers=dict(res.headers))

            # 6. POST /api/exam/reset
            elif method == "POST" and path == "/api/exam/reset":
                res = reset_exam(conn)
                return ClientResponse(200, json_data=json.loads(res.model_dump_json()))

            # 7. POST /api/students
            elif method == "POST" and path == "/api/students":
                rep_val = merged_params.get("replace", False)
                if isinstance(rep_val, str):
                    replace_bool = rep_val.lower() in ("true", "1")
                else:
                    replace_bool = bool(rep_val)
                req_model = StudentCreateRequest(**(json_data or {}))
                resp_obj = Response()
                res = create_student(req_model, resp_obj, replace=replace_bool, conn=conn)
                status_code = resp_obj.status_code if resp_obj.status_code else 201
                return ClientResponse(status_code, json_data=json.loads(res.model_dump_json()))

            # 8. GET /api/students
            elif method == "GET" and path == "/api/students":
                res = list_students(conn)
                data = [json.loads(s.model_dump_json()) for s in res]
                return ClientResponse(200, json_data=data)

            # 9. GET /api/exam/marksheet.csv
            elif method == "GET" and path == "/api/exam/marksheet.csv":
                res = get_marksheet_csv(conn)
                return ClientResponse(
                    200,
                    text=res.body.decode("utf-8"),
                    headers=dict(res.headers),
                )

            # 10. GET /api/exam/marksheet
            elif method == "GET" and path == "/api/exam/marksheet":
                res = get_marksheet(conn)
                return ClientResponse(200, json_data=json.loads(res.model_dump_json()))

            # 11. POST /api/exam/approve
            elif method == "POST" and path == "/api/exam/approve":
                res = approve_exam(conn)
                return ClientResponse(200, json_data=json.loads(res.model_dump_json()))

            # 12. Regex: POST /api/students/{usn}/answers/{question_id}
            m_ans_post = re.match(r"^/api/students/(?P<usn>[^/]+)/answers/(?P<qid>[^/]+)$", path)
            if method == "POST" and m_ans_post:
                usn = m_ans_post.group("usn")
                qid = int(m_ans_post.group("qid"))
                uf = self._prepare_upload_file(files)
                res = upload_answer(usn, qid, uf, conn)
                return ClientResponse(202, json_data=json.loads(res.model_dump_json()))

            # 13. Regex: DELETE /api/students/{usn}/answers/{question_id}
            m_ans_del = re.match(r"^/api/students/(?P<usn>[^/]+)/answers/(?P<qid>[^/]+)$", path)
            if method == "DELETE" and m_ans_del:
                usn = m_ans_del.group("usn")
                qid = int(m_ans_del.group("qid"))
                delete_answer(usn, qid, conn)
                return ClientResponse(204, text="")

            # 14. Regex: GET /api/students/{usn}
            m_stud = re.match(r"^/api/students/(?P<usn>[^/]+)$", path)
            if method == "GET" and m_stud:
                usn = m_stud.group("usn")
                res = get_student(usn, conn)
                return ClientResponse(200, json_data=json.loads(res.model_dump_json()))

            # 15. Regex: GET /api/answers/{answer_id}/image
            m_ans_img = re.match(r"^/api/answers/(?P<aid>[^/]+)/image$", path)
            if method == "GET" and m_ans_img:
                aid = int(m_ans_img.group("aid"))
                res = get_answer_image(aid, conn)
                return ClientResponse(
                    200,
                    text=Path(res.path).read_bytes().decode("latin1", errors="ignore"),
                    headers=dict(res.headers),
                )

            # 16. Regex: PATCH /api/answers/{answer_id}
            m_ans_patch = re.match(r"^/api/answers/(?P<aid>[^/]+)$", path)
            if method == "PATCH" and m_ans_patch:
                aid = int(m_ans_patch.group("aid"))
                req_model = ReviewRequest(**(json_data or {}))
                res = review_answer(aid, req_model, conn)
                return ClientResponse(200, json_data=json.loads(res.model_dump_json()))

            # 17. Regex: GET /api/jobs/{job_id}
            m_job = re.match(r"^/api/jobs/(?P<jid>[^/]+)$", path)
            if method == "GET" and m_job:
                jid = m_job.group("jid")
                res = get_job(jid, conn)
                return ClientResponse(200, json_data=json.loads(res.model_dump_json()))

            return ClientResponse(
                404,
                json_data={
                    "error": {
                        "code": "NOT_FOUND",
                        "message": f"Route '{method} {path}' not found",
                        "detail": {},
                    }
                },
            )

        except ApiError as exc:
            return ClientResponse(
                status_code=exc.status_code,
                json_data={
                    "error": {
                        "code": exc.code,
                        "message": exc.message,
                        "detail": exc.detail,
                    }
                },
            )
        except ValidationError as exc:
            return ClientResponse(
                status_code=422,
                json_data={
                    "error": {
                        "code": "VALIDATION_ERROR",
                        "message": "Validation error in request payload or parameters",
                        "detail": exc.errors(),
                    }
                },
            )
        finally:
            conn.close()

    def get(self, url: str, params: Optional[Dict[str, Any]] = None) -> ClientResponse:
        return self.request("GET", url, params=params)

    def post(
        self,
        url: str,
        json: Optional[Dict[str, Any]] = None,
        params: Optional[Dict[str, Any]] = None,
        files: Optional[Dict[str, Any]] = None,
    ) -> ClientResponse:
        return self.request("POST", url, json_data=json, params=params, files=files)

    def patch(
        self,
        url: str,
        json: Optional[Dict[str, Any]] = None,
        params: Optional[Dict[str, Any]] = None,
    ) -> ClientResponse:
        return self.request("PATCH", url, json_data=json, params=params)

    def delete(self, url: str, params: Optional[Dict[str, Any]] = None) -> ClientResponse:
        return self.request("DELETE", url, params=params)


# ==============================================================================
# Pytest Fixtures
# ==============================================================================

@pytest.fixture
def test_db(tmp_path, monkeypatch):
    """Provide a fresh isolated SQLite database per test."""
    db_file = tmp_path / "test.db"
    key_dir = tmp_path / "keys"
    image_dir = tmp_path / "images"
    key_dir.mkdir(parents=True, exist_ok=True)
    image_dir.mkdir(parents=True, exist_ok=True)

    monkeypatch.setattr(settings, "DATABASE_PATH", str(db_file))
    monkeypatch.setattr(settings, "KEY_DIR", str(key_dir))
    monkeypatch.setattr(settings, "IMAGE_DIR", str(image_dir))

    init_db(str(db_file))
    return db_file


@pytest.fixture
def client(test_db):
    """Provide DirectClient pointed to the isolated test database."""
    return DirectClient(str(test_db))


# ==============================================================================
# 10 Required Test Cases (docs/PLAN_DEV_A.md §6 & §10)
# ==============================================================================

def test_fresh_db_state(client):
    """1. Fresh DB returns state NO_KEY, questions list empty, counts 0, 200 OK."""
    response = client.get("/api/exam")
    assert response.status_code == 200

    data = response.json()
    assert data["state"] == "NO_KEY"
    assert data["subject"] == "Computer Networks"
    assert data["questions"] == []
    assert data["question_count"] == 0
    assert data["student_count"] == 0
    assert data["key_filename"] is None


def test_student_duplicate_usn(client):
    """2. Duplicate USN returns 409 DUPLICATE_USN without replace=true;

    with replace=true returns 200 OK and resets student data.
    """
    # Put exam into READY state first (students endpoints require state != NO_KEY)
    confirm_resp = client.post(
        "/api/exam/key/confirm",
        json={
            "questions": [
                {
                    "number": "1a",
                    "text": "Explain TCP handshake",
                    "max_marks": 5.0,
                    "key_points": ["SYN", "SYN-ACK", "ACK"],
                }
            ]
        },
    )
    assert confirm_resp.status_code == 200

    # First student creation returns 201 Created
    r1 = client.post("/api/students", json={"usn": "4SF22CS001", "name": "Asha Rao"})
    assert r1.status_code == 201
    assert r1.json()["usn"] == "4SF22CS001"
    assert r1.json()["name"] == "Asha Rao"

    # Repeated creation without replace=true returns 409 DUPLICATE_USN
    r2 = client.post("/api/students", json={"usn": "4SF22CS001", "name": "Asha Rao Updated"})
    assert r2.status_code == 409
    err = r2.json()["error"]
    assert err["code"] == "DUPLICATE_USN"
    assert "already exists" in err["message"]

    # Creation with replace=true returns 200 OK and updates the student record
    r3 = client.post(
        "/api/students?replace=true",
        json={"usn": "4SF22CS001", "name": "Asha Rao Updated"},
    )
    assert r3.status_code == 200
    assert r3.json()["usn"] == "4SF22CS001"
    assert r3.json()["name"] == "Asha Rao Updated"


def test_state_guards(client):
    """3. State Guard Enforcement:

    - In NO_KEY state: /api/students, /api/students/{usn}, answer uploads return 409 WRONG_STATE.
    - In FINAL state: POST /api/exam/key/parse and POST /api/exam/key/confirm return 409 WRONG_STATE.
    """
    # --- Guard 1: In NO_KEY state ---
    r1 = client.post("/api/students", json={"usn": "4SF22CS001", "name": "Asha"})
    assert r1.status_code == 409
    assert r1.json()["error"]["code"] == "WRONG_STATE"

    r2 = client.get("/api/students")
    assert r2.status_code == 409
    assert r2.json()["error"]["code"] == "WRONG_STATE"

    r3 = client.get("/api/students/4SF22CS001")
    assert r3.status_code == 409
    assert r3.json()["error"]["code"] == "WRONG_STATE"

    r4 = client.post(
        "/api/students/4SF22CS001/answers/1",
        files={"file": ("ans.png", b"\x89PNG\r\n\x1a\nfake", "image/png")},
    )
    assert r4.status_code == 409
    assert r4.json()["error"]["code"] == "WRONG_STATE"

    # --- Setup: Transition to READY state then approve to reach FINAL state ---
    r_confirm = client.post(
        "/api/exam/key/confirm",
        json={
            "questions": [
                {
                    "number": "1a",
                    "text": "Sample Question",
                    "max_marks": 5.0,
                    "key_points": ["Point 1"],
                }
            ]
        },
    )
    assert r_confirm.status_code == 200

    r_stud = client.post("/api/students", json={"usn": "4SF22CS001", "name": "Asha"})
    assert r_stud.status_code == 201

    r_app = client.post("/api/exam/approve")
    assert r_app.status_code == 200
    assert r_app.json()["state"] == "FINAL"

    # --- Guard 2: In FINAL state, key modification is blocked ---
    r_parse = client.post(
        "/api/exam/key/parse",
        files={"file": ("key.pdf", b"%PDF-1.4 sample", "application/pdf")},
    )
    assert r_parse.status_code == 409
    assert r_parse.json()["error"]["code"] == "WRONG_STATE"

    r_conf_final = client.post(
        "/api/exam/key/confirm",
        json={
            "questions": [
                {
                    "number": "1a",
                    "text": "Sample Question",
                    "max_marks": 5.0,
                    "key_points": ["Point 1"],
                }
            ]
        },
    )
    assert r_conf_final.status_code == 409
    assert r_conf_final.json()["error"]["code"] == "WRONG_STATE"


def test_upload_invalid_file(client):
    """4. Answer upload with invalid MIME type (e.g. text/plain) or empty file

    returns 400 INVALID_FILE.
    """
    # Setup exam in READY state and add student
    client.post(
        "/api/exam/key/confirm",
        json={
            "questions": [
                {
                    "number": "1a",
                    "text": "Question 1",
                    "max_marks": 5.0,
                    "key_points": ["Key Point 1"],
                }
            ]
        },
    )
    client.post("/api/students", json={"usn": "4SF22CS001", "name": "Asha"})

    # Answer upload with invalid MIME type (text/plain) -> 400 INVALID_FILE
    r1 = client.post(
        "/api/students/4SF22CS001/answers/1",
        files={"file": ("notes.txt", b"plain text answer", "text/plain")},
    )
    assert r1.status_code == 400
    assert r1.json()["error"]["code"] == "INVALID_FILE"

    # Answer upload with invalid MIME type (application/pdf) -> 400 INVALID_FILE
    r2 = client.post(
        "/api/students/4SF22CS001/answers/1",
        files={"file": ("ans.pdf", b"%PDF-1.4 content", "application/pdf")},
    )
    assert r2.status_code == 400
    assert r2.json()["error"]["code"] == "INVALID_FILE"

    # Answer upload with empty file -> 400 INVALID_FILE
    r3 = client.post(
        "/api/students/4SF22CS001/answers/1",
        files={"file": ("empty.png", b"", "image/png")},
    )
    assert r3.status_code == 400
    assert r3.json()["error"]["code"] == "INVALID_FILE"

    # Key parse upload with invalid extension (.txt) -> 400 INVALID_FILE
    r4 = client.post(
        "/api/exam/key/parse",
        files={"file": ("notes.txt", b"some notes", "text/plain")},
    )
    assert r4.status_code == 400
    assert r4.json()["error"]["code"] == "INVALID_FILE"

    # Key parse upload with empty file -> 400 INVALID_FILE
    r5 = client.post(
        "/api/exam/key/parse",
        files={"file": ("key.pdf", b"", "application/pdf")},
    )
    assert r5.status_code == 400
    assert r5.json()["error"]["code"] == "INVALID_FILE"


def test_confirm_key_validation(client):
    """5. POST /api/exam/key/confirm validates question fields, stores key points

    and embeddings, sets exam state to READY, and preserves string question numbers ("1a", "2b").
    """
    # 1. Empty questions list -> 422 VALIDATION_ERROR
    r1 = client.post("/api/exam/key/confirm", json={"questions": []})
    assert r1.status_code == 422
    assert r1.json()["error"]["code"] == "VALIDATION_ERROR"

    # 2. Duplicate question numbers (two "1a") -> 422 VALIDATION_ERROR
    r2 = client.post(
        "/api/exam/key/confirm",
        json={
            "questions": [
                {"number": "1a", "text": "Q1", "max_marks": 3.0, "key_points": ["KP 1"]},
                {"number": "1a", "text": "Q2", "max_marks": 3.0, "key_points": ["KP 2"]},
            ]
        },
    )
    assert r2.status_code == 422
    assert r2.json()["error"]["code"] == "VALIDATION_ERROR"
    assert "Duplicate question number" in r2.json()["error"]["message"]

    # 3. Question with max_marks <= 0 -> 422 VALIDATION_ERROR
    r3 = client.post(
        "/api/exam/key/confirm",
        json={
            "questions": [
                {"number": "1a", "text": "Q1", "max_marks": 0.0, "key_points": ["KP 1"]},
            ]
        },
    )
    assert r3.status_code == 422
    assert r3.json()["error"]["code"] == "VALIDATION_ERROR"

    # 4. Question with empty key_points -> 422 VALIDATION_ERROR
    r4 = client.post(
        "/api/exam/key/confirm",
        json={
            "questions": [
                {"number": "1a", "text": "Q1", "max_marks": 3.0, "key_points": []},
            ]
        },
    )
    assert r4.status_code == 422
    assert r4.json()["error"]["code"] == "VALIDATION_ERROR"

    # 5. Valid confirm with string numbers ("1a", "2b")
    r5 = client.post(
        "/api/exam/key/confirm",
        json={
            "questions": [
                {"number": "1a", "text": "Question 1a", "max_marks": 3.0, "key_points": ["Point A", "Point B"]},
                {"number": "2b", "text": "Question 2b", "max_marks": 7.0, "key_points": ["Point C"]},
            ]
        },
    )
    assert r5.status_code == 200
    data = r5.json()
    assert data["state"] == "READY"
    assert data["question_count"] == 2
    assert len(data["questions"]) == 2
    assert data["questions"][0]["number"] == "1a"
    assert isinstance(data["questions"][0]["number"], str)
    assert data["questions"][1]["number"] == "2b"
    assert isinstance(data["questions"][1]["number"], str)
    assert len(data["questions"][0]["key_points"]) == 2
    assert len(data["questions"][1]["key_points"]) == 1

    # Verify embeddings are stored in database as 384-dimensional float vectors
    conn = get_conn(settings.DATABASE_PATH)
    cur = conn.execute("SELECT embedding FROM key_points;")
    blobs = cur.fetchall()
    assert len(blobs) == 3
    for b in blobs:
        assert b["embedding"] is not None
        vec = blob_to_vec(b["embedding"])
        assert len(vec) == 384
    conn.close()


def test_student_detail_pending_answers(client):
    """6. For confirmed exam with questions, GET /api/students/{usn} for a student

    with no uploads returns an Answer object for every question in sequence with
    status = "pending", answer_id = None, decision = None, and key_points with covered = False.
    """
    # Confirm key with 3 questions
    client.post(
        "/api/exam/key/confirm",
        json={
            "questions": [
                {"number": "1a", "text": "Q 1a", "max_marks": 3.0, "key_points": ["KP 1", "KP 2"]},
                {"number": "1b", "text": "Q 1b", "max_marks": 3.0, "key_points": ["KP 3"]},
                {"number": "2a", "text": "Q 2a", "max_marks": 6.0, "key_points": ["KP 4", "KP 5"]},
            ]
        },
    )
    # Create student
    client.post("/api/students", json={"usn": "4SF22CS001", "name": "Asha Rao"})

    # GET /api/students/{usn} returns full detail
    res = client.get("/api/students/4SF22CS001")
    assert res.status_code == 200
    data = res.json()
    assert data["usn"] == "4SF22CS001"
    assert data["name"] == "Asha Rao"
    assert data["total_marks"] == 0.0
    assert data["max_marks"] == 12.0
    assert data["status"] == "not_started"
    assert len(data["answers"]) == 3

    # Invariants for unevaluated answers in sequence
    expected_numbers = ["1a", "1b", "2a"]
    for i, ans in enumerate(data["answers"]):
        assert ans["question_number"] == expected_numbers[i]
        assert ans["status"] == "pending"
        assert ans["answer_id"] is None
        assert ans["decision"] is None
        assert ans["needs_review"] is False
        assert ans["suggested_marks"] is None
        assert ans["final_marks"] is None
        assert ans["transcript"] is None
        assert ans["ocr_confidence"] is None
        assert ans["coverage"] is None
        assert len(ans["key_points"]) > 0
        for kp in ans["key_points"]:
            assert kp["covered"] is False
            assert kp["similarity"] == 0.0
            assert kp["borderline"] is False


def test_answer_review_validation(client):
    """7. PATCH /api/answers/{answer_id} validates 0 <= final_marks <= max_marks

    (rejects < 0 and > max_marks with 422 VALIDATION_ERROR), requires reason when
    decision == "overridden" (422 if missing), succeeds with 200 when valid.
    """
    # Setup exam with max_marks = 5.0
    client.post(
        "/api/exam/key/confirm",
        json={
            "questions": [
                {"number": "1a", "text": "Q 1a", "max_marks": 5.0, "key_points": ["KP 1"]},
            ]
        },
    )
    client.post("/api/students", json={"usn": "4SF22CS001", "name": "Asha Rao"})

    # Insert an evaluated answer into DB
    conn = get_conn(settings.DATABASE_PATH)
    cur = conn.execute("SELECT id FROM questions WHERE number = '1a';")
    qid = cur.fetchone()["id"]
    with conn:
        cur2 = conn.execute(
            """
            INSERT INTO answers (usn, question_id, status, suggested_marks, final_marks, decision, evaluated_at)
            VALUES ('4SF22CS001', ?, 'evaluated', 3.0, 3.0, 'pending', ?);
            """,
            (qid, now_iso()),
        )
        answer_id = cur2.lastrowid
    conn.close()

    # 1. final_marks > max_marks (6.0 > 5.0) -> 422 VALIDATION_ERROR
    r1 = client.patch(f"/api/answers/{answer_id}", json={"final_marks": 6.0, "decision": "accepted"})
    assert r1.status_code == 422
    assert r1.json()["error"]["code"] == "VALIDATION_ERROR"

    # 2. final_marks < 0 (-1.0) -> 422 VALIDATION_ERROR
    r2 = client.patch(f"/api/answers/{answer_id}", json={"final_marks": -1.0, "decision": "accepted"})
    assert r2.status_code == 422
    assert r2.json()["error"]["code"] == "VALIDATION_ERROR"

    # 3. decision == "overridden" and missing reason -> 422 VALIDATION_ERROR
    r3 = client.patch(f"/api/answers/{answer_id}", json={"final_marks": 4.0, "decision": "overridden"})
    assert r3.status_code == 422
    assert r3.json()["error"]["code"] == "VALIDATION_ERROR"
    assert "reason is required" in r3.json()["error"]["message"]

    # 4. Valid decision == "overridden" with reason -> 200 OK
    r4 = client.patch(
        f"/api/answers/{answer_id}",
        json={"final_marks": 4.5, "decision": "overridden", "reason": "Bonus for thorough explanation"},
    )
    assert r4.status_code == 200
    data = r4.json()
    assert data["final_marks"] == 4.5
    assert data["decision"] == "overridden"
    assert data["review_reason"] == "Bonus for thorough explanation"

    # 5. Valid decision == "accepted" -> 200 OK
    r5 = client.patch(f"/api/answers/{answer_id}", json={"final_marks": 3.0, "decision": "accepted"})
    assert r5.status_code == 200
    assert r5.json()["decision"] == "accepted"
    assert r5.json()["final_marks"] == 3.0


def test_approve_unreviewed_guard(client):
    """8. Approval Guard:

    An unreviewed answer with flags (needs_review = True and decision = "pending")
    blocks approval with 409 UNREVIEWED_ANSWERS (detail.unreviewed_count >= 1).
    Once reviewed (decision = "accepted" or "overridden"), POST /api/exam/approve
    transitions state to FINAL.
    """
    # Setup exam and student
    client.post(
        "/api/exam/key/confirm",
        json={
            "questions": [
                {"number": "1a", "text": "Q 1a", "max_marks": 5.0, "key_points": ["KP 1"]},
            ]
        },
    )
    client.post("/api/students", json={"usn": "4SF22CS001", "name": "Asha Rao"})

    # Insert an answer with flags = ["borderline"] and decision = "pending"
    conn = get_conn(settings.DATABASE_PATH)
    cur = conn.execute("SELECT id FROM questions WHERE number = '1a';")
    qid = cur.fetchone()["id"]
    with conn:
        cur2 = conn.execute(
            """
            INSERT INTO answers (usn, question_id, status, final_marks, decision, flags, evaluated_at)
            VALUES ('4SF22CS001', ?, 'evaluated', 2.5, 'pending', '["borderline"]', ?);
            """,
            (qid, now_iso()),
        )
        answer_id = cur2.lastrowid
    conn.close()

    # 1. POST /api/exam/approve is blocked with 409 UNREVIEWED_ANSWERS
    r1 = client.post("/api/exam/approve")
    assert r1.status_code == 409
    assert r1.json()["error"]["code"] == "UNREVIEWED_ANSWERS"
    assert r1.json()["error"]["detail"]["unreviewed_count"] >= 1

    # 2. Review the answer (decision = "accepted")
    r2 = client.patch(f"/api/answers/{answer_id}", json={"final_marks": 2.5, "decision": "accepted"})
    assert r2.status_code == 200
    assert r2.json()["decision"] == "accepted"
    # Approved Decision 3: needs_review remains True because flags are present
    assert r2.json()["needs_review"] is True

    # 3. POST /api/exam/approve now succeeds and transitions state to FINAL
    r3 = client.post("/api/exam/approve")
    assert r3.status_code == 200
    assert r3.json()["state"] == "FINAL"

    # Verify state in GET /api/exam
    r4 = client.get("/api/exam")
    assert r4.json()["state"] == "FINAL"


def test_marksheet_json_csv_agreement(client):
    """9. GET /api/exam/marksheet and GET /api/exam/marksheet.csv match:

    CSV headers USN,Name,Q<num1>,...,Total,Max,Flags,Review_Status,
    question marks keyed by string question IDs, blank cells for unevaluated
    answers, and matching numerical totals.
    """
    # Seed full demo data with 2 students:
    # Asha Rao (4SF22CS001): unevaluated answers (0.0 marks)
    # Ravi Kumar (4SF22CS002): evaluated on 1a (3.0), 1b (2.5), 2a (5.0) = 10.5 total
    seed_db(settings.DATABASE_PATH)

    # 1. Fetch JSON marksheet
    r_json = client.get("/api/exam/marksheet")
    assert r_json.status_code == 200
    marksheet = r_json.json()

    # 2. Fetch CSV marksheet
    r_csv = client.get("/api/exam/marksheet.csv")
    assert r_csv.status_code == 200
    assert "text/csv" in r_csv.headers.get("content-type", "")

    csv_reader = csv.reader(io.StringIO(r_csv.text))
    csv_rows = list(csv_reader)
    assert len(csv_rows) == 3  # Header + 2 students

    header = csv_rows[0]
    expected_header = ["USN", "Name", "Q1a", "Q1b", "Q2a", "Total", "Max", "Flags", "Review_Status"]
    assert header == expected_header

    # Build student map from CSV
    csv_student_map = {row[0]: row for row in csv_rows[1:]}

    # Verify each student in JSON matches CSV
    assert len(marksheet["rows"]) == 2
    for s_row in marksheet["rows"]:
        usn = s_row["usn"]
        assert usn in csv_student_map
        csv_row = csv_student_map[usn]

        # Name
        assert csv_row[1] == s_row["name"]

        # Question marks keyed by string question IDs
        for idx, q in enumerate(marksheet["questions"]):
            qid_str = str(q.get("question_id") or q.get("id"))
            csv_mark_str = csv_row[2 + idx]
            if qid_str in s_row["marks"] and s_row["marks"][qid_str] is not None:
                assert float(csv_mark_str) == float(s_row["marks"][qid_str])
            else:
                # Unevaluated questions must be blank cell
                assert csv_mark_str == ""

        # Total
        expected_total = s_row["total"] if s_row["total"] is not None else 0.0
        assert float(csv_row[5]) == float(expected_total)

        # Max marks
        assert float(csv_row[6]) == float(s_row["max_marks"])

        # Flags count
        assert int(csv_row[7]) == int(s_row["flags"])

        # Review_Status
        assert csv_row[8] == s_row["review_status"]


def test_contract_null_fields_present(client):
    """10. Contract Nullability:

    Asserts nullable keys (key_filename, transcript, ocr_confidence, suggested_marks,
    average, decision, etc.) are explicitly present as None / null in the JSON
    response when unevaluated, never omitted (docs/API_CONTRACT.md Rule 27).
    """
    # 1. In fresh DB state, key_filename is explicitly None
    r_exam = client.get("/api/exam")
    assert r_exam.status_code == 200
    exam_data = r_exam.json()
    assert "key_filename" in exam_data
    assert exam_data["key_filename"] is None

    # 2. Confirm key and add student with 0 evaluated answers
    client.post(
        "/api/exam/key/confirm",
        json={
            "questions": [
                {"number": "1a", "text": "Q1", "max_marks": 5.0, "key_points": ["KP 1"]},
            ]
        },
    )
    client.post("/api/students", json={"usn": "4SF22CS001", "name": "Asha Rao"})

    # Student summary average is explicitly None
    r_students = client.get("/api/students")
    assert r_students.status_code == 200
    student_summary = r_students.json()[0]
    assert "average" in student_summary
    assert student_summary["average"] is None

    # 3. Student detail unevaluated answers nullable fields
    r_detail = client.get("/api/students/4SF22CS001")
    assert r_detail.status_code == 200
    ans = r_detail.json()["answers"][0]

    nullable_keys = [
        "answer_id",
        "image_url",
        "transcript",
        "ocr_confidence",
        "coverage",
        "suggested_marks",
        "final_marks",
        "decision",
        "review_reason",
        "evaluated_at",
    ]
    for key in nullable_keys:
        assert key in ans, f"Nullable key '{key}' must be present in Answer JSON"
        assert ans[key] is None, f"Expected '{key}' to be None, got {ans[key]}"


# ==============================================================================
# Additional Edge Case & Contract Verifications
# ==============================================================================

def test_exam_reset_cleanup(client):
    """Verify POST /api/exam/reset clears DB rows and preserves filesystem structure."""
    seed_db(settings.DATABASE_PATH)

    res = client.post("/api/exam/reset")
    assert res.status_code == 200
    assert res.json()["state"] == "NO_KEY"
    assert res.json()["question_count"] == 0
    assert res.json()["student_count"] == 0


def test_key_file_missing_404(client):
    """Verify GET /api/exam/key/file returns 404 with contract message when no file exists."""
    res = client.get("/api/exam/key/file")
    assert res.status_code == 404
    assert res.json()["error"]["code"] == "NOT_FOUND"
    assert "No key file associated with this exam" in res.json()["error"]["message"]
