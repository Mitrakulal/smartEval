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
};
let mockFileBlob: Blob | null = new Blob(['Dummy PDF key content'], { type: 'application/pdf' });

function delay(ms = 250): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
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
    const csvContent =
      'USN,Name,Q1,Q2,Q3,Total,Max,Flags,Review_Status\n' +
      '4SF22CS001,Asha Rao,3.5,5.0,2.5,11.0,15,2,pending\n' +
      '4SF22CS002,Ravi Kumar,4.5,3.0,,7.5,15,1,pending\n';
    return new Blob([csvContent], { type: 'text/csv;charset=utf-8;' });
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
      total: mockExamState.questions.length || 3,
      average: null,
      flags: 0,
      status: 'not_started',
    };
    mockStudents.push(newStudent);
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
    const qList = mockExamState.questions.length > 0 ? mockExamState.questions : [
      { question_id: 1, number: '1', text: "Explain Dijkstra's algorithm.", max_marks: 5 },
      { question_id: 2, number: '2', text: 'Differentiate TCP and UDP.', max_marks: 5 },
      { question_id: 3, number: '3', text: 'What is subnet masking?', max_marks: 5 },
    ];
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
        key_points: [],
        coverage: null,
        covered_count: 0,
        key_point_count: 0,
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
    // Simulate background evaluation completing
    setTimeout(() => {
      const student = mockStudentDetails[usn];
      if (student) {
        const ans = student.answers.find((a) => a.question_id === qid);
        if (ans) {
          ans.answer_id = Date.now();
          ans.status = 'evaluated';
          ans.image_url = URL.createObjectURL(file);
          ans.transcript = 'Student handwritten response extracted by TrOCR engine for evaluation.';
          ans.ocr_confidence = 0.88;
          ans.key_points = [
            { id: 1, text: 'Expected answer concept key point 1', covered: true, similarity: 0.82, borderline: false },
            { id: 2, text: 'Expected answer concept key point 2', covered: true, similarity: 0.74, borderline: false },
          ];
          ans.coverage = 0.8;
          ans.covered_count = 2;
          ans.key_point_count = 2;
          ans.suggested_marks = ans.max_marks * 0.8;
          ans.final_marks = ans.suggested_marks;
          ans.decision = 'pending';
          ans.needs_review = false;
          ans.evaluated_at = new Date().toISOString();
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
    return JSON.parse(JSON.stringify(rawJobDoneMock)) as Job;
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
        student.total_marks = student.answers.reduce((acc, a) => acc + (a.final_marks || 0), 0);
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
        ans.status = 'pending';
        ans.image_url = null;
        ans.transcript = null;
        ans.ocr_confidence = null;
        ans.key_points = [];
        ans.suggested_marks = null;
        ans.final_marks = null;
        ans.decision = null;
      }
    }
    return;
  }
  await apiClient.delete(`/students/${encodeURIComponent(usn)}/answers/${qid}`);
}
