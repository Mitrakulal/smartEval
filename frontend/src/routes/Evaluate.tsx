import { useState, useMemo } from 'react';
import { useSearchParams, useNavigate } from 'react-router-dom';
import Box from '@mui/material/Box';
import Typography from '@mui/material/Typography';
import Paper from '@mui/material/Paper';
import Grid from '@mui/material/Grid';
import Button from '@mui/material/Button';
import Chip from '@mui/material/Chip';
import ArrowBackIcon from '@mui/icons-material/ArrowBack';

import {
  useStudents,
  useStudentDetail,
  useCreateStudent,
  useUploadAnswer,
  useReviewAnswer,
  useDeleteAnswer,
} from '../hooks/useStudents.ts';
import { useSnackbar } from '../hooks/useSnackbar.ts';
import { extractApiError } from '../api/client.ts';
import { LoadingState } from '../components/common/LoadingState.tsx';
import { ErrorState } from '../components/common/ErrorState.tsx';
import { StudentList } from '../components/evaluate/StudentList.tsx';
import { QuestionTabs } from '../components/evaluate/QuestionTabs.tsx';
import { ImageCapture } from '../components/evaluate/ImageCapture.tsx';
import { TranscriptViewer } from '../components/evaluate/TranscriptViewer.tsx';
import { ScoreBreakdown } from '../components/evaluate/ScoreBreakdown.tsx';
import { ReviewBar } from '../components/evaluate/ReviewBar.tsx';

export function Evaluate() {
  const [searchParams, setSearchParams] = useSearchParams();
  const navigate = useNavigate();
  const { showSuccess, showError } = useSnackbar();

  const { data: students = [], isLoading: isStudentsLoading, error: studentsError } = useStudents();
  const createStudentMutation = useCreateStudent();

  const paramUsn = searchParams.get('usn');
  const activeUsn = paramUsn || (students.length > 0 ? students[0].usn : null);

  const {
    data: studentDetail,
    isLoading: isDetailLoading,
    error: detailError,
  } = useStudentDetail(activeUsn);

  const [selectedQidOverride, setSelectedQidOverride] = useState<number | null>(null);

  const selectedQid = useMemo(() => {
    if (!studentDetail || studentDetail.answers.length === 0) return null;
    if (
      selectedQidOverride !== null &&
      studentDetail.answers.some((a) => a.question_id === selectedQidOverride)
    ) {
      return selectedQidOverride;
    }
    return studentDetail.answers[0].question_id;
  }, [studentDetail, selectedQidOverride]);

  const activeAnswer = useMemo(() => {
    if (!studentDetail || selectedQid === null) return null;
    return studentDetail.answers.find((a) => a.question_id === selectedQid) || null;
  }, [studentDetail, selectedQid]);

  const uploadMutation = useUploadAnswer(activeUsn || '', selectedQid || 0);
  const reviewMutation = useReviewAnswer(activeUsn || '');
  const deleteMutation = useDeleteAnswer(activeUsn || '');

  const handleSelectStudent = (usn: string) => {
    setSelectedQidOverride(null);
    setSearchParams({ usn });
  };

  const handleCreateStudent = (data: { usn: string; name: string }) => {
    createStudentMutation.mutate(data, {
      onSuccess: (newStudent) => {
        showSuccess(`Student ${newStudent.usn} created successfully!`);
        setSelectedQidOverride(null);
        setSearchParams({ usn: newStudent.usn });
      },
      onError: (err: unknown) => {
        const apiErr = extractApiError(err);
        showError(`Failed to add student: ${apiErr.message}`);
      },
    });
  };

  const handleUploadPhoto = (file: File) => {
    uploadMutation.mutate(file, {
      onSuccess: () => {
        showSuccess(`Answer script uploaded for Q${activeAnswer?.question_number}`);
      },
      onError: (err: unknown) => {
        const apiErr = extractApiError(err);
        showError(`Upload failed: ${apiErr.message}`);
      },
    });
  };

  const handleReview = (marks: number, decision: 'accepted' | 'overridden') => {
    if (!activeAnswer || activeAnswer.answer_id === null) return;
    reviewMutation.mutate(
      {
        answerId: activeAnswer.answer_id,
        req: { final_marks: marks, decision },
      },
      {
        onSuccess: () => {
          showSuccess(`Saved score: ${marks}m for Q${activeAnswer.question_number}`);
        },
        onError: (err: unknown) => {
          const apiErr = extractApiError(err);
          showError(`Review save failed: ${apiErr.message}`);
        },
      }
    );
  };

  const handleDeleteAnswer = () => {
    if (!selectedQid) return;
    deleteMutation.mutate(selectedQid, {
      onSuccess: () => {
        showSuccess(`Cleared answer script for Q${activeAnswer?.question_number}`);
      },
      onError: (err: unknown) => {
        const apiErr = extractApiError(err);
        showError(`Failed to delete answer: ${apiErr.message}`);
      },
    });
  };

  if (isStudentsLoading) {
    return <LoadingState message="Loading evaluation environment..." />;
  }

  if (studentsError) {
    return (
      <ErrorState
        title="Failed to load students"
        message={studentsError instanceof Error ? studentsError.message : 'Unknown error'}
      />
    );
  }

  return (
    <Box sx={{ pb: 6 }}>
      {/* Top Banner / Student Navigation */}
      {studentDetail && (
        <Paper variant="outlined" sx={{ p: 2, mb: 3, borderRadius: 2 }}>
          <Box sx={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', flexWrap: 'wrap', gap: 2 }}>
            <Box sx={{ display: 'flex', alignItems: 'center', gap: 2 }}>
              <Button
                variant="outlined"
                size="small"
                startIcon={<ArrowBackIcon />}
                onClick={() => navigate('/marksheet')}
              >
                Marksheet
              </Button>
              <Box>
                <Typography variant="h6" sx={{ fontWeight: 700, lineHeight: 1.2 }}>
                  {studentDetail.usn} — {studentDetail.name}
                </Typography>
                <Typography variant="caption" color="text.secondary">
                  Total Awarded:{' '}
                  <strong>
                    {studentDetail.total_marks} / {studentDetail.max_marks} marks
                  </strong>
                </Typography>
              </Box>
            </Box>

            <Box sx={{ display: 'flex', alignItems: 'center', gap: 1 }}>
              <Chip
                label={`${studentDetail.answers.filter((a) => a.status === 'evaluated').length} / ${
                  studentDetail.answers.length
                } Evaluated`}
                color="primary"
                variant="outlined"
                size="small"
                sx={{ fontWeight: 600 }}
              />
            </Box>
          </Box>
        </Paper>
      )}

      {/* Main Layout Grid */}
      <Grid container spacing={3}>
        {/* Left Column: Student Sidebar */}
        <Grid size={{ xs: 12, md: 3 }}>
          <StudentList
            students={students}
            selectedUsn={activeUsn}
            onSelectStudent={handleSelectStudent}
            onCreateStudent={handleCreateStudent}
            isCreating={createStudentMutation.isPending}
          />
        </Grid>

        {/* Right Column: Question Tabs & 3-Column Evaluation Panel */}
        <Grid size={{ xs: 12, md: 9 }}>
          {isDetailLoading ? (
            <LoadingState message="Loading student answer book..." />
          ) : detailError || !studentDetail ? (
            <Paper variant="outlined" sx={{ p: 4, textAlign: 'center' }}>
              <Typography variant="body1" color="text.secondary">
                Select a student on the left or add a new USN to begin evaluation.
              </Typography>
            </Paper>
          ) : (
            <Box>
              {/* Question Selector Tabs */}
              <QuestionTabs
                answers={studentDetail.answers}
                selectedQid={selectedQid || studentDetail.answers[0]?.question_id || 1}
                onSelectQuestion={(qid) => setSelectedQidOverride(qid)}
              />

              {activeAnswer && (
                <>
                  {/* Question Prompt */}
                  <Paper variant="outlined" sx={{ p: 2, mb: 2.5, borderRadius: 2, bgcolor: 'background.paper' }}>
                    <Box sx={{ display: 'flex', alignItems: 'baseline', gap: 1 }}>
                      <Typography variant="subtitle2" sx={{ fontWeight: 700, color: 'primary.main' }}>
                        Question {activeAnswer.question_number} ({activeAnswer.max_marks} Marks):
                      </Typography>
                      <Typography variant="body2" sx={{ fontWeight: 500, color: 'text.primary' }}>
                        {activeAnswer.question_text}
                      </Typography>
                    </Box>
                  </Paper>

                  {/* 3-Column Result Panel */}
                  <Grid container spacing={2}>
                    {/* Column 1: Photograph / Script */}
                    <Grid size={{ xs: 12, lg: 4 }}>
                      <ImageCapture
                        imageUrl={activeAnswer.image_url}
                        isLoading={uploadMutation.isPending}
                        onUpload={handleUploadPhoto}
                        onDelete={handleDeleteAnswer}
                      />
                    </Grid>

                    {/* Column 2: OCR Transcript */}
                    <Grid size={{ xs: 12, lg: 4 }}>
                      <TranscriptViewer
                        transcript={activeAnswer.transcript}
                        confidence={activeAnswer.ocr_confidence}
                        flags={activeAnswer.flags}
                        isLoading={uploadMutation.isPending}
                      />
                    </Grid>

                    {/* Column 3: Semantic Score Breakdown */}
                    <Grid size={{ xs: 12, lg: 4 }}>
                      <ScoreBreakdown
                        keyPoints={activeAnswer.key_points}
                        coverage={activeAnswer.coverage}
                        coveredCount={activeAnswer.covered_count}
                        totalPoints={activeAnswer.key_point_count}
                        suggestedMarks={activeAnswer.suggested_marks}
                        maxMarks={activeAnswer.max_marks}
                        flags={activeAnswer.flags}
                        isLoading={uploadMutation.isPending}
                      />
                    </Grid>
                  </Grid>

                  {/* Lecturer Review Bar */}
                  {activeAnswer.status === 'evaluated' && (
                    <ReviewBar
                      key={`${activeAnswer.question_id}_${activeAnswer.answer_id ?? 'new'}`}
                      answer={activeAnswer}
                      isSaving={reviewMutation.isPending}
                      onReview={handleReview}
                    />
                  )}
                </>
              )}
            </Box>
          )}
        </Grid>
      </Grid>
    </Box>
  );
}
