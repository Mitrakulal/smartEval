import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import type {
  ExamState,
  KeyDraft,
  ConfirmKeyRequest,
  SettingsRequest,
} from '../api/types.ts';
import {
  fetchExamState,
  parseKeyFile,
  confirmExamKey,
  updateExamSettings,
  resetExam,
  fetchKeyFile,
} from '../api/client.ts';

export const EXAM_QUERY_KEY = ['exam'] as const;
export const KEY_FILE_QUERY_KEY = ['keyFile'] as const;

export function useExam() {
  return useQuery<ExamState, Error>({
    queryKey: EXAM_QUERY_KEY,
    queryFn: fetchExamState,
    staleTime: 30000,
  });
}

export function useKeyFile(enabled = true) {
  return useQuery<Blob, Error>({
    queryKey: KEY_FILE_QUERY_KEY,
    queryFn: fetchKeyFile,
    enabled,
    staleTime: 60000,
  });
}

export function useParseKey() {
  const queryClient = useQueryClient();

  return useMutation<KeyDraft, Error, File>({
    mutationFn: (file: File) => parseKeyFile(file),
    onSuccess: () => {
      void queryClient.invalidateQueries({ queryKey: EXAM_QUERY_KEY });
      void queryClient.invalidateQueries({ queryKey: KEY_FILE_QUERY_KEY });
    },
  });
}

export function useConfirmKey() {
  const queryClient = useQueryClient();

  return useMutation<ExamState, Error, ConfirmKeyRequest>({
    mutationFn: (req: ConfirmKeyRequest) => confirmExamKey(req),
    onSuccess: (updatedState) => {
      queryClient.setQueryData(EXAM_QUERY_KEY, updatedState);
      void queryClient.invalidateQueries({ queryKey: EXAM_QUERY_KEY });
    },
  });
}

export function useSettings() {
  const queryClient = useQueryClient();

  return useMutation<ExamState, Error, SettingsRequest>({
    mutationFn: (req: SettingsRequest) => updateExamSettings(req),
    onSuccess: (updatedState) => {
      queryClient.setQueryData(EXAM_QUERY_KEY, updatedState);
    },
  });
}

export function useResetExam() {
  const queryClient = useQueryClient();

  return useMutation<ExamState, Error, void>({
    mutationFn: () => resetExam(),
    onSuccess: (updatedState) => {
      queryClient.setQueryData(EXAM_QUERY_KEY, updatedState);
      void queryClient.invalidateQueries({ queryKey: EXAM_QUERY_KEY });
      void queryClient.invalidateQueries({ queryKey: KEY_FILE_QUERY_KEY });
      void queryClient.invalidateQueries({ queryKey: ['marksheet'] });
    },
  });
}
