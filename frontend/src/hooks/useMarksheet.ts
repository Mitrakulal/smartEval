import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import type { Marksheet, ExamState } from '../api/types.ts';
import {
  fetchMarksheet,
  approveExam,
  fetchMarksheetCsvBlob,
} from '../api/client.ts';
import { EXAM_QUERY_KEY } from './useExam.ts';

export const MARKSHEET_QUERY_KEY = ['marksheet'] as const;

export function useMarksheet() {
  return useQuery<Marksheet, Error>({
    queryKey: MARKSHEET_QUERY_KEY,
    queryFn: fetchMarksheet,
    staleTime: 10000,
  });
}

export function useApproveExam() {
  const queryClient = useQueryClient();

  return useMutation<ExamState, Error, void>({
    mutationFn: () => approveExam(),
    onSuccess: (updatedExam) => {
      queryClient.setQueryData(EXAM_QUERY_KEY, updatedExam);
      void queryClient.invalidateQueries({ queryKey: EXAM_QUERY_KEY });
      void queryClient.invalidateQueries({ queryKey: MARKSHEET_QUERY_KEY });
    },
  });
}

export function useDownloadMarksheetCsv() {
  return useMutation<void, Error, void>({
    mutationFn: async () => {
      const blob = await fetchMarksheetCsvBlob();
      const url = window.URL.createObjectURL(blob);
      const link = document.createElement('a');
      link.href = url;
      link.setAttribute('download', 'marksheet.csv');
      document.body.appendChild(link);
      link.click();
      link.remove();
      window.URL.revokeObjectURL(url);
    },
  });
}
