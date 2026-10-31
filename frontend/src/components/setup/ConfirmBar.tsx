import Box from '@mui/material/Box';
import Paper from '@mui/material/Paper';
import Button from '@mui/material/Button';
import CircularProgress from '@mui/material/CircularProgress';
import Typography from '@mui/material/Typography';
import CheckCircleIcon from '@mui/icons-material/CheckCircle';

interface ConfirmBarProps {
  isValid: boolean;
  isLoading: boolean;
  questionCount: number;
  totalMarks: number;
  onConfirm: () => void;
  onReset?: () => void;
  showReset?: boolean;
}

export function ConfirmBar({
  isValid,
  isLoading,
  questionCount,
  totalMarks,
  onConfirm,
  onReset,
  showReset = false,
}: ConfirmBarProps) {
  return (
    <Paper
      elevation={4}
      sx={{
        position: 'sticky',
        bottom: 16,
        zIndex: 10,
        p: 2,
        mt: 4,
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
        <Typography variant="body2" sx={{ fontWeight: 600 }}>
          {questionCount} {questionCount === 1 ? 'Question' : 'Questions'} · Total: {totalMarks} Marks
        </Typography>
        {!isValid && (
          <Typography variant="caption" color="error.main" sx={{ fontWeight: 500 }}>
            Resolve validation errors above to confirm
          </Typography>
        )}
      </Box>

      <Box sx={{ display: 'flex', alignItems: 'center', gap: 1.5 }}>
        {showReset && onReset && (
          <Button variant="outlined" color="error" size="medium" onClick={onReset} disabled={isLoading}>
            Reset Exam
          </Button>
        )}
        <Button
          variant="contained"
          color="primary"
          size="medium"
          startIcon={isLoading ? <CircularProgress size={18} color="inherit" /> : <CheckCircleIcon />}
          disabled={!isValid || isLoading}
          onClick={onConfirm}
        >
          {isLoading ? 'Confirming...' : 'Confirm & Start Evaluating'}
        </Button>
      </Box>
    </Paper>
  );
}
