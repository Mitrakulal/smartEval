import Box from '@mui/material/Box';
import Typography from '@mui/material/Typography';
import TextField from '@mui/material/TextField';
import MenuItem from '@mui/material/MenuItem';
import Select from '@mui/material/Select';
import FormControl from '@mui/material/FormControl';
import InputLabel from '@mui/material/InputLabel';
import IconButton from '@mui/material/IconButton';
import Paper from '@mui/material/Paper';
import DeleteIcon from '@mui/icons-material/Delete';
import ArrowUpwardIcon from '@mui/icons-material/ArrowUpward';
import ArrowDownwardIcon from '@mui/icons-material/ArrowDownward';
import { ConfidenceBadge } from './ConfidenceBadge.tsx';
import { KeyPointList } from './KeyPointList.tsx';
import type { DraftQuestion, GradingMode, DraftKeyPoint } from '../../api/types.ts';

interface QuestionRowProps {
  question: DraftQuestion;
  index: number;
  totalQuestions: number;
  disabled?: boolean;
  isDuplicateNumber?: boolean;
  onChange: (updatedQuestion: DraftQuestion) => void;
  onDelete: () => void;
  onMoveUp?: () => void;
  onMoveDown?: () => void;
}

export function QuestionRow({
  question,
  index,
  totalQuestions,
  disabled = false,
  isDuplicateNumber = false,
  onChange,
  onDelete,
  onMoveUp,
  onMoveDown,
}: QuestionRowProps) {
  const handleFieldChange = <K extends keyof DraftQuestion>(field: K, val: DraftQuestion[K]) => {
    onChange({
      ...question,
      [field]: val,
    });
  };

  const handleKeyPointsChange = (keyPoints: DraftKeyPoint[]) => {
    handleFieldChange('key_points', keyPoints);
  };

  return (
    <Paper
      variant="outlined"
      sx={{
        p: 2.5,
        mb: 2,
        borderRadius: 2,
        border: '1px solid',
        borderColor: isDuplicateNumber || question.max_marks <= 0 || question.key_points.length === 0
          ? 'warning.light'
          : 'divider',
        bgcolor: 'background.paper',
      }}
    >
      <Box sx={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', mb: 2 }}>
        <Box sx={{ display: 'flex', alignItems: 'center', gap: 1.5 }}>
          <Typography variant="subtitle1" sx={{ fontWeight: 700 }}>
            Question #{question.number}
          </Typography>
          <Box sx={{ display: 'flex', gap: 0.5 }}>
            <ConfidenceBadge confidence={question.confidence?.text} />
            <ConfidenceBadge confidence={question.confidence?.max_marks} />
          </Box>
        </Box>

        {!disabled && (
          <Box sx={{ display: 'flex', alignItems: 'center', gap: 0.5 }}>
            <IconButton
              size="small"
              onClick={onMoveUp}
              disabled={index === 0}
              title="Move question up"
            >
              <ArrowUpwardIcon fontSize="small" />
            </IconButton>
            <IconButton
              size="small"
              onClick={onMoveDown}
              disabled={index === totalQuestions - 1}
              title="Move question down"
            >
              <ArrowDownwardIcon fontSize="small" />
            </IconButton>
            <IconButton
              size="small"
              color="error"
              onClick={onDelete}
              title="Delete question"
            >
              <DeleteIcon fontSize="small" />
            </IconButton>
          </Box>
        )}
      </Box>

      <Box sx={{ display: 'grid', gridTemplateColumns: { xs: '1fr', sm: '100px 140px 1fr' }, gap: 2, mb: 2 }}>
        <TextField
          label="Q Number"
          type="number"
          size="small"
          value={question.number}
          disabled={disabled}
          error={isDuplicateNumber || question.number <= 0}
          helperText={isDuplicateNumber ? 'Duplicate' : undefined}
          onChange={(e) => handleFieldChange('number', parseInt(e.target.value, 10) || 1)}
          slotProps={{
            htmlInput: { min: 1 },
          }}
        />

        <TextField
          label="Max Marks"
          type="number"
          size="small"
          value={question.max_marks}
          disabled={disabled}
          error={question.max_marks <= 0}
          helperText={question.max_marks <= 0 ? 'Must be > 0' : undefined}
          onChange={(e) => handleFieldChange('max_marks', parseFloat(e.target.value) || 0)}
          slotProps={{
            htmlInput: { min: 0.5, step: 0.5 },
          }}
        />

        <FormControl size="small" fullWidth disabled={disabled}>
          <InputLabel>Grading Mode</InputLabel>
          <Select
            value={question.grading_mode}
            label="Grading Mode"
            onChange={(e) => handleFieldChange('grading_mode', e.target.value as GradingMode)}
          >
            <MenuItem value="semantic">Semantic (AI + Key Points)</MenuItem>
            <MenuItem value="manual">Manual (Lecturer Scores)</MenuItem>
          </Select>
        </FormControl>
      </Box>

      <TextField
        label="Question Statement"
        fullWidth
        multiline
        minRows={2}
        maxRows={4}
        size="small"
        placeholder="Enter question text..."
        value={question.text}
        disabled={disabled}
        error={question.text.trim() === ''}
        helperText={question.text.trim() === '' ? 'Question statement cannot be empty' : undefined}
        onChange={(e) => handleFieldChange('text', e.target.value)}
        sx={{ mb: 1 }}
      />

      <KeyPointList
        keyPoints={question.key_points}
        disabled={disabled}
        onChange={handleKeyPointsChange}
      />
    </Paper>
  );
}
