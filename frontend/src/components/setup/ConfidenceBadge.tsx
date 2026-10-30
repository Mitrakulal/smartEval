import Chip from '@mui/material/Chip';
import type { Confidence } from '../../api/types.ts';

interface ConfidenceBadgeProps {
  confidence?: Confidence;
  size?: 'small' | 'medium';
}

export function ConfidenceBadge({ confidence, size = 'small' }: ConfidenceBadgeProps) {
  if (!confidence) return null;

  switch (confidence) {
    case 'parsed':
      return <Chip label="parsed" color="success" size={size} variant="outlined" sx={{ height: 20, fontSize: '0.7rem' }} />;
    case 'guessed':
      return <Chip label="guessed" color="warning" size={size} variant="filled" sx={{ height: 20, fontSize: '0.7rem' }} />;
    case 'missing':
      return <Chip label="missing" color="error" size={size} variant="filled" sx={{ height: 20, fontSize: '0.7rem' }} />;
    default:
      return null;
  }
}
