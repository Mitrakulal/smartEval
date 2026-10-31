/**
 * Response and request types for the SmartEval API.
 *
 * Hand-written from docs/API_CONTRACT.md (v1.1) because the backend has no
 * OpenAPI schema yet. When it does, this file is replaced by generated types
 * in a single commit — every component imports from here, so nothing else moves.
 */

export type ExamStateName = 'NO_KEY' | 'KEY_PARSED' | 'READY' | 'FINAL';
export type GradingMode = 'semantic' | 'manual';
export type Confidence = 'parsed' | 'guessed' | 'missing';
export type AnswerStatus = 'pending' | 'processing' | 'evaluated' | 'error';
export type Decision = 'pending' | 'accepted' | 'overridden';
export type AnswerFlag =
  | 'low_ocr_confidence'
  | 'degenerate_transcript'
  | 'borderline'
  | 'zero_coverage'
  | 'manual_question';
export type JobStatus = 'queued' | 'running' | 'done' | 'error';
export type JobStep = 'preprocess' | 'ocr' | 'embed' | 'score' | 'done';
export type StudentStatus = 'not_started' | 'in_progress' | 'complete';
export type ReviewStatus = 'pending' | 'reviewed';

/* ---------- exam ---------- */

export interface ExamKeyPoint {
  id: number;
  text: string;
}

export interface ExamQuestion {
  question_id: number;
  number: number;
  text: string;
  max_marks: number;
  grading_mode: GradingMode;
  key_points: ExamKeyPoint[];
}

export interface ExamState {
  state: ExamStateName;
  subject: string;
  point_threshold: number;
  borderline_band: number;
  question_count: number;
  student_count: number;
  key_filename: string | null;
  questions: ExamQuestion[];
  updated_at: string;
}

/* ---------- key parsing ---------- */

export interface DraftKeyPoint {
  text: string;
  confidence: Confidence;
}

export interface QuestionConfidence {
  text: Confidence;
  max_marks: Confidence;
}

export interface DraftQuestion {
  number: number;
  text: string;
  max_marks: number;
  grading_mode: GradingMode;
  key_points: DraftKeyPoint[];
  confidence: QuestionConfidence;
}

export interface KeyDraft {
  draft_id: string;
  filename: string;
  questions: DraftQuestion[];
  warnings: string[];
}

export interface ConfirmQuestion {
  number: number;
  text: string;
  max_marks: number;
  grading_mode: GradingMode;
  key_points: { text: string }[];
}

export interface ConfirmKeyRequest {
  draft_id: string;
  questions: ConfirmQuestion[];
}

export interface SettingsRequest {
  subject?: string;
  point_threshold?: number;
  borderline_band?: number;
}

/* ---------- students ---------- */

export interface StudentSummary {
  usn: string;
  name: string;
  answered: number;
  total: number;
  average: number | null;
  flags: number;
  status: StudentStatus;
}

/* ---------- answers ---------- */

export interface MatchedKeyPoint {
  id: number;
  text: string;
  covered: boolean;
  similarity: number;
  borderline: boolean;
}

export interface Answer {
  answer_id: number | null;
  question_id: number;
  question_number: number;
  question_text: string;
  max_marks: number;
  status: AnswerStatus;
  image_url: string | null;
  transcript: string | null;
  ocr_confidence: number | null;
  key_points: MatchedKeyPoint[];
  coverage: number | null;
  covered_count: number;
  key_point_count: number;
  suggested_marks: number | null;
  final_marks: number | null;
  decision: Decision | null;
  flags: AnswerFlag[];
  needs_review: boolean;
  review_reason: string | null;
  evaluated_at: string | null;
}

export interface StudentDetail {
  usn: string;
  name: string;
  total_marks: number;
  max_marks: number;
  answers: Answer[];
}

export interface ReviewRequest {
  final_marks: number;
  decision: 'accepted' | 'overridden';
  reason?: string;
}

/* ---------- jobs ---------- */

export interface JobError {
  code: string;
  message: string;
}

export interface Job {
  job_id: string;
  status: JobStatus;
  step: JobStep | null;
  progress: number;
  message: string;
  answer_id: number | null;
  error: JobError | null;
}

export interface UploadResponse {
  job_id: string;
}

/* ---------- marksheet ---------- */

export interface MarksheetQuestion {
  question_id: number;
  number: number;
  max_marks: number;
}

export interface MarksheetRow {
  usn: string;
  name: string;
  /** Keyed by question_id as a string. Missing key means not evaluated. */
  marks: Record<string, number>;
  total: number;
  flags: number;
  status: StudentStatus;
  review_status: ReviewStatus;
}

export interface Marksheet {
  subject: string;
  max_marks: number;
  questions: MarksheetQuestion[];
  rows: MarksheetRow[];
  class_average: number | null;
  generated_at: string;
}

/* ---------- errors ---------- */

export interface ApiErrorBody {
  error: {
    code: string;
    message: string;
    detail: unknown;
  };
}
