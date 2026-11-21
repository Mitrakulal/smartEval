import { useState } from 'react';
import Box from '@mui/material/Box';
import Paper from '@mui/material/Paper';
import Typography from '@mui/material/Typography';
import Button from '@mui/material/Button';
import Chip from '@mui/material/Chip';
import CheckIcon from '@mui/icons-material/Check';
import SaveIcon from '@mui/icons-material/Save';
import { MarkInput } from '../MarkInput.tsx';
import type { Answer } from '../../api/types.ts';

interface ReviewBarProps {
  answer: Answer;
  isSaving: boolean;
  onReview: (marks: number, decision: 'accepted' | 'overridden') => void;
}

export function ReviewBar({ answer, isSaving, onReview }: ReviewBarProps) {
  const [currentMark, setCurrentMark] = useState<number | ''>(
    answer.final_marks !== null ? answer.final_marks : answer.suggested_marks ?? ''
  );

  const suggestedMarks = answer.suggested_marks ?? 0;
  const isAccepted = answer.decision === 'accepted';
  const isOverridden = answer.decision === 'overridden';

  const handleAccept = () => {
    if (answer.suggested_marks !== null) {
      onReview(answer.suggested_marks, 'accepted');
    }
  };

  const handleOverride = () => {
    if (typeof currentMark === 'number') {
      onReview(currentMark, 'overridden');
    }
  };

  return (
    <Paper
      elevation={2}
      sx={{
        mt: 2.5,
        p: 2,
        borderRadius: 2,
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'space-between',
        flexWrap: 'wrap',
        gap: 2,
        bgcolor: 'background.paper',
        border: '1px solid',
        borderColor: 'divider',
      }}
    >
      <Box sx={{ display: 'flex', alignItems: 'center', gap: 2 }}>
        <Typography variant="subtitle2" sx={{ fontWeight: 700 }}>
          Lecturer Evaluation & Final Mark:
        </Typography>

        <Box sx={{ display: 'flex', alignItems: 'center', gap: 1 }}>
          <MarkInput
            value={currentMark}
            maxMarks={answer.max_marks}
            disabled={isSaving}
            onChange={(val) => setCurrentMark(val)}
          />
          <Typography variant="body2" sx={{ fontWeight: 600, color: 'text.secondary' }}>
            / {answer.max_marks} marks
          </Typography>
        </Box>

        {answer.decision && (
          <Chip
            size="small"
            label={isAccepted ? 'Accepted AI Suggestion' : isOverridden ? 'Manual Override' : 'Pending Review'}
            color={isAccepted ? 'success' : isOverridden ? 'info' : 'warning'}
            variant="outlined"
            sx={{ fontWeight: 600 }}
          />
        )}
      </Box>

      <Box sx={{ display: 'flex', alignItems: 'center', gap: 1.5 }}>
        {answer.suggested_marks !== null && (
          <Button
            variant="outlined"
            color="success"
            startIcon={<CheckIcon />}
            onClick={handleAccept}
            disabled={isSaving || (isAccepted && answer.final_marks === suggestedMarks)}
          >
            Accept AI ({suggestedMarks}m)
          </Button>
        )}

        <Button
          variant="contained"
          color="primary"
          startIcon={<SaveIcon />}
          onClick={handleOverride}
          disabled={isSaving || currentMark === '' || (isOverridden && answer.final_marks === currentMark)}
        >
          {isSaving ? 'Saving...' : 'Save Final Mark'}
        </Button>
      </Box>
    </Paper>
  );
}
