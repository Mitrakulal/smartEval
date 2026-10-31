import axios, { AxiosError } from 'axios';
import type {
  ExamState,
  KeyDraft,
  ConfirmKeyRequest,
  SettingsRequest,
  Marksheet,
  ApiErrorBody,
} from './types.ts';

import rawExamMock from './mocks/exam.json';
import rawKeyDraftMock from './mocks/key_draft.json';
import rawMarksheetMock from './mocks/marksheet.json';

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
