import { useEffect, useMemo, useRef, useState } from 'react';
import Alert from '@mui/material/Alert';
import Box from '@mui/material/Box';
import Grid from '@mui/material/Grid';
import Paper from '@mui/material/Paper';
import Stack from '@mui/material/Stack';
import Typography from '@mui/material/Typography';
import { useQueryClient } from '@tanstack/react-query';
import { useSearchParams } from 'react-router-dom';
import { EmptyState } from '../components/common/EmptyState.tsx';
import { ErrorState } from '../components/common/ErrorState.tsx';
import { LoadingState } from '../components/common/LoadingState.tsx';
import { StateBanner } from '../components/common/StateBanner.tsx';
import { JobProgress } from '../components/evaluate/JobProgress.tsx';
import { PhotoCapture } from '../components/evaluate/PhotoCapture.tsx';
import { QuestionNav } from '../components/evaluate/QuestionNav.tsx';
import { ResultPanel } from '../components/evaluate/ResultPanel.tsx';
import { StudentList } from '../components/evaluate/StudentList.tsx';
import { StudentLookup } from '../components/evaluate/StudentLookup.tsx';
import { extractApiError } from '../api/client.ts';
import { getApiErrorCode, getApiErrorMessage } from '../api/evaluateClient.ts';
import type { Answer, ReviewRequest, StudentSummary } from '../api/types.ts';
import { useExam } from '../hooks/useExam.ts';
import { STUDENTS_QUERY_KEY, studentQueryKey, useCreateStudent, useDeleteAnswer, useJob, useReviewAnswer, useStudent, useStudents, useUploadAnswer } from '../hooks/useEvaluate.ts';
import { useSnackbar } from '../hooks/useSnackbar.ts';

interface ActiveJob { id: string; usn: string; questionId: number }

export function Evaluate() {
  const [searchParams, setSearchParams] = useSearchParams();
  const queryClient = useQueryClient();
  const { showError, showSuccess } = useSnackbar();
  const { data: exam, isLoading: examLoading, error: examError, refetch: refetchExam } = useExam();
  const canEvaluate = exam?.state === 'READY' || exam?.state === 'FINAL';
  const { data: students = [], isLoading: studentsLoading, error: studentsError, refetch: refetchStudents } = useStudents(canEvaluate);
  const [selectedUsn, setSelectedUsn] = useState<string | null>(searchParams.get('usn'));
  const [activeQuestionId, setActiveQuestionId] = useState<number | null>(null);
  const [isLookupOpen, setIsLookupOpen] = useState(false);
  const [activeJob, setActiveJob] = useState<ActiveJob | null>(null);
  const [uploadProgress, setUploadProgress] = useState(0);
  const [uploadError, setUploadError] = useState<string | null>(null);
  const handledJob = useRef<string | null>(null);
  const createStudentMutation = useCreateStudent();
  const uploadMutation = useUploadAnswer();
  const deleteMutation = useDeleteAnswer();
  const reviewMutation = useReviewAnswer();
  const studentQuery = useStudent(canEvaluate ? selectedUsn : null);
  const jobQuery = useJob(activeJob?.id ?? null);

  useEffect(() => {
    const fromUrl = searchParams.get('usn');
    if (fromUrl !== selectedUsn) setSelectedUsn(fromUrl);
  }, [searchParams, selectedUsn]);

  useEffect(() => {
    if (selectedUsn && students.length && !students.some((student) => student.usn === selectedUsn)) {
      setSelectedUsn(null);
      setSearchParams({}, { replace: true });
    }
  }, [selectedUsn, students, setSearchParams]);

  const selectStudent = (usn: string) => {
    setSelectedUsn(usn);
    setSearchParams({ usn }, { replace: true });
  };

  const answers = studentQuery.data?.answers ?? [];
  useEffect(() => {
    if (!answers.length) { setActiveQuestionId(null); return; }
    if (!answers.some((answer) => answer.question_id === activeQuestionId)) setActiveQuestionId(answers[0].question_id);
  }, [answers, activeQuestionId]);

  useEffect(() => {
    if (!activeJob || !jobQuery.data || handledJob.current === activeJob.id) return;
    if (jobQuery.data.status === 'done') {
      handledJob.current = activeJob.id;
      void queryClient.invalidateQueries({ queryKey: studentQueryKey(activeJob.usn) });
      void queryClient.invalidateQueries({ queryKey: STUDENTS_QUERY_KEY });
      showSuccess('Answer evaluation completed');
    } else if (jobQuery.data.status === 'error') {
      handledJob.current = activeJob.id;
      void queryClient.invalidateQueries({ queryKey: studentQueryKey(activeJob.usn) });
      void queryClient.invalidateQueries({ queryKey: STUDENTS_QUERY_KEY });
    }
  }, [activeJob, jobQuery.data, queryClient, showSuccess]);

  const activeAnswer: Answer | undefined = answers.find((answer) => answer.question_id === activeQuestionId);
  const currentJob = activeJob && activeJob.usn === selectedUsn && activeJob.questionId === activeQuestionId ? jobQuery.data : undefined;
  const uploadingThisAnswer = Boolean(activeJob && activeJob.usn === selectedUsn && activeJob.questionId === activeQuestionId && (jobQuery.isLoading || (currentJob && ['queued', 'running'].includes(currentJob.status))));
  const navItems = useMemo(() => answers.length ? answers.map((answer) => ({
    questionId: answer.question_id,
    number: String(answer.question_number),
    status: activeJob?.usn === selectedUsn && activeJob.questionId === answer.question_id && jobQuery.data?.status === 'error' ? 'error' as const :
      activeJob?.usn === selectedUsn && activeJob.questionId === answer.question_id && uploadingThisAnswer ? 'processing' as const : answer.status,
    isReviewed: answer.decision === 'accepted' || answer.decision === 'overridden',
  })) : (exam?.questions ?? []).map((question) => ({ questionId: question.question_id, number: String(question.number), status: 'pending' as const, isReviewed: false })), [answers, activeJob, selectedUsn, currentJob, jobQuery.data, uploadingThisAnswer, exam?.questions]);

  const handleUpload = async (file: File) => {
    if (!selectedUsn || !activeAnswer) return;
    setUploadError(null); setUploadProgress(0);
    try {
      const result = await uploadMutation.mutateAsync({ usn: selectedUsn, questionId: activeAnswer.question_id, file, onProgress: setUploadProgress });
      setActiveJob({ id: result.job_id, usn: selectedUsn, questionId: activeAnswer.question_id });
      handledJob.current = null;
    } catch (error: unknown) {
      const apiError = extractApiError(error);
      setUploadError(apiError.code === 'NETWORK_ERROR' ? `Network lost while uploading: ${apiError.message}` : `Upload failed: ${apiError.message}`);
    }
  };

  const handleRetake = async () => {
    if (!selectedUsn || !activeAnswer) return;
    try {
      if (activeAnswer.answer_id !== null && activeAnswer.status !== 'pending') {
        await deleteMutation.mutateAsync({ usn: selectedUsn, questionId: activeAnswer.question_id });
      }
      if (activeJob?.usn === selectedUsn && activeJob.questionId === activeAnswer.question_id) setActiveJob(null);
      setUploadError(null);
      setUploadProgress(0);
    } catch (error: unknown) {
      showError(`Could not reset answer for retake: ${getApiErrorMessage(error)}`);
    }
  };

  const createStudent = async (usn: string, name: string, replace: boolean) => {
    try {
      return await createStudentMutation.mutateAsync({ request: { usn, ...(name ? { name } : {}) }, replace });
    } catch (error: unknown) {
      if (getApiErrorCode(error) === 'DUPLICATE_USN') throw error;
      throw new Error(getApiErrorMessage(error));
    }
  };

  const submitReview = async (decision: ReviewRequest['decision'], marks: number, reason?: string) => {
    if (!activeAnswer?.answer_id || !selectedUsn) return;
    const boundedMarks = Math.min(activeAnswer.max_marks, Math.max(0, Math.round(marks * 2) / 2));
    try {
      await reviewMutation.mutateAsync({
        answerId: activeAnswer.answer_id,
        usn: selectedUsn,
        request: { final_marks: boundedMarks, decision, ...(reason ? { reason } : {}) },
      });
      showSuccess(decision === 'accepted' ? 'Suggested marks accepted' : 'Override saved');
    } catch (error: unknown) {
      const apiError = extractApiError(error);
      showError(apiError.code === 'NETWORK_ERROR' ? `Network lost while saving review: ${apiError.message}` : `Could not save review: ${apiError.message}`);
    }
  };

  if (examLoading || (canEvaluate && studentsLoading)) return <LoadingState message="Loading evaluation workspace…" />;
  if (examError) return <ErrorState title="Could not load exam" message={examError.message} onRetry={() => { void refetchExam(); }} />;
  if (!exam) return <ErrorState title="Exam data unavailable" message="No exam information was returned." onRetry={() => { void refetchExam(); }} />;
  if (canEvaluate && studentsError) return <ErrorState title="Could not load students" message={studentsError.message} onRetry={() => { void refetchStudents(); }} />;

  return <Stack spacing={2.5}>
    <StateBanner state={exam.state} />
    {exam.state === 'NO_KEY' || exam.state === 'KEY_PARSED' ? null : <>
      <Grid container spacing={2} alignItems="flex-start">
        <Grid size={{ xs: 12, md: 3 }}><StudentList students={students} selectedUsn={selectedUsn} canAdd={exam.state !== 'FINAL'} onSelect={selectStudent} onAdd={() => setIsLookupOpen(true)} /></Grid>
        <Grid size={{ xs: 12, md: 9 }}>
          {selectedUsn && studentQuery.isLoading ? <LoadingState message={`Loading ${selectedUsn}…`} /> :
            selectedUsn && studentQuery.error ? <ErrorState title="Could not load student" message={studentQuery.error.message} onRetry={() => { void studentQuery.refetch(); }} /> :
              selectedUsn && studentQuery.data ? <Stack spacing={2}>
                <Paper variant="outlined" sx={{ p: 2, display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 2, flexWrap: 'wrap' }}>
                  <Box><Typography variant="h6">{studentQuery.data.name || studentQuery.data.usn}</Typography><Typography variant="body2" color="text.secondary">{studentQuery.data.usn} · {studentQuery.data.total_marks.toFixed(1)} / {studentQuery.data.max_marks} marks</Typography></Box>
                  <Typography variant="caption" color="text.secondary">{answers.filter((answer) => answer.status === 'evaluated').length} of {answers.length} answers evaluated</Typography>
                </Paper>
                {activeJob?.usn === selectedUsn && activeJob.questionId !== activeQuestionId && jobQuery.data?.status !== 'done' && <JobProgress job={jobQuery.data} isLoading={jobQuery.isLoading} error={jobQuery.error ? `Network lost while checking evaluation progress: ${jobQuery.error.message}` : undefined} />}
                {answers.length === 0 ? <EmptyState title="No questions available" description="Confirm the answer key before evaluating answers." /> : <>
                  <QuestionNav items={navItems} activeQuestionId={activeQuestionId} onSelect={setActiveQuestionId} />
                  {activeAnswer && <>
                    <Paper variant="outlined" sx={{ p: 2 }}><Typography variant="subtitle1">Question {String(activeAnswer.question_number)}</Typography><Typography variant="body2" color="text.secondary">{activeAnswer.question_text} · Max {activeAnswer.max_marks} marks</Typography></Paper>
                    {exam.state !== 'FINAL' && <PhotoCapture key={`${selectedUsn}-${activeAnswer.question_id}`} disabled={uploadingThisAnswer || deleteMutation.isPending} hasExistingAnswer={activeAnswer.status !== 'pending'} isUploading={Boolean(uploadMutation.isPending && uploadMutation.variables?.questionId === activeAnswer.question_id)} progress={uploadProgress} error={uploadError} onUpload={(file) => void handleUpload(file)} onRetake={() => void handleRetake()} />}
                    {uploadingThisAnswer && <JobProgress job={currentJob} isLoading={jobQuery.isLoading} error={jobQuery.error ? `Network lost while checking evaluation progress: ${jobQuery.error.message}` : undefined} />}
                    {currentJob?.status === 'error' && <JobProgress job={currentJob} isLoading={false} />}
                    {activeAnswer.status === 'error' && !currentJob && <Alert severity="error">Answer extraction failed. Upload a clearer image to retry.</Alert>}
                    {activeAnswer.status === 'evaluated' && <ResultPanel answer={activeAnswer} disabled={exam.state === 'FINAL'} isSaving={reviewMutation.isPending} onAccept={(marks) => void submitReview('accepted', marks)} onOverride={(marks, reason) => void submitReview('overridden', marks, reason)} />}
                  </>}
                </>}
              </Stack> : <Stack spacing={2}><QuestionNav items={navItems} activeQuestionId={activeQuestionId} onSelect={setActiveQuestionId} /><EmptyState title="Select a student" description="Choose a student to review their answers, or add a student to begin." actionLabel="Add student" onAction={() => setIsLookupOpen(true)} /></Stack>}
        </Grid>
      </Grid>
    </>}
    <StudentLookup open={isLookupOpen} isSaving={createStudentMutation.isPending} onClose={() => setIsLookupOpen(false)} onCreate={createStudent} onCreated={(student: StudentSummary) => selectStudent(student.usn)} />
  </Stack>;
}
