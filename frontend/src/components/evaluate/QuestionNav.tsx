import Box from '@mui/material/Box';
import Chip from '@mui/material/Chip';
import Stack from '@mui/material/Stack';
import type { AnswerStatus } from '../../api/types.ts';

export interface QuestionNavItem { questionId: number; number: string; status: AnswerStatus; isReviewed: boolean }
interface Props { items: QuestionNavItem[]; activeQuestionId: number | null; onSelect: (questionId: number) => void }
const COLORS: Record<AnswerStatus, 'default' | 'info' | 'success' | 'error'> = { pending: 'default', processing: 'info', evaluated: 'success', error: 'error' };
const DOT_COLORS: Record<AnswerStatus, string> = { pending: 'text.disabled', processing: 'info.main', evaluated: 'success.main', error: 'error.main' };

export function QuestionNav({ items, activeQuestionId, onSelect }: Props) {
  return <Stack direction="row" spacing={1} useFlexGap flexWrap="wrap" aria-label="Questions">
    {items.map((item) => <Chip key={item.questionId} clickable onClick={() => onSelect(item.questionId)} color={item.questionId === activeQuestionId ? 'primary' : COLORS[item.status]} variant={item.questionId === activeQuestionId ? 'filled' : 'outlined'} label={<Box component="span" sx={{ display: 'inline-flex', alignItems: 'center', gap: 0.75 }}><Box component="span" sx={{ width: 7, height: 7, borderRadius: '50%', bgcolor: DOT_COLORS[item.status] }} />Q{item.number}{item.isReviewed ? ' ✓' : ''}</Box>} />)}
  </Stack>;
}
