import { useMemo, useState } from 'react';
import Box from '@mui/material/Box';
import Typography from '@mui/material/Typography';
import Paper from '@mui/material/Paper';
import Button from '@mui/material/Button';
import Chip from '@mui/material/Chip';
import Grid from '@mui/material/Grid';
import DownloadIcon from '@mui/icons-material/Download';
import EmojiEventsRoundedIcon from '@mui/icons-material/EmojiEventsRounded';
import FlagRoundedIcon from '@mui/icons-material/FlagRounded';
import GroupsRoundedIcon from '@mui/icons-material/GroupsRounded';
import { useNavigate } from 'react-router-dom';
import { useExam } from '../hooks/useExam.ts';
import { useMarksheet, useApproveExam, useDownloadMarksheetCsv } from '../hooks/useMarksheet.ts';
import { useSnackbar } from '../hooks/useSnackbar.ts';
import { extractApiError } from '../api/client.ts';
import { StateBanner } from '../components/common/StateBanner.tsx';
import { LoadingState } from '../components/common/LoadingState.tsx';
import { ErrorState } from '../components/common/ErrorState.tsx';
import { EmptyState } from '../components/common/EmptyState.tsx';
import { ConfirmDialog } from '../components/common/ConfirmDialog.tsx';
import { MarksheetTable } from '../components/marksheet/MarksheetTable.tsx';
import { ApproveBar } from '../components/marksheet/ApproveBar.tsx';

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
  const approveMutation = useApproveExam();
  const [filter, setFilter] = useState<RowFilter>('all');
  const [isApproveOpen, setIsApproveOpen] = useState(false);

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

  const handleApprove = () => {
    approveMutation.mutate(undefined, {
      onSuccess: () => {
        setIsApproveOpen(false);
        showSuccess('Exam approved and locked');
      },
      onError: (err: unknown) => {
        const apiErr = extractApiError(err);
        if (apiErr.code === 'UNREVIEWED_ANSWERS') {
          const detail = apiErr.detail;
          const count =
            detail && typeof detail === 'object' && 'count' in detail
              ? Number((detail as { count: unknown }).count)
              : NaN;
          showError(
            Number.isFinite(count)
              ? `${count} ${count === 1 ? 'answer still needs' : 'answers still need'} review. Open Evaluate to review them.`
              : 'Some answers still need review. Open Evaluate to review them.'
          );
        } else {
          showError(`Approval failed: ${apiErr.message}`);
        }
      },
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

      <Paper
        sx={{
          p: { xs: 2.5, md: 3 },
          mb: 3,
          position: 'relative',
          overflow: 'hidden',
          color: '#fff',
          background: 'linear-gradient(120deg, #4E2BEA 0%, #6D4AFF 52%, #A78BFA 100%)',
          boxShadow: '0 22px 48px rgba(91, 61, 245, 0.26)',
        }}
      >
        <Box
          sx={{
            position: 'absolute',
            width: 230,
            height: 230,
            borderRadius: '50%',
            top: -110,
            right: -50,
            bgcolor: 'rgba(255,255,255,0.10)',
          }}
        />
        <Box
          sx={{
            position: 'absolute',
            width: 120,
            height: 120,
            borderRadius: '50%',
            border: '1px solid rgba(255,255,255,0.18)',
            bottom: -54,
            right: 150,
          }}
        />
        <Box
          sx={{
            position: 'relative',
            display: 'flex',
            alignItems: 'flex-start',
            justifyContent: 'space-between',
            flexWrap: 'wrap',
            gap: 2,
          }}
        >
          <Box>
            <Typography
              variant="overline"
              sx={{ color: 'rgba(255,255,255,0.72)', fontSize: '0.66rem' }}
            >
              Exam summary
            </Typography>
            <Typography variant="h4" sx={{ fontWeight: 800, letterSpacing: '-0.04em', mt: 0.2 }}>
              {sheet.subject || 'Marksheet'}
            </Typography>
            <Typography variant="body2" sx={{ color: 'rgba(255,255,255,0.78)', mt: 0.8 }}>
              {sheet.rows.length} {sheet.rows.length === 1 ? 'student' : 'students'} · Total{' '}
              {sheet.max_marks} marks · Class average {average}
            </Typography>
          </Box>
          <Button
            variant="contained"
            startIcon={<DownloadIcon />}
            onClick={handleExport}
            disabled={!hasRows || exportMutation.isPending}
            sx={{
              bgcolor: '#fff',
              color: '#5B3DF5',
              boxShadow: 'none',
              '&:hover': { bgcolor: '#F5F2FF', boxShadow: 'none' },
              '&.Mui-disabled': { bgcolor: 'rgba(255,255,255,0.35)', color: 'rgba(255,255,255,0.8)' },
            }}
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
          <Grid container spacing={2} sx={{ mb: 3 }}>
            <Grid size={{ xs: 12, sm: 4 }}>
              <Paper variant="outlined" sx={{ p: 2.25, height: '100%' }}>
                <Box sx={{ display: 'flex', alignItems: 'center', gap: 1.75 }}>
                  <Box
                    sx={{
                      width: 46,
                      height: 46,
                      borderRadius: 2.5,
                      display: 'grid',
                      placeItems: 'center',
                      bgcolor: 'rgba(108, 76, 241, 0.10)',
                      color: 'primary.main',
                      flexShrink: 0,
                    }}
                  >
                    <GroupsRoundedIcon />
                  </Box>
                  <Box sx={{ minWidth: 0 }}>
                    <Typography
                      variant="caption"
                      color="text.secondary"
                      sx={{ fontWeight: 700, textTransform: 'uppercase', letterSpacing: '0.06em' }}
                    >
                      Total evaluated
                    </Typography>
                    <Typography variant="h5" sx={{ fontWeight: 800, mt: 0.1, color: 'text.primary' }}>
                      {counts.all}
                    </Typography>
                    <Typography variant="caption" color="text.secondary">
                      {counts.incomplete > 0 ? `${counts.incomplete} incomplete` : 'All students submitted'}
                    </Typography>
                  </Box>
                </Box>
              </Paper>
            </Grid>
            <Grid size={{ xs: 12, sm: 4 }}>
              <Paper variant="outlined" sx={{ p: 2.25, height: '100%' }}>
                <Box sx={{ display: 'flex', alignItems: 'center', gap: 1.75 }}>
                  <Box
                    sx={{
                      width: 46,
                      height: 46,
                      borderRadius: 2.5,
                      display: 'grid',
                      placeItems: 'center',
                      bgcolor: 'rgba(34, 197, 94, 0.10)',
                      color: 'success.main',
                      flexShrink: 0,
                    }}
                  >
                    <EmojiEventsRoundedIcon />
                  </Box>
                  <Box sx={{ minWidth: 0 }}>
                    <Typography
                      variant="caption"
                      color="text.secondary"
                      sx={{ fontWeight: 700, textTransform: 'uppercase', letterSpacing: '0.06em' }}
                    >
                      Class average
                    </Typography>
                    <Typography variant="h5" sx={{ fontWeight: 800, mt: 0.1, color: 'primary.main' }}>
                      {average}{' '}
                      <Box
                        component="span"
                        sx={{ fontSize: '0.875rem', fontWeight: 600, color: 'text.secondary' }}
                      >
                        / {sheet.max_marks}
                      </Box>
                    </Typography>
                    <Typography variant="caption" color="text.secondary">
                      Across all graded questions
                    </Typography>
                  </Box>
                </Box>
              </Paper>
            </Grid>
            <Grid size={{ xs: 12, sm: 4 }}>
              <Paper variant="outlined" sx={{ p: 2.25, height: '100%' }}>
                <Box sx={{ display: 'flex', alignItems: 'center', gap: 1.75 }}>
                  <Box
                    sx={{
                      width: 46,
                      height: 46,
                      borderRadius: 2.5,
                      display: 'grid',
                      placeItems: 'center',
                      bgcolor:
                        counts.review > 0
                          ? 'rgba(245, 158, 11, 0.12)'
                          : 'rgba(34, 197, 94, 0.10)',
                      color: counts.review > 0 ? 'warning.main' : 'success.main',
                      flexShrink: 0,
                    }}
                  >
                    <FlagRoundedIcon />
                  </Box>
                  <Box sx={{ minWidth: 0 }}>
                    <Typography
                      variant="caption"
                      color="text.secondary"
                      sx={{ fontWeight: 700, textTransform: 'uppercase', letterSpacing: '0.06em' }}
                    >
                      Flagged answers
                    </Typography>
                    <Typography
                      variant="h5"
                      sx={{
                        fontWeight: 800,
                        mt: 0.1,
                        color: counts.review > 0 ? 'warning.main' : 'success.main',
                      }}
                    >
                      {counts.review}
                    </Typography>
                    <Typography variant="caption" color="text.secondary">
                      {counts.review > 0 ? 'Borderline or low confidence' : 'Zero flags pending review'}
                    </Typography>
                  </Box>
                </Box>
              </Paper>
            </Grid>
          </Grid>

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
            <MarksheetTable
              sheet={sheet}
              rows={filteredRows}
              onRowClick={(usn) => navigate(`/evaluate?usn=${encodeURIComponent(usn)}`)}
            />
          )}

          <ApproveBar
            examState={exam?.state}
            needsReviewCount={
              sheet.rows.filter((row) => row.flags > 0 && row.review_status === 'pending').length
            }
            isApproving={approveMutation.isPending}
            onApprove={() => setIsApproveOpen(true)}
          />
        </>
      )}

      <ConfirmDialog
        open={isApproveOpen}
        title="Approve and lock this exam?"
        message="Marks become read-only and no further answers can be edited. The CSV stays available. This cannot be undone."
        confirmText="Approve & lock"
        isLoading={approveMutation.isPending}
        onConfirm={handleApprove}
        onCancel={() => setIsApproveOpen(false)}
      />
    </Box>
  );
}
