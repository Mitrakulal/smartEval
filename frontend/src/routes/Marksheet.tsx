import Box from '@mui/material/Box';
import Typography from '@mui/material/Typography';
import Paper from '@mui/material/Paper';
import { useNavigate } from 'react-router-dom';
import { useExam } from '../hooks/useExam.ts';
import { useMarksheet } from '../hooks/useMarksheet.ts';
import { StateBanner } from '../components/common/StateBanner.tsx';
import { LoadingState } from '../components/common/LoadingState.tsx';
import { ErrorState } from '../components/common/ErrorState.tsx';
import { EmptyState } from '../components/common/EmptyState.tsx';
import { MarksheetTable } from '../components/marksheet/MarksheetTable.tsx';

export function Marksheet() {
  const navigate = useNavigate();
  const { data: exam } = useExam();
  const { data: sheet, isLoading, error, refetch } = useMarksheet();

  if (isLoading) {
    return <LoadingState message="Loading marksheet..." />;
  }

  if (error || !sheet) {
    return (
      <ErrorState
        title="Failed to load marksheet"
        message={error instanceof Error ? error.message : 'Unknown error'}
        onRetry={() => void refetch()}
      />
    );
  }

  const average = sheet.class_average === null ? '—' : sheet.class_average.toFixed(1);

  return (
    <Box>
      {exam && <StateBanner state={exam.state} />}

      <Paper variant="outlined" sx={{ p: 2.5, mb: 3 }}>
        <Typography variant="h6" gutterBottom>
          {sheet.subject || 'Marksheet'}
        </Typography>
        <Typography variant="body2" color="text.secondary">
          {sheet.rows.length} {sheet.rows.length === 1 ? 'student' : 'students'} · Total{' '}
          {sheet.max_marks} marks · Class average {average}
        </Typography>
      </Paper>

      {sheet.rows.length === 0 ? (
        <EmptyState
          title="No students evaluated yet"
          description="Add a student on the Evaluate screen and upload their answer scripts. Totals appear here automatically."
          actionLabel="Go to Evaluate"
          onAction={() => navigate('/evaluate')}
        />
      ) : (
        <MarksheetTable sheet={sheet} rows={sheet.rows} />
      )}
    </Box>
  );
}
