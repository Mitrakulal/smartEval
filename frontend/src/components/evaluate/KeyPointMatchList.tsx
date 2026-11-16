import CheckCircleOutlineIcon from '@mui/icons-material/CheckCircleOutline';
import CancelOutlinedIcon from '@mui/icons-material/CancelOutlined';
import Alert from '@mui/material/Alert';
import Box from '@mui/material/Box';
import Chip from '@mui/material/Chip';
import LinearProgress from '@mui/material/LinearProgress';
import Paper from '@mui/material/Paper';
import Stack from '@mui/material/Stack';
import Typography from '@mui/material/Typography';
import type { MatchedKeyPoint } from '../../api/types.ts';

interface Props { points: MatchedKeyPoint[]; coveredCount: number; keyPointCount: number; coverage: number | null }

export function KeyPointMatchList({ points, coveredCount, keyPointCount, coverage }: Props) {
  return <Paper variant="outlined" sx={{ p: 2, height: '100%' }}>
    <Typography variant="subtitle2" sx={{ mb: 1 }}>Key point matches</Typography>
    <Typography variant="body2" color="text.secondary" sx={{ mb: 1.5 }}>{coveredCount} of {keyPointCount} key points covered{coverage !== null ? ` · ${Math.round(coverage * 100)}%` : ''}</Typography>
    {coverage !== null && <LinearProgress variant="determinate" value={Math.min(100, Math.max(0, coverage * 100))} sx={{ mb: 1.5 }} />}
    {points.length === 0 ? <Alert severity="info">No key point match details are available.</Alert> :
      <Stack spacing={1} sx={{ maxHeight: 290, overflowY: 'auto' }}>{points.map((point) => <Box key={point.id} sx={{ p: 1.25, border: 1, borderColor: point.borderline ? 'warning.light' : 'divider', borderRadius: 1 }}>
        <Box sx={{ display: 'flex', gap: 1, alignItems: 'flex-start' }}>
          {point.covered ? <CheckCircleOutlineIcon color="success" fontSize="small" /> : <CancelOutlinedIcon color="error" fontSize="small" />}
          <Typography variant="body2" sx={{ flex: 1 }}>{point.text}</Typography>
          <Typography variant="caption" color="text.secondary">{point.similarity.toFixed(2)}</Typography>
        </Box>
        {point.borderline && <Chip label="Borderline" color="warning" size="small" variant="outlined" sx={{ mt: 0.75, ml: 3.5 }} />}
      </Box>)}</Stack>}
  </Paper>;
}
