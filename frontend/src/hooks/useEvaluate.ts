import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import type { ReviewRequest, StudentDetail, StudentSummary } from '../api/types.ts';
import {
  createStudent,
  deleteAnswer,
  fetchJob,
  fetchStudent,
  fetchStudents,
  reviewAnswer,
  uploadAnswer,
  type AnswerUploadRequest,
  type CreateStudentRequest,
} from '../api/evaluateClient.ts';

export const STUDENTS_QUERY_KEY = ['students'] as const;
export const studentQueryKey = (usn: string) => ['student', usn] as const;

export function useStudents(enabled = true) {
  return useQuery({ queryKey: STUDENTS_QUERY_KEY, queryFn: fetchStudents, enabled });
}

export function useStudent(usn: string | null) {
  return useQuery({
    queryKey: studentQueryKey(usn ?? ''),
    queryFn: () => fetchStudent(usn ?? ''),
    enabled: Boolean(usn),
    retry: false,
  });
}

export function useCreateStudent() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: ({ request, replace }: { request: CreateStudentRequest; replace?: boolean }) =>
      createStudent(request, replace),
    onSuccess: (student) => {
      queryClient.setQueryData<StudentSummary[]>(STUDENTS_QUERY_KEY, (current = []) => {
        const next = current.filter((item) => item.usn !== student.usn);
        return [...next, student];
      });
      void queryClient.invalidateQueries({ queryKey: STUDENTS_QUERY_KEY });
      void queryClient.invalidateQueries({ queryKey: studentQueryKey(student.usn) });
    },
  });
}

export function useUploadAnswer() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (request: AnswerUploadRequest) => uploadAnswer(request),
    onSuccess: (_result, request) => {
      void queryClient.invalidateQueries({ queryKey: studentQueryKey(request.usn) });
      void queryClient.invalidateQueries({ queryKey: STUDENTS_QUERY_KEY });
    },
  });
}

export function useJob(jobId: string | null) {
  return useQuery({
    queryKey: ['job', jobId],
    queryFn: () => fetchJob(jobId ?? ''),
    enabled: Boolean(jobId),
    refetchInterval: (query) => {
      const status = query.state.data?.status;
      return status === 'done' || status === 'error' ? false : 2000;
    },
  });
}

export function useDeleteAnswer() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: ({ usn, questionId }: { usn: string; questionId: number }) =>
      deleteAnswer(usn, questionId),
    onSuccess: (_result, variables) => {
      void queryClient.invalidateQueries({ queryKey: studentQueryKey(variables.usn) });
      void queryClient.invalidateQueries({ queryKey: STUDENTS_QUERY_KEY });
    },
  });
}

export function useReviewAnswer() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: ({ answerId, request }: { answerId: number; request: ReviewRequest; usn: string }) =>
      reviewAnswer(answerId, request),
    onSuccess: (answer, variables) => {
      const current = queryClient.getQueryData<StudentDetail>(studentQueryKey(variables.usn));
      if (current) {
        const answers = current.answers.map((item) => item.answer_id === answer.answer_id ? answer : item);
        const evaluated = answers.filter((item) => item.status === 'evaluated');
        queryClient.setQueryData<StudentDetail>(studentQueryKey(variables.usn), {
          ...current,
          answers,
          total_marks: evaluated.reduce((total, item) => total + (item.final_marks ?? item.suggested_marks ?? 0), 0),
        });
      }
      queryClient.setQueryData<StudentSummary[]>(STUDENTS_QUERY_KEY, (current) => current?.map((student) => {
        if (student.usn !== variables.usn) return student;
        const detail = queryClient.getQueryData<StudentDetail>(studentQueryKey(variables.usn));
        if (!detail) return student;
        const evaluated = detail?.answers.filter((item) => item.status === 'evaluated') ?? [];
        return {
          ...student,
          answered: evaluated.length,
          total: detail?.answers.length ?? student.total,
          flags: evaluated.reduce((count, item) => count + item.flags.length, 0),
          average: evaluated.length ? evaluated.reduce((total, item) => total + (item.final_marks ?? item.suggested_marks ?? 0), 0) / evaluated.length : null,
          status: evaluated.length === (detail?.answers.length ?? 0) ? 'complete' : evaluated.length ? 'in_progress' : 'not_started',
        };
      }));
      void queryClient.invalidateQueries({ queryKey: studentQueryKey(variables.usn) });
      void queryClient.invalidateQueries({ queryKey: STUDENTS_QUERY_KEY });
      void queryClient.invalidateQueries({ queryKey: ['marksheet'] });
    },
  });
}

