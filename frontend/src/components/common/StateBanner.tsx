import Alert from '@mui/material/Alert';
import AlertTitle from '@mui/material/AlertTitle';
import Box from '@mui/material/Box';
import type { ExamStateName } from '../../api/types.ts';

interface StateBannerProps {
  state: ExamStateName;
  onResetClick?: () => void;
}

export function StateBanner({ state }: StateBannerProps) {
  switch (state) {
    case 'NO_KEY':
      return (
        <Box sx={{ mb: 3 }}>
          <Alert severity="info" variant="outlined">
            <AlertTitle>No Answer Key Uploaded</AlertTitle>
            Upload a born-digital PDF or DOCX answer key to begin configuring questions.
          </Alert>
        </Box>
      );

    case 'KEY_PARSED':
      return (
        <Box sx={{ mb: 3 }}>
          <Alert severity="warning" variant="outlined">
            <AlertTitle>Answer Key Draft Pending Confirmation</AlertTitle>
            Review and adjust the parsed questions and key points below. Changes are not saved until confirmed.
          </Alert>
        </Box>
      );

    case 'READY':
      return (
        <Box sx={{ mb: 3 }}>
          <Alert severity="success" variant="outlined">
            <AlertTitle>Exam Ready & Active</AlertTitle>
            The answer key is confirmed. Student answer scripts can now be evaluated on the Evaluate page.
          </Alert>
        </Box>
      );

    case 'FINAL':
      return (
        <Box sx={{ mb: 3 }}>
          <Alert severity="info" variant="filled">
            <AlertTitle>Exam Approved & Locked (FINAL)</AlertTitle>
            This exam has been locked. All student marks and questions are read-only. CSV marksheet export remains available.
          </Alert>
        </Box>
      );

    default:
      return null;
  }
}
