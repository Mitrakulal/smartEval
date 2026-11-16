"""Pydantic request and response schemas for SmartEval API.

Strictly adheres to docs/API_CONTRACT.md v1.4, incorporating:
- Rule 1: Strict snake_case across all JSON keys and fields.
- Rule 2: Explicit nullability. All nullable fields have explicit None defaults
          so that serialization preserves null rather than omitting the key.
- Rule 3: Question numbers are free-form strings ("1", "1a", "2b", "4(c)").
- Rule 7: Marksheet marks dictionary is keyed by question_id as a string.
"""

from enum import Enum
from typing import Any, Dict, List, Optional, Union
from pydantic import BaseModel, ConfigDict, Field, field_validator, model_validator


# ==============================================================================
# Enums
# ==============================================================================

class ExamStateEnum(str, Enum):
    NO_KEY = "NO_KEY"
    KEY_PARSED = "KEY_PARSED"
    READY = "READY"
    FINAL = "FINAL"


class GradingModeEnum(str, Enum):
    SEMANTIC = "semantic"
    MANUAL = "manual"


class ConfidenceEnum(str, Enum):
    PARSED = "parsed"
    GUESSED = "guessed"
    MISSING = "missing"


class AnswerStatusEnum(str, Enum):
    PENDING = "pending"
    PROCESSING = "processing"
    EVALUATED = "evaluated"
    ERROR = "error"


class DecisionEnum(str, Enum):
    PENDING = "pending"
    ACCEPTED = "accepted"
    OVERRIDDEN = "overridden"


class AnswerFlagEnum(str, Enum):
    LOW_OCR_CONFIDENCE = "low_ocr_confidence"
    DEGENERATE_TRANSCRIPT = "degenerate_transcript"
    BORDERLINE = "borderline"
    ZERO_COVERAGE = "zero_coverage"
    MANUAL_QUESTION = "manual_question"


class JobStatusEnum(str, Enum):
    QUEUED = "queued"
    RUNNING = "running"
    DONE = "done"
    ERROR = "error"


class JobStepEnum(str, Enum):
    PREPROCESS = "preprocess"
    OCR = "ocr"
    EMBED = "embed"
    SCORE = "score"
    DONE = "done"


class StudentStatusEnum(str, Enum):
    NOT_STARTED = "not_started"
    IN_PROGRESS = "in_progress"
    COMPLETE = "complete"


class ReviewStatusEnum(str, Enum):
    PENDING = "pending"
    REVIEWED = "reviewed"


# ==============================================================================
# Exam & Key Management Schemas
# ==============================================================================

class ExamKeyPoint(BaseModel):
    model_config = ConfigDict(from_attributes=True)

    id: int
    text: str
    position: Optional[int] = None


class ExamQuestion(BaseModel):
    model_config = ConfigDict(from_attributes=True, populate_by_name=True)

    id: Optional[int] = None
    question_id: Optional[int] = None
    number: str
    text: str
    max_marks: float
    grading_mode: str = "semantic"
    position: Optional[int] = None
    key_points: List[ExamKeyPoint] = Field(default_factory=list)

    @model_validator(mode="after")
    def sync_question_id(self) -> "ExamQuestion":
        if self.question_id is None and self.id is not None:
            self.question_id = self.id
        elif self.id is None and self.question_id is not None:
            self.id = self.question_id
        return self


class ExamState(BaseModel):
    model_config = ConfigDict(from_attributes=True)

    id: Optional[int] = 1
    state: str = "NO_KEY"
    subject: str = "Computer Networks"
    point_threshold: float = 0.55
    borderline_band: float = 0.10
    key_filename: Optional[str] = None
    question_count: int = 0
    student_count: int = 0
    questions: List[ExamQuestion] = Field(default_factory=list)
    updated_at: Optional[str] = None


class DraftKeyPoint(BaseModel):
    model_config = ConfigDict(from_attributes=True)

    id: Optional[int] = None
    text: str
    confidence: Optional[str] = "parsed"


class QuestionConfidence(BaseModel):
    model_config = ConfigDict(from_attributes=True)

    text: str = "parsed"
    max_marks: str = "parsed"


class DraftQuestion(BaseModel):
    model_config = ConfigDict(from_attributes=True)

    number: str
    text: str
    max_marks: float
    grading_mode: str = "semantic"
    key_points: List[DraftKeyPoint] = Field(default_factory=list)
    confidence: Optional[Union[QuestionConfidence, Dict[str, Any]]] = None


class KeyDraft(BaseModel):
    model_config = ConfigDict(from_attributes=True)

    draft_id: str
    filename: str
    questions: List[DraftQuestion] = Field(default_factory=list)
    warnings: List[str] = Field(default_factory=list)


class ConfirmKeyPoint(BaseModel):
    model_config = ConfigDict(from_attributes=True)

    text: str


class ConfirmQuestion(BaseModel):
    model_config = ConfigDict(from_attributes=True)

    number: str
    text: str
    max_marks: float
    grading_mode: str = "semantic"
    key_points: List[str] = Field(default_factory=list)

    @field_validator("key_points", mode="before")
    @classmethod
    def coerce_key_points(cls, v: Any) -> List[str]:
        if not isinstance(v, list):
            return v
        coerced: List[str] = []
        for item in v:
            if isinstance(item, str):
                coerced.append(item)
            elif isinstance(item, dict) and "text" in item:
                coerced.append(str(item["text"]))
            elif hasattr(item, "text"):
                coerced.append(str(getattr(item, "text")))
            else:
                coerced.append(str(item))
        return coerced


class ConfirmKeyRequest(BaseModel):
    model_config = ConfigDict(from_attributes=True)

    draft_id: Optional[str] = None
    questions: List[ConfirmQuestion] = Field(default_factory=list)


class SettingsRequest(BaseModel):
    model_config = ConfigDict(from_attributes=True)

    subject: Optional[str] = None
    point_threshold: Optional[float] = None
    borderline_band: Optional[float] = None


# ==============================================================================
# Students Schemas
# ==============================================================================

class StudentCreateRequest(BaseModel):
    model_config = ConfigDict(from_attributes=True)

    usn: str
    name: Optional[str] = ""


class StudentSummary(BaseModel):
    model_config = ConfigDict(from_attributes=True)

    usn: str
    name: str = ""
    status: str = "not_started"
    answered: int = 0
    total: int = 0
    average: Optional[float] = None
    flags: int = 0


# ==============================================================================
# Answers & Evaluation Schemas
# ==============================================================================

class MatchedKeyPoint(BaseModel):
    model_config = ConfigDict(from_attributes=True)

    id: int
    text: str
    covered: bool = False
    similarity: float = 0.0
    borderline: bool = False


class Answer(BaseModel):
    model_config = ConfigDict(from_attributes=True)

    answer_id: Optional[int] = None
    question_id: int
    question_number: str
    question_text: Optional[str] = None
    max_marks: Optional[float] = None
    status: str = "pending"
    image_url: Optional[str] = None
    transcript: Optional[str] = None
    ocr_confidence: Optional[float] = None
    key_points: List[MatchedKeyPoint] = Field(default_factory=list)
    coverage: Optional[float] = None
    covered_count: Optional[int] = 0
    key_point_count: Optional[int] = 0
    suggested_marks: Optional[float] = None
    final_marks: Optional[float] = None
    decision: Optional[str] = None
    flags: List[str] = Field(default_factory=list)
    review_reason: Optional[str] = None
    needs_review: bool = False
    evaluated_at: Optional[str] = None


class StudentDetail(BaseModel):
    model_config = ConfigDict(from_attributes=True)

    usn: str
    name: str = ""
    total_marks: float = 0.0
    max_marks: float = 0.0
    status: str = "not_started"
    answers: List[Answer] = Field(default_factory=list)


class ReviewRequest(BaseModel):
    model_config = ConfigDict(from_attributes=True)

    final_marks: float
    decision: str
    reason: Optional[str] = None


# ==============================================================================
# Jobs Schemas
# ==============================================================================

class JobError(BaseModel):
    model_config = ConfigDict(from_attributes=True)

    code: str
    message: str


class Job(BaseModel):
    model_config = ConfigDict(from_attributes=True)

    job_id: str
    status: str
    step: Optional[str] = None
    progress: float = 0.0
    message: str = ""
    answer_id: Optional[int] = None
    error: Optional[Union[Dict[str, Any], JobError]] = None


class JobCreateResponse(BaseModel):
    model_config = ConfigDict(from_attributes=True)

    job_id: str


# Frontend alias for JobCreateResponse
UploadResponse = JobCreateResponse


# ==============================================================================
# Marksheet Schemas
# ==============================================================================

class MarksheetQuestion(BaseModel):
    model_config = ConfigDict(from_attributes=True, populate_by_name=True)

    id: Optional[str] = None
    question_id: Optional[int] = None
    number: str
    max_marks: float

    @model_validator(mode="after")
    def sync_question_ids(self) -> "MarksheetQuestion":
        if self.question_id is None and self.id is not None:
            try:
                self.question_id = int(self.id)
            except (ValueError, TypeError):
                pass
        elif self.id is None and self.question_id is not None:
            self.id = str(self.question_id)
        return self


class MarksheetRow(BaseModel):
    model_config = ConfigDict(from_attributes=True, populate_by_name=True)

    usn: str
    name: str
    marks: Dict[str, Optional[float]] = Field(default_factory=dict)
    total: Optional[float] = None
    total_marks: Optional[float] = None
    max_marks: Optional[float] = None
    flags: int = 0
    status: str = "not_started"
    review_status: str = "pending"

    @model_validator(mode="after")
    def sync_totals(self) -> "MarksheetRow":
        if self.total is None and self.total_marks is not None:
            self.total = self.total_marks
        elif self.total_marks is None and self.total is not None:
            self.total_marks = self.total
        return self


class Marksheet(BaseModel):
    model_config = ConfigDict(from_attributes=True)

    subject: Optional[str] = "Computer Networks"
    max_marks: Optional[float] = None
    questions: List[MarksheetQuestion] = Field(default_factory=list)
    rows: List[MarksheetRow] = Field(default_factory=list)
    class_average: Optional[float] = None
    total_students: Optional[int] = None
    generated_at: Optional[str] = None

    @model_validator(mode="after")
    def sync_student_count(self) -> "Marksheet":
        if self.total_students is None:
            self.total_students = len(self.rows)
        return self


# ==============================================================================
# Error Schemas
# ==============================================================================

class ApiErrorDetail(BaseModel):
    model_config = ConfigDict(from_attributes=True)

    code: str
    message: str
    detail: Optional[Union[Dict[str, Any], List[Any], Any]] = Field(default_factory=dict)


class ApiErrorResponse(BaseModel):
    model_config = ConfigDict(from_attributes=True)

    error: ApiErrorDetail


# Compatibility alias
ApiErrorBody = ApiErrorResponse
