import Alert from '@mui/material/Alert';
import Box from '@mui/material/Box';
import LinearProgress from '@mui/material/LinearProgress';
import Typography from '@mui/material/Typography';
import type { Job } from '../../api/types.ts';

interface Props { job?: Job; isLoading: boolean; error?: string }

export function JobProgress({ job, isLoading, error }: Props) {
  if (error) return <Alert severity="error">{error}</Alert>;
  if (!job && !isLoading) return null;
  if (!job) return <LinearProgress />;
  if (job.status === 'error') return <Alert severity="error">{job.error?.message || job.message || 'Evaluation failed. Retake or upload the answer again.'}</Alert>;
  return <Box sx={{ p: 2, border: 1, borderColor: 'divider', borderRadius: 1, bgcolor: 'background.paper' }}>
    <Box sx={{ display: 'flex', justifyContent: 'space-between', mb: 0.75 }}><Typography variant="body2" fontWeight={600}>{job.status === 'done' ? 'Evaluation complete' : 'Evaluating answer'}</Typography><Typography variant="caption" color="text.secondary">{Math.round(job.progress * 100)}%</Typography></Box>
    <LinearProgress variant="determinate" value={Math.min(100, Math.max(0, job.progress * 100))} />
    <Typography variant="caption" color="text.secondary" sx={{ display: 'block', mt: 0.75 }}>{job.message}</Typography>
  </Box>;
}
