import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import {
  fetchStudents,
  createStudent,
  fetchStudentDetail,
  uploadAnswerPhoto,
  reviewAnswer,
  deleteAnswer,
  fetchJob,
} from '../api/client.ts';
import type { ReviewRequest } from '../api/types.ts';

export function useStudents() {
  return useQuery({
    queryKey: ['students'],
    queryFn: fetchStudents,
  });
}

export function useStudentDetail(usn: string | null) {
  return useQuery({
    queryKey: ['student', usn],
    queryFn: () => (usn ? fetchStudentDetail(usn) : Promise.reject('No USN provided')),
    enabled: Boolean(usn),
  });
}

export function useCreateStudent() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: createStudent,
    onSuccess: () => {
      void queryClient.invalidateQueries({ queryKey: ['students'] });
      void queryClient.invalidateQueries({ queryKey: ['marksheet'] });
    },
  });
}

export function useUploadAnswer(usn: string, qid: number) {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (file: File) => uploadAnswerPhoto(usn, qid, file),
    onSuccess: () => {
      void queryClient.invalidateQueries({ queryKey: ['student', usn] });
      void queryClient.invalidateQueries({ queryKey: ['students'] });
      void queryClient.invalidateQueries({ queryKey: ['marksheet'] });
    },
  });
}

export function useReviewAnswer(usn: string) {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: ({ answerId, req }: { answerId: number; req: ReviewRequest }) =>
      reviewAnswer(answerId, req),
    onSuccess: () => {
      void queryClient.invalidateQueries({ queryKey: ['student', usn] });
      void queryClient.invalidateQueries({ queryKey: ['students'] });
      void queryClient.invalidateQueries({ queryKey: ['marksheet'] });
    },
  });
}

export function useDeleteAnswer(usn: string) {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (qid: number) => deleteAnswer(usn, qid),
    onSuccess: () => {
      void queryClient.invalidateQueries({ queryKey: ['student', usn] });
      void queryClient.invalidateQueries({ queryKey: ['students'] });
      void queryClient.invalidateQueries({ queryKey: ['marksheet'] });
    },
  });
}

export function useJobPoll(jobId: string | null) {
  return useQuery({
    queryKey: ['job', jobId],
    queryFn: () => (jobId ? fetchJob(jobId) : Promise.reject('No Job ID')),
    enabled: Boolean(jobId),
    refetchInterval: (query) => {
      const data = query.state.data;
      if (data && (data.status === 'done' || data.status === 'error')) {
        return false;
      }
      return 1500;
    },
  });
}
