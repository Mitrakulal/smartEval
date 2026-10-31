import { useMemo, useState } from 'react';
import Box from '@mui/material/Box';
import Typography from '@mui/material/Typography';
import Paper from '@mui/material/Paper';
import Button from '@mui/material/Button';
import Chip from '@mui/material/Chip';
import DownloadIcon from '@mui/icons-material/Download';
import { useNavigate } from 'react-router-dom';
import { useExam } from '../hooks/useExam.ts';
import { useMarksheet, useDownloadMarksheetCsv } from '../hooks/useMarksheet.ts';
import { useSnackbar } from '../hooks/useSnackbar.ts';
import { extractApiError } from '../api/client.ts';
import { StateBanner } from '../components/common/StateBanner.tsx';
import { LoadingState } from '../components/common/LoadingState.tsx';
import { ErrorState } from '../components/common/ErrorState.tsx';
import { EmptyState } from '../components/common/EmptyState.tsx';
import { MarksheetTable } from '../components/marksheet/MarksheetTable.tsx';

type RowFilter = 'all' | 'review' | 'incomplete';

const FILTERS: { key: RowFilter; label: string }[] = [
  { key: 'all', label: 'All' },
  { key: 'review', label: 'Needs review' },
  { key: 'incomplete', label: 'Incomplete' },
];

export function Marksheet() {
  const navigate = useNavigate();
  const { showSuccess, showError } = useSnackbar();
  const { data: exam } = useExam();
  const { data: sheet, isLoading, error, refetch } = useMarksheet();
  const exportMutation = useDownloadMarksheetCsv();
  const [filter, setFilter] = useState<RowFilter>('all');

  const filteredRows = useMemo(() => {
    if (!sheet) return [];
    if (filter === 'review') return sheet.rows.filter((row) => row.flags > 0);
    if (filter === 'incomplete') return sheet.rows.filter((row) => row.status !== 'complete');
    return sheet.rows;
  }, [sheet, filter]);

  const counts = useMemo(() => {
    const rows = sheet?.rows ?? [];
    return {
      all: rows.length,
      review: rows.filter((row) => row.flags > 0).length,
      incomplete: rows.filter((row) => row.status !== 'complete').length,
    };
  }, [sheet]);

  const handleExport = () => {
    exportMutation.mutate(undefined, {
      onSuccess: () => showSuccess('Marksheet CSV downloaded'),
      onError: (err: unknown) => showError(`Export failed: ${extractApiError(err).message}`),
    });
  };

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
  const hasRows = sheet.rows.length > 0;

  return (
    <Box>
      {exam && <StateBanner state={exam.state} />}

      <Paper variant="outlined" sx={{ p: 2.5, mb: 3 }}>
        <Box
          sx={{
            display: 'flex',
            alignItems: 'flex-start',
            justifyContent: 'space-between',
            flexWrap: 'wrap',
            gap: 2,
          }}
        >
          <Box>
            <Typography variant="h6" gutterBottom>
              {sheet.subject || 'Marksheet'}
            </Typography>
            <Typography variant="body2" color="text.secondary">
              {sheet.rows.length} {sheet.rows.length === 1 ? 'student' : 'students'} · Total{' '}
              {sheet.max_marks} marks · Class average {average}
            </Typography>
          </Box>
          <Button
            variant="outlined"
            startIcon={<DownloadIcon />}
            onClick={handleExport}
            disabled={!hasRows || exportMutation.isPending}
          >
            {exportMutation.isPending ? 'Exporting...' : 'Export CSV'}
          </Button>
        </Box>
      </Paper>

      {!hasRows ? (
        <EmptyState
          title="No students evaluated yet"
          description="Add a student on the Evaluate screen and upload their answer scripts. Totals appear here automatically."
          actionLabel="Go to Evaluate"
          onAction={() => navigate('/evaluate')}
        />
      ) : (
        <>
          <Box sx={{ display: 'flex', gap: 1, flexWrap: 'wrap', mb: 2 }}>
            {FILTERS.map((option) => (
              <Chip
                key={option.key}
                label={`${option.label} (${counts[option.key]})`}
                clickable
                color={filter === option.key ? 'primary' : 'default'}
                variant={filter === option.key ? 'filled' : 'outlined'}
                onClick={() => setFilter(option.key)}
              />
            ))}
          </Box>

          {filteredRows.length === 0 ? (
            <Paper variant="outlined" sx={{ p: 4, textAlign: 'center' }}>
              <Typography variant="body2" color="text.secondary">
                No students match this filter.
              </Typography>
            </Paper>
          ) : (
            <MarksheetTable sheet={sheet} rows={filteredRows} />
          )}
        </>
      )}
    </Box>
  );
}
