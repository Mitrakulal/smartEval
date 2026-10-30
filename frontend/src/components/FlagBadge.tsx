import Chip from '@mui/material/Chip';
import type { AnswerFlag } from '../api/types.ts';

interface FlagBadgeProps {
  flag: AnswerFlag;
  size?: 'small' | 'medium';
}

const FLAG_CONFIG: Record<
  AnswerFlag,
  { label: string; color: 'default' | 'primary' | 'secondary' | 'error' | 'info' | 'success' | 'warning' }
> = {
  low_ocr_confidence: { label: 'Low OCR', color: 'warning' },
  degenerate_transcript: { label: 'Degenerate', color: 'error' },
  borderline: { label: 'Borderline', color: 'warning' },
  zero_coverage: { label: 'Zero Coverage', color: 'error' },
  manual_question: { label: 'Manual', color: 'info' },
};

/**
 * Shared component owned by F2, imported by F1.
 */
export function FlagBadge({ flag, size = 'small' }: FlagBadgeProps) {
  const config = FLAG_CONFIG[flag] || { label: flag, color: 'default' };

  return <Chip label={config.label} color={config.color} size={size} variant="filled" />;
}
