import axios, { AxiosError } from 'axios';
import type {
  ExamState,
  KeyDraft,
  ConfirmKeyRequest,
  SettingsRequest,
  Marksheet,
  ApiErrorBody,
  StudentSummary,
  StudentDetail,
  StudentStatus,
  Answer,
  ReviewRequest,
  Job,
  UploadResponse,
} from './types.ts';

import rawExamMock from './mocks/exam.json';
import rawKeyDraftMock from './mocks/key_draft.json';
import rawMarksheetMock from './mocks/marksheet.json';
import rawStudentsMock from './mocks/students.json';
import rawStudentMock from './mocks/student.json';
import rawStudentRaviMock from './mocks/student_ravi.json';
import rawJobDoneMock from './mocks/job_done.json';

export const isMockMode = import.meta.env.VITE_MOCK === '1';

export const apiClient = axios.create({
  baseURL: import.meta.env.VITE_API_BASE_URL || '/api',
  headers: {
    'Content-Type': 'application/json',
  },
});

export class ApiError extends Error {
  code: string;
  detail: unknown;
  status?: number;

  constructor(message: string, code = 'UNKNOWN_ERROR', detail: unknown = null, status?: number) {
    super(message);
    this.name = 'ApiError';
    this.code = code;
    this.detail = detail;
    this.status = status;
  }
}

export function extractApiError(err: unknown): ApiError {
  if (err instanceof ApiError) {
    return err;
  }

  if (axios.isAxiosError(err)) {
    const axiosError = err as AxiosError<ApiErrorBody>;
    const errorBody = axiosError.response?.data?.error;
    if (errorBody) {
      return new ApiError(
        errorBody.message || 'Request failed',
        errorBody.code || 'UNKNOWN_ERROR',
        errorBody.detail,
        axiosError.response?.status
      );
    }
    return new ApiError(
      axiosError.message || 'Network error',
      'NETWORK_ERROR',
      null,
      axiosError.response?.status
    );
  }

  if (err instanceof Error) {
    return new ApiError(err.message, 'CLIENT_ERROR');
  }

  return new ApiError('An unexpected error occurred', 'INTERNAL');
}

// In-memory mock store for interactive simulation in mock mode
let mockExamState: ExamState = JSON.parse(JSON.stringify(rawExamMock)) as ExamState;
let mockKeyDraft: KeyDraft = JSON.parse(JSON.stringify(rawKeyDraftMock)) as KeyDraft;
let mockMarksheet: Marksheet = JSON.parse(JSON.stringify(rawMarksheetMock)) as Marksheet;
let mockStudents: StudentSummary[] = JSON.parse(JSON.stringify(rawStudentsMock)) as StudentSummary[];
let mockStudentDetails: Record<string, StudentDetail> = {
  '4SF22CS001': JSON.parse(JSON.stringify(rawStudentMock)) as StudentDetail,
  '4SF22CS002': JSON.parse(JSON.stringify(rawStudentRaviMock)) as StudentDetail,
};
let mockFileBlob: Blob | null = new Blob(['Dummy DOCX key content'], {
  type: 'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
});
const mockJobs = new Map<string, { createdAt: number; answerId: number }>();

const DEMO_TRANSCRIPTS: Record<string, string> = {
  '1a': 'The OSI model is a seven-layer reference architecture that divides network communication into layers. The physical layer transmits bits, the data link layer handles framing and error control, and the network layer routes packets. The transport layer provides end-to-end delivery, the session layer manages dialogs, the presentation layer translates and encrypts data, and the application layer provides services to the user.',
  '1b': 'Circuit switching establishes a dedicated physical path before the transfer and keeps it for the whole call, so bandwidth is reserved even when nobody is speaking. Packet switching breaks data into packets and forwards them independently with store-and-forward, sharing links statistically. Circuit switching is good for continuous voice, while packet switching is good for bursty data traffic.',
  '2a': "The client sends a SYN segment with its initial sequence number. The server replies with a SYN-ACK that acknowledges the client ISN and carries the server's own initial sequence number. The client then sends an ACK for the server ISN, and the connection is established. Both endpoints have now synchronized their sequence numbers. The exchange also prevents an old duplicate connection request from being accepted. A labelled diagram shows the client and server states for SYN, SYN-ACK and ACK.",
};

function delay(ms = 250): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

function statusFor(answered: number, total: number): StudentStatus {
  if (answered === 0) return 'not_started';
  return answered === total && total > 0 ? 'complete' : 'in_progress';
}

/**
 * Keep the mock summaries and marksheet consistent with the in-memory answers.
 * The real backend recomputes both on every request; this mirrors that behavior
 * so a mock-mode upload/review/clear is visible throughout the UI.
 */
function refreshMockAggregates(): void {
  const questions = mockExamState.questions;
  const totalQuestions = questions.length;
  mockExamState.student_count = mockStudents.length;
  mockExamState.question_count = totalQuestions;

  for (const student of mockStudents) {
    const detail = mockStudentDetails[student.usn];
    const evaluated = detail
      ? detail.answers.filter((answer) => answer.status === 'evaluated')
      : [];
    const marksTotal = evaluated.reduce(
      (sum, answer) => sum + (answer.final_marks ?? 0),
      0
    );
    student.answered = evaluated.length;
    student.total = totalQuestions;
    student.average =
      evaluated.length > 0
        ? Math.round((marksTotal / evaluated.length) * 10) / 10
        : null;
    student.flags = evaluated.filter((answer) => answer.flags.length > 0).length;
    student.status = statusFor(evaluated.length, totalQuestions);
    if (detail) {
      detail.total_marks =
        Math.round(
          evaluated.reduce(
            (sum, answer) => sum + (answer.final_marks ?? 0),
            0
          ) * 100
        ) / 100;
    }
  }

  const rows = mockStudents.map((student) => {
    const detail = mockStudentDetails[student.usn];
    const marks: Record<string, number> = {};
    let total = 0;
    let answered = 0;
    let flagCount = 0;
    let needsReview = false;

    for (const answer of detail?.answers ?? []) {
      if (answer.status !== 'evaluated') continue;
      if (answer.final_marks !== null) {
        marks[String(answer.question_id)] = answer.final_marks;
        total += answer.final_marks;
        answered += 1;
      }
      if (answer.flags.length > 0) {
        flagCount += 1;
        if (answer.decision === 'pending') needsReview = true;
      }
    }

    return {
      usn: student.usn,
      name: student.name,
      marks,
      total: Math.round(total * 10) / 10,
      flags: flagCount,
      status: statusFor(answered, totalQuestions),
      review_status: (needsReview ? 'pending' : 'reviewed') as
        | 'pending'
        | 'reviewed',
    };
  });

  const evaluatedTotals = rows
    .filter((row) => Object.keys(row.marks).length > 0)
    .map((row) => row.total);

  mockMarksheet = {
    subject: mockExamState.subject,
    max_marks: questions.reduce((sum, question) => sum + question.max_marks, 0),
    questions: questions.map((question) => ({
      question_id: question.question_id,
      number: question.number,
      max_marks: question.max_marks,
    })),
    rows,
    class_average:
      evaluatedTotals.length > 0
        ? Math.round(
            (evaluatedTotals.reduce((sum, value) => sum + value, 0) /
              evaluatedTotals.length) *
              10
          ) / 10
        : null,
    generated_at: new Date().toISOString(),
  };
}

export async function fetchExamState(): Promise<ExamState> {
  if (isMockMode) {
    await delay();
    return JSON.parse(JSON.stringify(mockExamState)) as ExamState;
  }
  const res = await apiClient.get<ExamState>('/exam');
  return res.data;
}

export async function parseKeyFile(file: File): Promise<KeyDraft> {
  if (isMockMode) {
    await delay(600);
    if (!file.name.endsWith('.pdf') && !file.name.endsWith('.docx')) {
      throw new ApiError('Only .pdf and .docx files are accepted', 'INVALID_FILE', null, 400);
    }
    if (file.size > 10 * 1024 * 1024) {
      throw new ApiError('File exceeds 10 MB limit', 'INVALID_FILE', null, 400);
    }

    mockFileBlob = file;
    mockExamState = {
      ...mockExamState,
      state: 'KEY_PARSED',
      key_filename: file.name,
      updated_at: new Date().toISOString(),
    };
    return JSON.parse(JSON.stringify(mockKeyDraft)) as KeyDraft;
  }

  const formData = new FormData();
  formData.append('file', file);
  const res = await apiClient.post<KeyDraft>('/exam/key/parse', formData, {
    headers: { 'Content-Type': 'multipart/form-data' },
  });
  return res.data;
}

export async function confirmExamKey(req: ConfirmKeyRequest): Promise<ExamState> {
  if (isMockMode) {
    await delay(400);
    let nextKeyPointId = 1;
    const questions = req.questions.map((q, idx) => ({
      question_id: idx + 1,
      number: q.number,
      text: q.text,
      max_marks: q.max_marks,
      grading_mode: q.grading_mode,
      key_points: q.key_points.map((kp) => ({ id: nextKeyPointId++, text: kp.text })),
    }));
    mockExamState = {
      ...mockExamState,
      state: 'READY',
      question_count: questions.length,
      questions,
      updated_at: new Date().toISOString(),
    };
    // Confirming a key replaces all answers, exactly like the backend.
    mockStudentDetails = {};
    refreshMockAggregates();
    return JSON.parse(JSON.stringify(mockExamState)) as ExamState;
  }

  const res = await apiClient.post<ExamState>('/exam/key/confirm', req);
  return res.data;
}

export async function updateExamSettings(req: SettingsRequest): Promise<ExamState> {
  if (isMockMode) {
    await delay();
    mockExamState = {
      ...mockExamState,
      ...(req.subject !== undefined && { subject: req.subject }),
      ...(req.point_threshold !== undefined && { point_threshold: req.point_threshold }),
      ...(req.borderline_band !== undefined && { borderline_band: req.borderline_band }),
      updated_at: new Date().toISOString(),
    };
    refreshMockAggregates();
    return JSON.parse(JSON.stringify(mockExamState)) as ExamState;
  }

  const res = await apiClient.patch<ExamState>('/exam/settings', req);
  return res.data;
}

export async function fetchKeyFile(): Promise<Blob> {
  if (isMockMode) {
    await delay();
    return mockFileBlob || new Blob(['Answer key preview'], { type: 'application/pdf' });
  }

  const res = await apiClient.get('/exam/key/file', { responseType: 'blob' });
  return res.data as Blob;
}

export async function resetExam(): Promise<ExamState> {
  if (isMockMode) {
    await delay(300);
    mockExamState = {
      state: 'NO_KEY',
      subject: 'Computer Networks',
      point_threshold: 0.55,
      borderline_band: 0.1,
      question_count: 0,
      student_count: 0,
      key_filename: null,
      questions: [],
      updated_at: new Date().toISOString(),
    };
    mockFileBlob = null;
    mockStudents = [];
    mockStudentDetails = {};
    refreshMockAggregates();
    return JSON.parse(JSON.stringify(mockExamState)) as ExamState;
  }

  const res = await apiClient.post<ExamState>('/exam/reset');
  return res.data;
}

export async function fetchMarksheet(): Promise<Marksheet> {
  if (isMockMode) {
    await delay();
    return JSON.parse(JSON.stringify(mockMarksheet)) as Marksheet;
  }

  const res = await apiClient.get<Marksheet>('/exam/marksheet');
  return res.data;
}

export async function fetchMarksheetCsvBlob(): Promise<Blob> {
  if (isMockMode) {
    await delay();
    const header = [
      'USN',
      'Name',
      ...mockMarksheet.questions.map((question) => `Q${question.number}`),
      'Total',
      'Max',
      'Flags',
      'Review_Status',
    ];
    const lines = [header.join(',')];
    for (const row of mockMarksheet.rows) {
      const values = [
        row.usn,
        row.name,
        ...mockMarksheet.questions.map((question) => {
          const mark = row.marks[String(question.question_id)];
          return mark === undefined ? '' : mark.toFixed(1);
        }),
        row.total.toFixed(1),
        String(mockMarksheet.max_marks),
        String(row.flags),
        row.review_status,
      ];
      lines.push(values.join(','));
    }
    return new Blob([`${lines.join('\r\n')}\r\n`], {
      type: 'text/csv;charset=utf-8;',
    });
  }

  const res = await apiClient.get('/exam/marksheet.csv', { responseType: 'blob' });
  return res.data as Blob;
}

export async function approveExam(): Promise<ExamState> {
  if (isMockMode) {
    await delay(400);
    mockExamState = {
      ...mockExamState,
      state: 'FINAL',
      updated_at: new Date().toISOString(),
    };
    return JSON.parse(JSON.stringify(mockExamState)) as ExamState;
  }

  const res = await apiClient.post<ExamState>('/exam/approve');
  return res.data;
}

/* =========================================================================
   Students & Evaluation APIs (F2)
   ========================================================================= */

export async function fetchStudents(): Promise<StudentSummary[]> {
  if (isMockMode) {
    await delay();
    return JSON.parse(JSON.stringify(mockStudents)) as StudentSummary[];
  }
  const res = await apiClient.get<StudentSummary[]>('/students');
  return res.data;
}

export async function createStudent(req: { usn: string; name: string }): Promise<StudentSummary> {
  if (isMockMode) {
    await delay(300);
    const existing = mockStudents.find((s) => s.usn.toUpperCase() === req.usn.toUpperCase());
    if (existing) {
      throw new ApiError(`Student with USN ${req.usn} already exists`, 'DUPLICATE_USN', null, 409);
    }
    const newStudent: StudentSummary = {
      usn: req.usn.toUpperCase().trim(),
      name: req.name.trim() || 'New Student',
      answered: 0,
      total: mockExamState.questions.length,
      average: null,
      flags: 0,
      status: 'not_started',
    };
    mockStudents.push(newStudent);
    refreshMockAggregates();
    return JSON.parse(JSON.stringify(newStudent)) as StudentSummary;
  }
  const res = await apiClient.post<StudentSummary>('/students', req);
  return res.data;
}

export async function fetchStudentDetail(usn: string): Promise<StudentDetail> {
  if (isMockMode) {
    await delay();
    if (mockStudentDetails[usn]) {
      return JSON.parse(JSON.stringify(mockStudentDetails[usn])) as StudentDetail;
    }
    // Generate empty answer structure for newly created students based on current exam questions
    const summary = mockStudents.find((s) => s.usn === usn);
    const qList = mockExamState.questions;
    let totalMaxMarks = 0;
    for (const q of qList) {
      totalMaxMarks += q.max_marks;
    }
    const generated: StudentDetail = {
      usn,
      name: summary?.name || 'Student',
      total_marks: 0,
      max_marks: totalMaxMarks,
      answers: qList.map((q) => ({
        answer_id: null,
        question_id: q.question_id,
        question_number: q.number,
        question_text: q.text,
        max_marks: q.max_marks,
        status: 'pending' as const,
        image_url: null,
        transcript: null,
        ocr_confidence: null,
        key_points: q.key_points.map((keyPoint) => ({
          id: keyPoint.id,
          text: keyPoint.text,
          covered: false,
          similarity: 0,
          borderline: false,
        })),
        coverage: null,
        covered_count: 0,
        key_point_count: q.key_points.length,
        suggested_marks: null,
        final_marks: null,
        decision: null,
        flags: [],
        needs_review: false,
        review_reason: null,
        evaluated_at: null,
      })),
    };
    mockStudentDetails[usn] = generated;
    refreshMockAggregates();
    return JSON.parse(JSON.stringify(generated)) as StudentDetail;
  }
  const res = await apiClient.get<StudentDetail>(`/students/${encodeURIComponent(usn)}`);
  return res.data;
}

export async function uploadAnswerPhoto(
  usn: string,
  qid: number,
  file: File
): Promise<UploadResponse> {
  if (isMockMode) {
    await delay(500);
    const jobId = `job_${Date.now()}`;
    mockJobs.set(jobId, { createdAt: Date.now(), answerId: 0 });
    // Simulate background evaluation completing
    setTimeout(() => {
      const student = mockStudentDetails[usn];
      if (student) {
        const ans = student.answers.find((a) => a.question_id === qid);
        if (ans) {
          const question = mockExamState.questions.find(
            (item) => item.question_id === qid
          );
          const keyPoints =
            question?.key_points ??
            ans.key_points.map((keyPoint) => ({
              id: keyPoint.id,
              text: keyPoint.text,
            }));
          ans.answer_id = Date.now();
          ans.status = 'evaluated';
          ans.image_url = URL.createObjectURL(file);
          ans.transcript =
            DEMO_TRANSCRIPTS[ans.question_number] ||
            'Handwritten response transcribed by Gemini for evaluation.';
          ans.ocr_confidence = 0.92;
          ans.key_points = keyPoints.map((keyPoint) => ({
            id: keyPoint.id,
            text: keyPoint.text,
            covered: true,
            similarity: 0.9,
            borderline: false,
          }));
          ans.coverage = keyPoints.length > 0 ? 1 : 0;
          ans.covered_count = keyPoints.length;
          ans.key_point_count = keyPoints.length;
          ans.suggested_marks = keyPoints.length > 0 ? ans.max_marks : 0;
          ans.final_marks = null;
          ans.decision = 'pending';
          ans.flags = [];
          ans.needs_review = false;
          ans.evaluated_at = new Date().toISOString();
          refreshMockAggregates();
        }
      }
    }, 1500);
    return { job_id: jobId };
  }

  const formData = new FormData();
  formData.append('image', file);
  const res = await apiClient.post<UploadResponse>(
    `/students/${encodeURIComponent(usn)}/answers/${qid}`,
    formData,
    { headers: { 'Content-Type': 'multipart/form-data' } }
  );
  return res.data;
}

export async function fetchJob(jobId: string): Promise<Job> {
  if (isMockMode) {
    await delay(200);
    const entry = mockJobs.get(jobId);
    const elapsed = entry ? Date.now() - entry.createdAt : Number.MAX_SAFE_INTEGER;
    if (elapsed < 1800) {
      return {
        job_id: jobId,
        status: 'running',
        step: 'ocr',
        progress: 0.45,
        message: 'Reading handwriting...',
        answer_id: entry?.answerId ?? null,
        error: null,
      };
    }
    mockJobs.delete(jobId);
    return {
      ...(JSON.parse(JSON.stringify(rawJobDoneMock)) as Job),
      job_id: jobId,
    };
  }
  const res = await apiClient.get<Job>(`/jobs/${jobId}`);
  return res.data;
}

export async function reviewAnswer(answerId: number, req: ReviewRequest): Promise<Answer> {
  if (isMockMode) {
    await delay(300);
    for (const student of Object.values(mockStudentDetails)) {
      const ans = student.answers.find((a) => a.answer_id === answerId);
      if (ans) {
        ans.final_marks = req.final_marks;
        ans.decision = req.decision;
        ans.needs_review = false;
        ans.review_reason = req.reason ?? null;
        student.total_marks = student.answers.reduce(
          (acc, a) => acc + (a.final_marks || 0),
          0
        );
        refreshMockAggregates();
        return JSON.parse(JSON.stringify(ans)) as Answer;
      }
    }
  }
  const res = await apiClient.patch<Answer>(`/answers/${answerId}`, req);
  return res.data;
}

export async function deleteAnswer(usn: string, qid: number): Promise<void> {
  if (isMockMode) {
    await delay(200);
    const student = mockStudentDetails[usn];
    if (student) {
      const ans = student.answers.find((a) => a.question_id === qid);
      if (ans) {
        ans.answer_id = null;
        ans.status = 'pending';
        ans.image_url = null;
        ans.transcript = null;
        ans.ocr_confidence = null;
        ans.key_points = ans.key_points.map((keyPoint) => ({
          ...keyPoint,
          covered: false,
          similarity: 0,
          borderline: false,
        }));
        ans.coverage = null;
        ans.covered_count = 0;
        ans.suggested_marks = null;
        ans.final_marks = null;
        ans.decision = null;
        ans.flags = [];
        ans.needs_review = false;
        ans.review_reason = null;
        ans.evaluated_at = null;
        refreshMockAggregates();
      }
    }
    return;
  }
  await apiClient.delete(`/students/${encodeURIComponent(usn)}/answers/${qid}`);
}
