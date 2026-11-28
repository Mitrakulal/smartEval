import Box from '@mui/material/Box';
import Typography from '@mui/material/Typography';
import Chip from '@mui/material/Chip';
import type { Answer } from '../../api/types.ts';

interface QuestionTabsProps {
  answers: Answer[];
  selectedQid: number;
  onSelectQuestion: (qid: number) => void;
}

export function QuestionTabs({ answers, selectedQid, onSelectQuestion }: QuestionTabsProps) {
  return (
    <Box
      sx={{
        display: 'flex',
        alignItems: 'center',
        gap: 1.5,
        overflowX: 'auto',
        pb: 1,
        mb: 2,
        '::-webkit-scrollbar': { height: 6 },
        '::-webkit-scrollbar-thumb': { bgcolor: 'divider', borderRadius: 3 },
      }}
    >
      {answers.map((ans) => {
        const isSelected = ans.question_id === selectedQid;
        const isAnswered = ans.status === 'evaluated';
        const hasFlags = ans.flags && ans.flags.length > 0;

        return (
          <Box
            key={ans.question_id}
            onClick={() => onSelectQuestion(ans.question_id)}
            sx={{
              display: 'flex',
              alignItems: 'center',
              gap: 1,
              px: 2,
              py: 1,
              borderRadius: 2,
              cursor: 'pointer',
              border: '1px solid',
              borderColor: isSelected ? 'primary.main' : 'divider',
              background: isSelected
                ? 'linear-gradient(135deg, #7C5CFF 0%, #5B3DF5 100%)'
                : 'background.paper',
              color: isSelected ? 'primary.contrastText' : 'text.primary',
              transition: 'all 0.15s ease',
              whiteSpace: 'nowrap',
              boxShadow: isSelected ? '0 8px 20px rgba(108, 76, 241, 0.24)' : 'none',
              '&:hover': {
                borderColor: 'primary.main',
                background: isSelected
                  ? 'linear-gradient(135deg, #7C5CFF 0%, #5B3DF5 100%)'
                  : 'action.hover',
              },
            }}
          >
            <Typography variant="subtitle2" sx={{ fontWeight: 700 }}>
              Q{ans.question_number}
            </Typography>

            <Box
              sx={{
                px: 0.75,
                py: 0.25,
                borderRadius: 1,
                fontSize: '0.75rem',
                fontWeight: 600,
                bgcolor: isSelected ? 'rgba(255,255,255,0.2)' : 'action.selected',
                color: isSelected ? 'inherit' : 'text.secondary',
              }}
            >
              {isAnswered && ans.final_marks !== null
                ? `${ans.final_marks} / ${ans.max_marks}m`
                : `— / ${ans.max_marks}m`}
            </Box>

            {hasFlags && (
              <Chip
                size="small"
                label={ans.flags.length}
                color="error"
                sx={{
                  height: 18,
                  fontSize: '0.6875rem',
                  fontWeight: 700,
                  bgcolor: isSelected ? 'error.light' : undefined,
                  color: isSelected ? '#ffffff' : undefined,
                }}
              />
            )}
          </Box>
        );
      })}
    </Box>
  );
}
