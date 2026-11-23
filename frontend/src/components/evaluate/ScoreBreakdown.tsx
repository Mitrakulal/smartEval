import Box from '@mui/material/Box';
import Typography from '@mui/material/Typography';
import Paper from '@mui/material/Paper';
import LinearProgress from '@mui/material/LinearProgress';
import Chip from '@mui/material/Chip';
import CheckCircleIcon from '@mui/icons-material/CheckCircle';
import CancelIcon from '@mui/icons-material/Cancel';
import HelpIcon from '@mui/icons-material/Help';
import AnalyticsIcon from '@mui/icons-material/Analytics';
import { FlagBadge } from '../FlagBadge.tsx';
import type { MatchedKeyPoint, AnswerFlag } from '../../api/types.ts';

interface ScoreBreakdownProps {
  keyPoints: MatchedKeyPoint[];
  coverage: number | null;
  coveredCount: number;
  totalPoints: number;
  suggestedMarks: number | null;
  maxMarks: number;
  flags: AnswerFlag[];
  isLoading: boolean;
}

export function ScoreBreakdown({
  keyPoints,
  coverage,
  coveredCount,
  totalPoints,
  suggestedMarks,
  maxMarks,
  flags,
  isLoading,
}: ScoreBreakdownProps) {
  const coveragePct = coverage !== null ? Math.round(coverage * 100) : 0;

  return (
    <Paper
      variant="outlined"
      sx={{
        height: '100%',
        minHeight: 460,
        display: 'flex',
        flexDirection: 'column',
        borderRadius: 2,
        overflow: 'hidden',
        bgcolor: 'background.paper',
      }}
    >
      {/* Header */}
      <Box
        sx={{
          p: 1.5,
          borderBottom: '1px solid',
          borderColor: 'divider',
          bgcolor: 'action.hover',
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'space-between',
        }}
      >
        <Typography variant="subtitle2" sx={{ fontWeight: 700, display: 'flex', alignItems: 'center', gap: 1 }}>
          <AnalyticsIcon fontSize="small" color="primary" /> Semantic Evaluation
        </Typography>

        {suggestedMarks !== null && (
          <Box
            sx={{
              display: 'inline-flex',
              alignItems: 'center',
              gap: 0.5,
              px: 1.25,
              py: 0.25,
              borderRadius: 1.5,
              bgcolor: 'primary.50',
              color: 'primary.main',
              fontWeight: 700,
              fontSize: '0.8125rem',
            }}
          >
            Suggested: {suggestedMarks} / {maxMarks}m
          </Box>
        )}
      </Box>

      <Box sx={{ flexGrow: 1, p: 2, display: 'flex', flexDirection: 'column' }}>
        {suggestedMarks !== null ? (
          <>
            {/* Coverage Bar */}
            <Box sx={{ mb: 2.5, p: 1.5, borderRadius: 1.5, bgcolor: 'background.default', border: '1px solid', borderColor: 'divider' }}>
              <Box sx={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', mb: 0.75 }}>
                <Typography variant="caption" sx={{ fontWeight: 700, textTransform: 'uppercase', color: 'text.secondary' }}>
                  Concept Coverage
                </Typography>
                <Typography variant="subtitle2" sx={{ fontWeight: 700, color: 'primary.main' }}>
                  {coveragePct}% ({coveredCount}/{totalPoints} points)
                </Typography>
              </Box>
              <LinearProgress
                variant="determinate"
                value={coveragePct}
                sx={{
                  height: 8,
                  borderRadius: 4,
                  bgcolor: 'action.disabledBackground',
                  '& .MuiLinearProgress-bar': {
                    borderRadius: 4,
                    bgcolor: coveragePct >= 70 ? 'success.main' : coveragePct >= 40 ? 'warning.main' : 'error.main',
                  },
                }}
              />
            </Box>

            {/* Flags */}
            {flags && flags.length > 0 && (
              <Box sx={{ mb: 2 }}>
                <Typography variant="caption" sx={{ fontWeight: 700, color: 'text.secondary', display: 'block', mb: 0.5 }}>
                  Active Flags
                </Typography>
                <Box sx={{ display: 'flex', flexWrap: 'wrap', gap: 0.75 }}>
                  {flags.map((flag, idx) => (
                    <FlagBadge key={idx} flag={flag} />
                  ))}
                </Box>
              </Box>
            )}

            {/* Key Points Matching */}
            <Typography variant="caption" sx={{ fontWeight: 700, textTransform: 'uppercase', color: 'text.secondary', mb: 1 }}>
              Key Point Semantic Similarity
            </Typography>

            <Box sx={{ flexGrow: 1, overflowY: 'auto', display: 'flex', flexDirection: 'column', gap: 1, maxHeight: 300 }}>
              {keyPoints.map((point) => {
                const statusColor = point.covered ? 'success' : point.borderline ? 'warning' : 'error';
                const statusIcon = point.covered ? (
                  <CheckCircleIcon sx={{ fontSize: 16, color: 'success.main' }} />
                ) : point.borderline ? (
                  <HelpIcon sx={{ fontSize: 16, color: 'warning.main' }} />
                ) : (
                  <CancelIcon sx={{ fontSize: 16, color: 'error.main' }} />
                );

                return (
                  <Box
                    key={point.id}
                    sx={{
                      p: 1.25,
                      borderRadius: 1.5,
                      border: '1px solid',
                      borderColor: 'divider',
                      bgcolor: 'background.paper',
                    }}
                  >
                    <Box sx={{ display: 'flex', alignItems: 'flex-start', justifyContent: 'space-between', gap: 1 }}>
                      <Box sx={{ display: 'flex', alignItems: 'flex-start', gap: 1 }}>
                        <Box sx={{ mt: 0.25 }}>{statusIcon}</Box>
                        <Typography variant="body2" sx={{ fontSize: '0.8125rem', lineHeight: 1.4 }}>
                          {point.text}
                        </Typography>
                      </Box>
                      <Chip
                        size="small"
                        color={statusColor}
                        variant="outlined"
                        label={`${Math.round(point.similarity * 100)}%`}
                        sx={{ height: 20, fontSize: '0.6875rem', fontWeight: 700 }}
                      />
                    </Box>
                  </Box>
                );
              })}
            </Box>
          </>
        ) : (
          <Box
            sx={{
              flexGrow: 1,
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
              p: 4,
              color: 'text.secondary',
              textAlign: 'center',
            }}
          >
            <Typography variant="body2">
              {isLoading
                ? 'Computing embeddings & semantic similarity...'
                : 'Scoring breakdown will appear after the answer script is uploaded.'}
            </Typography>
          </Box>
        )}
      </Box>
    </Paper>
  );
}
