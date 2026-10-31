import Box from '@mui/material/Box';
import Paper from '@mui/material/Paper';
import Button from '@mui/material/Button';
import Typography from '@mui/material/Typography';
import Chip from '@mui/material/Chip';
import LockIcon from '@mui/icons-material/Lock';
import type { ExamStateName } from '../../api/types.ts';

interface ApproveBarProps {
  examState?: ExamStateName;
  needsReviewCount: number;
  isApproving: boolean;
  onApprove: () => void;
}

export function ApproveBar({
  examState,
  needsReviewCount,
  isApproving,
  onApprove,
}: ApproveBarProps) {
  const isFinal = examState === 'FINAL';
  const canApprove = examState === 'READY' && !isApproving;

  return (
    <Paper
      variant="outlined"
      sx={{
        mt: 3,
        p: 2,
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'space-between',
        flexWrap: 'wrap',
        gap: 2,
      }}
    >
      <Box>
        <Typography variant="subtitle2" gutterBottom>
          {isFinal ? 'Exam approved and locked' : 'Approve the marksheet'}
        </Typography>
        <Typography variant="body2" color="text.secondary">
          {isFinal
            ? 'Marks are read-only. CSV export remains available.'
            : needsReviewCount > 0
            ? `${needsReviewCount} ${needsReviewCount === 1 ? 'answer needs' : 'answers need'} review before approval.`
            : 'All answers have been reviewed.'}
        </Typography>
      </Box>

      {isFinal ? (
        <Chip icon={<LockIcon />} label="Approved" color="primary" variant="filled" />
      ) : (
        <Button
          variant="contained"
          startIcon={<LockIcon />}
          onClick={onApprove}
          disabled={!canApprove}
        >
          {isApproving ? 'Approving...' : 'Approve & lock'}
        </Button>
      )}
    </Paper>
  );
}
