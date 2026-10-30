import Alert from '@mui/material/Alert';
import AlertTitle from '@mui/material/AlertTitle';
import Box from '@mui/material/Box';
import type { DraftQuestion } from '../../api/types.ts';
import { validateQuestions } from './validateQuestions.ts';

interface ValidationSummaryProps {
  questions: DraftQuestion[];
}

export function ValidationSummary({ questions }: ValidationSummaryProps) {
  const errors = validateQuestions(questions);

  if (errors.length === 0) return null;

  return (
    <Box sx={{ mb: 3 }}>
      <Alert severity="error" variant="outlined">
        <AlertTitle>Please resolve the following issues to confirm:</AlertTitle>
        <ul style={{ margin: 0, paddingLeft: 20 }}>
          {errors.map((err, idx) => (
            <li key={idx}>{err}</li>
          ))}
        </ul>
      </Alert>
    </Box>
  );
}
