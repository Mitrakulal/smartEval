import Box from '@mui/material/Box';
import Typography from '@mui/material/Typography';
import Paper from '@mui/material/Paper';
import { useExam } from '../hooks/useExam.ts';
import { StateBanner } from '../components/common/StateBanner.tsx';
import { LoadingState } from '../components/common/LoadingState.tsx';
import { ErrorState } from '../components/common/ErrorState.tsx';

export function Marksheet() {
  const { data: exam, isLoading, error, refetch } = useExam();

  if (isLoading) {
    return <LoadingState message="Loading exam marksheet..." />;
  }

  if (error || !exam) {
    return (
      <ErrorState
        title="Failed to load marksheet"
        message={error instanceof Error ? error.message : 'Unknown error'}
        onRetry={() => void refetch()}
      />
    );
  }

  return (
    <Box>
      <StateBanner state={exam.state} />
      <Paper sx={{ p: 3, mb: 3 }}>
        <Typography variant="h6" gutterBottom>
          Marksheet: {exam.subject}
        </Typography>
        <Typography variant="body2" color="text.secondary">
          Marksheet screen foundation initialized. Complete table, filter chips, totals, and CSV export will be active in Phase 4.
        </Typography>
      </Paper>
    </Box>
  );
}
