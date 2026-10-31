import { useState, useMemo } from 'react';
import Box from '@mui/material/Box';
import Typography from '@mui/material/Typography';
import Paper from '@mui/material/Paper';
import Grid from '@mui/material/Grid';
import TextField from '@mui/material/TextField';
import Button from '@mui/material/Button';
import ArrowForwardIcon from '@mui/icons-material/ArrowForward';
import RestartAltIcon from '@mui/icons-material/RestartAlt';
import { useNavigate } from 'react-router-dom';

import {
  useExam,
  useKeyFile,
  useParseKey,
  useConfirmKey,
  useSettings,
  useResetExam,
} from '../hooks/useExam.ts';
import { useSnackbar } from '../hooks/useSnackbar.ts';
import { extractApiError } from '../api/client.ts';
import { StateBanner } from '../components/common/StateBanner.tsx';
import { LoadingState } from '../components/common/LoadingState.tsx';
import { ErrorState } from '../components/common/ErrorState.tsx';
import { ConfirmDialog } from '../components/common/ConfirmDialog.tsx';
import { FileDropzone } from '../components/setup/FileDropzone.tsx';
import { PdfPreview } from '../components/setup/PdfPreview.tsx';
import { QuestionList } from '../components/setup/QuestionList.tsx';
import { WarningsList } from '../components/setup/WarningsList.tsx';
import { SliderField } from '../components/setup/SliderField.tsx';
import { ValidationSummary } from '../components/setup/ValidationSummary.tsx';
import { validateQuestions } from '../components/setup/validateQuestions.ts';
import { ConfirmBar } from '../components/setup/ConfirmBar.tsx';

import type {
  DraftQuestion,
  ConfirmQuestion,
  ConfirmKeyRequest,
} from '../api/types.ts';

interface SliderSettings {
  pointThreshold: number;
  borderlineBand: number;
}

export function Setup() {
  const navigate = useNavigate();
  const { showSuccess, showError } = useSnackbar();

  const { data: exam, isLoading: isExamLoading, error: examError, refetch: refetchExam } = useExam();
  const { data: keyFileBlob, isLoading: isKeyFileLoading } = useKeyFile(
    exam?.state === 'READY' || exam?.state === 'KEY_PARSED' || exam?.state === 'FINAL'
  );

  const parseKeyMutation = useParseKey();
  const confirmKeyMutation = useConfirmKey();
  const settingsMutation = useSettings();
  const resetExamMutation = useResetExam();

  // Local state for draft editing
  const [draftId, setDraftId] = useState<string | null>(null);
  const [draftFilename, setDraftFilename] = useState<string>('');
  const [localDraftQuestions, setLocalDraftQuestions] = useState<DraftQuestion[] | null>(null);
  const [parseWarnings, setParseWarnings] = useState<string[]>([]);
  const [localUploadedFile, setLocalUploadedFile] = useState<File | null>(null);

  // Settings local overrides
  const [localSubject, setLocalSubject] = useState<string | null>(null);
  const [localPointThreshold, setLocalPointThreshold] = useState<number | null>(null);
  const [localBorderlineBand, setLocalBorderlineBand] = useState<number | null>(null);

  // UI state
  const [isResetDialogOpen, setIsResetDialogOpen] = useState<boolean>(false);
  const [isManualEntryMode, setIsManualEntryMode] = useState<boolean>(false);

  // Derive active settings
  const subjectInput = localSubject ?? exam?.subject ?? 'Computer Networks';
  const pointThreshold = localPointThreshold ?? exam?.point_threshold ?? 0.55;
  const borderlineBand = localBorderlineBand ?? exam?.borderline_band ?? 0.1;

  // Derive questions: if in READY/FINAL and user hasn't uploaded a new draft, derive from exam.questions
  const questions: DraftQuestion[] = useMemo(() => {
    if (localDraftQuestions !== null) {
      return localDraftQuestions;
    }
    if (exam && (exam.state === 'READY' || exam.state === 'FINAL') && exam.questions.length > 0) {
      return exam.questions.map((q) => ({
        number: q.number,
        text: q.text,
        max_marks: q.max_marks,
        grading_mode: q.grading_mode,
        key_points: q.key_points.map((kp) => ({
          text: kp.text,
          confidence: 'parsed' as const,
        })),
        confidence: { text: 'parsed' as const, max_marks: 'parsed' as const },
      }));
    }
    return [];
  }, [localDraftQuestions, exam]);

  // Handle file drop & upload
  const handleFileSelect = async (file: File) => {
    setLocalUploadedFile(file);
    setDraftFilename(file.name);
    setIsManualEntryMode(false);

    try {
      const draft = await parseKeyMutation.mutateAsync(file);
      setDraftId(draft.draft_id);
      setLocalDraftQuestions(draft.questions);
      setParseWarnings(draft.warnings || []);
      showSuccess(`Parsed ${draft.questions.length} questions from ${file.name}`);
    } catch (err: unknown) {
      const apiErr = extractApiError(err);
      showError(`Parse failed: ${apiErr.message}`);
      // Fallback manual entry per FRONTEND.md: "we couldn't read this document, enter questions below"
      setIsManualEntryMode(true);
      setLocalDraftQuestions([
        {
          number: 1,
          text: '',
          max_marks: 5,
          grading_mode: 'semantic',
          key_points: [{ text: '', confidence: 'parsed' }],
          confidence: { text: 'missing', max_marks: 'missing' },
        },
      ]);
    }
  };

  // Slider drags only update the display; the PATCH waits for onChangeCommitted.
  const handleSliderChange = ({
    pointThreshold: newThresh,
    borderlineBand: newBand,
  }: SliderSettings) => {
    setLocalPointThreshold(newThresh);
    setLocalBorderlineBand(newBand);
  };

  const handleSliderCommit = ({
    pointThreshold: newThresh,
    borderlineBand: newBand,
  }: SliderSettings) => {
    setLocalPointThreshold(newThresh);
    setLocalBorderlineBand(newBand);

    if (!exam || exam.state === 'FINAL') return;

    settingsMutation.mutate(
      {
        point_threshold: newThresh,
        borderline_band: newBand,
      },
      {
        onError: (err: unknown) => {
          showError(`Could not save thresholds: ${extractApiError(err).message}`);
        },
      }
    );
  };

  const handleSubjectBlur = () => {
    if (exam && subjectInput.trim() !== '' && subjectInput !== exam.subject) {
      settingsMutation.mutate(
        { subject: subjectInput.trim() },
        {
          onSuccess: () => showSuccess('Subject name updated'),
        }
      );
    }
  };

  // Handle key confirmation
  const handleConfirm = async () => {
    const validationErrors = validateQuestions(questions);
    if (validationErrors.length > 0) {
      showError('Please resolve all validation errors before confirming.');
      return;
    }

    const confirmQuestions: ConfirmQuestion[] = questions.map((q) => ({
      number: q.number,
      text: q.text.trim(),
      max_marks: q.max_marks,
      grading_mode: q.grading_mode,
      key_points: q.key_points.map((kp) => ({ text: kp.text.trim() })),
    }));

    const req: ConfirmKeyRequest = {
      draft_id: draftId,
      questions: confirmQuestions,
    };

    try {
      await confirmKeyMutation.mutateAsync(req);
      showSuccess('Answer key confirmed. Exam is now READY for evaluation!');
    } catch (err: unknown) {
      const apiErr = extractApiError(err);
      showError(`Confirmation failed: ${apiErr.message}`);
    }
  };

  // Handle reset
  const handleResetConfirm = async () => {
    try {
      await resetExamMutation.mutateAsync();
      setLocalDraftQuestions([]);
      setDraftFilename('');
      setLocalUploadedFile(null);
      setParseWarnings([]);
      setIsManualEntryMode(false);
      setLocalSubject(null);
      setLocalPointThreshold(null);
      setLocalBorderlineBand(null);
      setIsResetDialogOpen(false);
      showSuccess('Exam reset successfully. All data cleared.');
    } catch (err: unknown) {
      const apiErr = extractApiError(err);
      showError(`Reset failed: ${apiErr.message}`);
    }
  };

  if (isExamLoading) {
    return <LoadingState message="Loading exam setup..." />;
  }

  if (examError || !exam) {
    return (
      <ErrorState
        title="Failed to load exam state"
        message={examError instanceof Error ? examError.message : 'Unknown error'}
        onRetry={() => void refetchExam()}
      />
    );
  }

  const currentState = exam.state;
  const isFinal = currentState === 'FINAL';
  const isReady = currentState === 'READY';
  const isParsed = currentState === 'KEY_PARSED' || questions.length > 0;
  const isNoKey = currentState === 'NO_KEY' && questions.length === 0;

  const validationErrors = validateQuestions(questions);
  const isDraftValid = validationErrors.length === 0;
  const totalMarks = questions.reduce((sum, q) => sum + (q.max_marks || 0), 0);

  return (
    <Box sx={{ pb: 6 }}>
      {/* State Banner */}
      <StateBanner state={currentState} />

      {/* Header & Subject Setting */}
      <Paper variant="outlined" sx={{ p: 2.5, mb: 3 }}>
        <Box sx={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', flexWrap: 'wrap', gap: 2 }}>
          <Box sx={{ flexGrow: 1, maxWidth: 450 }}>
            <TextField
              label="Subject / Exam Name"
              variant="outlined"
              size="small"
              fullWidth
              value={subjectInput}
              disabled={isFinal}
              onChange={(e) => setLocalSubject(e.target.value)}
              onBlur={handleSubjectBlur}
              helperText="Press Tab or click away to save changes"
            />
          </Box>

          <Box sx={{ display: 'flex', gap: 1.5 }}>
            {isReady && (
              <>
                <Button
                  variant="outlined"
                  color="error"
                  startIcon={<RestartAltIcon />}
                  onClick={() => setIsResetDialogOpen(true)}
                >
                  Reset Exam
                </Button>
                <Button
                  variant="contained"
                  color="primary"
                  endIcon={<ArrowForwardIcon />}
                  onClick={() => navigate('/evaluate')}
                >
                  Start Evaluating
                </Button>
              </>
            )}
          </Box>
        </Box>
      </Paper>

      {/* Threshold Sliders */}
      <SliderField
        pointThreshold={pointThreshold}
        borderlineBand={borderlineBand}
        disabled={isFinal}
        onChange={handleSliderChange}
        onCommit={handleSliderCommit}
      />

      {/* Dropzone: Shown in NO_KEY or when user is replacing draft */}
      {(isNoKey || (currentState === 'KEY_PARSED' && questions.length === 0)) && (
        <FileDropzone
          onFileSelect={handleFileSelect}
          isLoading={parseKeyMutation.isPending}
          disabled={isFinal}
        />
      )}

      {/* Parse failed notice */}
      {isManualEntryMode && (
        <Box sx={{ mb: 3 }}>
          <Paper sx={{ p: 2, bgcolor: 'warning.light', color: 'warning.contrastText' }}>
            <Typography variant="subtitle2" sx={{ fontWeight: 600 }}>
              Could not parse the uploaded document automatically.
            </Typography>
            <Typography variant="body2">
              You can manually enter and configure the questions and key points below.
            </Typography>
          </Paper>
        </Box>
      )}

      {/* Parser Warnings */}
      <WarningsList warnings={parseWarnings} />

      {/* Two-Pane Layout when questions exist (KEY_PARSED / READY / FINAL) */}
      {isParsed && (
        <Grid container spacing={3}>
          {/* Left Pane: PDF / Document Preview */}
          <Grid size={{ xs: 12, md: 5 }}>
            <PdfPreview
              fileBlob={localUploadedFile || keyFileBlob}
              filename={draftFilename || exam.key_filename}
              isLoading={isKeyFileLoading && !localUploadedFile}
            />
          </Grid>

          {/* Right Pane: Editable or Read-Only Question List */}
          <Grid size={{ xs: 12, md: 7 }}>
            <QuestionList
              questions={questions}
              disabled={isReady || isFinal}
              showConfidence={!isReady && !isFinal}
              onChange={setLocalDraftQuestions}
            />
          </Grid>
        </Grid>
      )}

      {/* Validation Summary and Confirm Bar in KEY_PARSED / Editing state */}
      {!isReady && !isFinal && isParsed && (
        <>
          <Box sx={{ mt: 3 }}>
            <ValidationSummary questions={questions} />
          </Box>
          <ConfirmBar
            isValid={isDraftValid}
            isLoading={confirmKeyMutation.isPending}
            questionCount={questions.length}
            totalMarks={totalMarks}
            onConfirm={handleConfirm}
            onReset={() => setIsResetDialogOpen(true)}
            showReset={currentState === 'KEY_PARSED'}
          />
        </>
      )}

      {/* Reset Confirmation Dialog */}
      <ConfirmDialog
        open={isResetDialogOpen}
        title="Reset Exam?"
        message="Resetting the exam will delete all parsed questions, uploaded keys, and student answers. This action cannot be undone."
        confirmText="Reset Exam"
        isDestructive
        isLoading={resetExamMutation.isPending}
        onConfirm={handleResetConfirm}
        onCancel={() => setIsResetDialogOpen(false)}
      />
    </Box>
  );
}
