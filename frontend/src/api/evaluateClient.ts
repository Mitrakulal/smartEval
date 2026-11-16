import axios from 'axios';
import type {
  Answer,
  ApiErrorBody,
  Job,
  ReviewRequest,
  StudentDetail,
  StudentSummary,
  UploadResponse,
} from './types.ts';
import { ApiError, apiClient, isMockMode } from './client.ts';
import rawStudents from './mocks/students.json';
import rawStudent from './mocks/student.json';
import rawJob from './mocks/job_done.json';

const copy = <T,>(value: T): T => JSON.parse(JSON.stringify(value)) as T;
let mockStudents = copy(rawStudents) as StudentSummary[];
const mockStudentDetails = new Map<string, StudentDetail>();
for (const [index, student] of mockStudents.entries()) {
  const detail = copy(rawStudent) as StudentDetail;
  const answers = index === 0 ? detail.answers : detail.answers.map((answer) => ({
    ...answer,
    answer_id: answer.answer_id === null ? null : answer.answer_id + index * 100,
    image_url: answer.answer_id === null ? null : `/api/answers/${answer.answer_id + index * 100}/image`,
  }));
  mockStudentDetails.set(student.usn, { ...detail, usn: student.usn, name: student.name, answers });
}
let nextMockJobId = 1;
let nextMockAnswerId = 500;
const mockJobTargets = new Map<string, { usn: string; questionId: number }>();
const mockImageUrls = new Map<number, string>();

function refreshMockStudent(usn: string): void {
  const detail = mockStudentDetails.get(usn);
  if (!detail) return;
  const evaluated = detail.answers.filter((answer) => answer.status === 'evaluated');
  const summary = mockStudents.find((student) => student.usn === usn);
  if (!summary) return;
  summary.answered = evaluated.length;
  summary.total = detail.answers.length;
  summary.flags = evaluated.reduce((count, answer) => count + answer.flags.length, 0);
  summary.average = evaluated.length
    ? evaluated.reduce((total, answer) => total + (answer.final_marks ?? answer.suggested_marks ?? 0), 0) / evaluated.length
    : null;
  summary.status = evaluated.length === detail.answers.length ? 'complete' : evaluated.length ? 'in_progress' : 'not_started';
  detail.total_marks = evaluated.reduce((total, answer) => total + (answer.final_marks ?? answer.suggested_marks ?? 0), 0);
}

const wait = (ms = 250) => new Promise<void>((resolve) => setTimeout(resolve, ms));

export interface CreateStudentRequest {
  usn: string;
  name?: string;
}

export interface AnswerUploadRequest {
  usn: string;
  questionId: number;
  file: File;
  onProgress?: (progress: number) => void;
}

export async function fetchStudents(): Promise<StudentSummary[]> {
  if (isMockMode) {
    await wait();
    return copy(mockStudents);
  }
  const response = await apiClient.get<StudentSummary[]>('/students');
  return response.data;
}

export async function fetchStudent(usn: string): Promise<StudentDetail> {
  if (isMockMode) {
    await wait();
    const student = mockStudentDetails.get(usn);
    if (!student) throw new Error(`Student ${usn} was not found.`);
    return copy(student);
  }
  const response = await apiClient.get<StudentDetail>(`/students/${encodeURIComponent(usn)}`);
  return response.data;
}

export async function createStudent(
  request: CreateStudentRequest,
  replace = false
): Promise<StudentSummary> {
  if (isMockMode) {
    await wait();
    const existing = mockStudents.find((student) => student.usn === request.usn);
    if (existing && !replace) {
      throw new ApiError(`Student ${request.usn} already exists`, 'DUPLICATE_USN', null, 409);
    }
    if (replace) {
      const previous = mockStudentDetails.get(request.usn);
      previous?.answers.forEach((answer) => {
        if (answer.answer_id !== null) {
          const imageUrl = mockImageUrls.get(answer.answer_id);
          if (imageUrl) URL.revokeObjectURL(imageUrl);
          mockImageUrls.delete(answer.answer_id);
        }
      });
    }
    const summary: StudentSummary = {
      usn: request.usn,
      name: request.name?.trim() || '',
      answered: 0,
      total: 3,
      average: null,
      flags: 0,
      status: 'not_started',
    };
    mockStudents = replace
      ? [...mockStudents.filter((student) => student.usn !== request.usn), summary]
      : [...mockStudents, summary];
    const base = copy(rawStudent) as StudentDetail;
    mockStudentDetails.set(request.usn, {
      ...base,
      usn: request.usn,
      name: summary.name,
      total_marks: 0,
      answers: base.answers.map((answer) => ({
        ...answer,
        answer_id: nextMockAnswerId++,
        status: 'pending',
        image_url: null,
        transcript: null,
        ocr_confidence: null,
        coverage: null,
        covered_count: 0,
        suggested_marks: null,
        final_marks: null,
        decision: null,
        flags: [],
        needs_review: false,
        evaluated_at: null,
      })),
    });
    return copy(summary);
  }
  const response = await apiClient.post<StudentSummary>(
    `/students${replace ? '?replace=true' : ''}`,
    request
  );
  return response.data;
}

export async function uploadAnswer({ usn, questionId, file, onProgress }: AnswerUploadRequest): Promise<UploadResponse> {
  if (isMockMode) {
    for (const progress of [12, 35, 64, 88, 100]) {
      await wait(120);
      onProgress?.(progress);
    }
    const detail = mockStudentDetails.get(usn);
    if (!detail) throw new ApiError(`Student ${usn} was not found`, 'NOT_FOUND', null, 404);
    const target = detail.answers.find((answer) => answer.question_id === questionId);
    if (!target) {
      throw new ApiError(`Question ${questionId} was not found`, 'NOT_FOUND', null, 404);
    }
    if (target.answer_id !== null) {
      const previousImage = mockImageUrls.get(target.answer_id);
      if (previousImage) URL.revokeObjectURL(previousImage);
      const imageUrl = URL.createObjectURL(file);
      mockImageUrls.set(target.answer_id, imageUrl);
      target.image_url = imageUrl;
    }
    target.status = 'processing';
    const jobId = `mock_job_${nextMockJobId++}`;
    mockJobTargets.set(jobId, { usn, questionId });
    return { job_id: jobId };
  }
  const formData = new FormData();
  formData.append('file', file);
  const response = await apiClient.post<UploadResponse>(
    `/students/${encodeURIComponent(usn)}/answers/${questionId}`,
    formData,
    {
      headers: { 'Content-Type': 'multipart/form-data' },
      onUploadProgress: (event) => {
        if (event.total) onProgress?.(Math.round((event.loaded / event.total) * 100));
      },
    }
  );
  return response.data;
}

export async function fetchJob(jobId: string): Promise<Job> {
  if (isMockMode) {
    await wait(400);
    const target = mockJobTargets.get(jobId);
    if (target) {
      const detail = mockStudentDetails.get(target.usn);
      const template = (copy(rawStudent) as StudentDetail).answers.find((answer) => answer.question_id === target.questionId);
      if (detail && template) {
        detail.answers = detail.answers.map((answer) => answer.question_id === target.questionId
          ? { ...template, answer_id: answer.answer_id ?? nextMockAnswerId++, question_id: target.questionId, question_number: answer.question_number, question_text: answer.question_text, max_marks: answer.max_marks, image_url: answer.answer_id === null ? null : mockImageUrls.get(answer.answer_id) ?? answer.image_url }
          : answer);
        refreshMockStudent(target.usn);
      }
      mockJobTargets.delete(jobId);
    }
    return { ...(copy(rawJob) as Job), job_id: jobId };
  }
  const response = await apiClient.get<Job>(`/jobs/${encodeURIComponent(jobId)}`);
  return response.data;
}

export async function deleteAnswer(usn: string, questionId: number): Promise<void> {
  if (isMockMode) {
    await wait();
    const detail = mockStudentDetails.get(usn);
    if (detail) {
      detail.answers = detail.answers.map((answer) => {
        if (answer.question_id !== questionId) return answer;
        if (answer.answer_id !== null) {
          const imageUrl = mockImageUrls.get(answer.answer_id);
          if (imageUrl) URL.revokeObjectURL(imageUrl);
          mockImageUrls.delete(answer.answer_id);
        }
        return { ...answer, status: 'pending', image_url: null, transcript: null, final_marks: null };
      });
    }
    return;
  }
  await apiClient.delete(`/students/${encodeURIComponent(usn)}/answers/${questionId}`);
}

export async function reviewAnswer(answerId: number, request: ReviewRequest): Promise<Answer> {
  if (isMockMode) {
    await wait();
    for (const [usn, detail] of mockStudentDetails) {
      const answer = detail.answers.find((item) => item.answer_id === answerId);
      if (answer) {
        Object.assign(answer, {
          final_marks: request.final_marks,
          decision: request.decision,
          review_reason: request.reason ?? null,
          needs_review: false,
        });
        refreshMockStudent(usn);
        return copy(answer);
      }
    }
    throw new Error('Answer was not found.');
  }
  const response = await apiClient.patch<Answer>(`/answers/${answerId}`, request);
  return response.data;
}

export function getApiErrorCode(error: unknown): string | undefined {
  if (error instanceof ApiError) return error.code;
  if (axios.isAxiosError<ApiErrorBody>(error)) {
    return error.response?.data?.error?.code;
  }
  return undefined;
}

export function getApiErrorMessage(error: unknown): string {
  if (axios.isAxiosError<ApiErrorBody>(error)) {
    return error.response?.data?.error?.message ?? error.message;
  }
  return error instanceof Error ? error.message : 'An unexpected error occurred.';
}
