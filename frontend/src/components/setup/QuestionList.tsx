import Box from '@mui/material/Box';
import Typography from '@mui/material/Typography';
import Button from '@mui/material/Button';
import AddIcon from '@mui/icons-material/Add';
import { QuestionRow } from './QuestionRow.tsx';
import type { DraftQuestion } from '../../api/types.ts';

interface QuestionListProps {
  questions: DraftQuestion[];
  disabled?: boolean;
  onChange: (updatedQuestions: DraftQuestion[]) => void;
}

export function QuestionList({ questions, disabled = false, onChange }: QuestionListProps) {
  // Find duplicate numbers for validation highlighting
  const numberCounts = questions.reduce<Record<number, number>>((acc, q) => {
    acc[q.number] = (acc[q.number] || 0) + 1;
    return acc;
  }, {});

  const totalMarks = questions.reduce((acc, q) => acc + (q.max_marks || 0), 0);

  const handleQuestionChange = (index: number, updatedQuestion: DraftQuestion) => {
    const updated = [...questions];
    updated[index] = updatedQuestion;
    onChange(updated);
  };

  const handleDelete = (index: number) => {
    const updated = questions.filter((_, i) => i !== index);
    onChange(updated);
  };

  const handleMoveUp = (index: number) => {
    if (index === 0) return;
    const updated = [...questions];
    const temp = updated[index - 1];
    updated[index - 1] = updated[index];
    updated[index] = temp;
    onChange(updated);
  };

  const handleMoveDown = (index: number) => {
    if (index === questions.length - 1) return;
    const updated = [...questions];
    const temp = updated[index + 1];
    updated[index + 1] = updated[index];
    updated[index] = temp;
    onChange(updated);
  };

  const handleAddQuestion = () => {
    const nextNumber = questions.length > 0 ? Math.max(...questions.map((q) => q.number)) + 1 : 1;
    const newQuestion: DraftQuestion = {
      number: nextNumber,
      text: '',
      max_marks: 5,
      grading_mode: 'semantic',
      key_points: [{ text: '', confidence: 'parsed' }],
      confidence: { text: 'parsed', max_marks: 'parsed' },
    };
    onChange([...questions, newQuestion]);
  };

  return (
    <Box sx={{ width: '100%' }}>
      <Box sx={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', mb: 2 }}>
        <Box>
          <Typography variant="h6" sx={{ fontWeight: 600 }}>
            Questions ({questions.length})
          </Typography>
          <Typography variant="caption" color="text.secondary">
            Total Max Marks: {totalMarks}
          </Typography>
        </Box>
        {!disabled && (
          <Button variant="outlined" size="small" startIcon={<AddIcon />} onClick={handleAddQuestion}>
            Add Question
          </Button>
        )}
      </Box>

      {questions.length === 0 ? (
        <Box
          sx={{
            p: 4,
            textAlign: 'center',
            border: '1px dashed',
            borderColor: 'divider',
            borderRadius: 2,
            bgcolor: 'background.paper',
          }}
        >
          <Typography variant="body2" color="text.secondary" gutterBottom>
            No questions defined yet.
          </Typography>
          {!disabled && (
            <Button size="small" variant="contained" onClick={handleAddQuestion} sx={{ mt: 1 }}>
              Add First Question
            </Button>
          )}
        </Box>
      ) : (
        <Box sx={{ display: 'flex', flexDirection: 'column' }}>
          {questions.map((q, index) => (
            <QuestionRow
              key={`${q.number}-${index}`}
              question={q}
              index={index}
              totalQuestions={questions.length}
              disabled={disabled}
              isDuplicateNumber={numberCounts[q.number] > 1}
              onChange={(updated) => handleQuestionChange(index, updated)}
              onDelete={() => handleDelete(index)}
              onMoveUp={() => handleMoveUp(index)}
              onMoveDown={() => handleMoveDown(index)}
            />
          ))}
        </Box>
      )}
    </Box>
  );
}
