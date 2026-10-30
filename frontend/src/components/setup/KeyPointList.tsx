import Box from '@mui/material/Box';
import Typography from '@mui/material/Typography';
import TextField from '@mui/material/TextField';
import IconButton from '@mui/material/IconButton';
import Button from '@mui/material/Button';
import DeleteIcon from '@mui/icons-material/Delete';
import AddCircleIcon from '@mui/icons-material/AddCircle';
import { ConfidenceBadge } from './ConfidenceBadge.tsx';
import type { DraftKeyPoint } from '../../api/types.ts';

interface KeyPointListProps {
  keyPoints: DraftKeyPoint[];
  disabled?: boolean;
  onChange: (updatedPoints: DraftKeyPoint[]) => void;
}

export function KeyPointList({ keyPoints, disabled = false, onChange }: KeyPointListProps) {
  const handleTextChange = (index: number, newText: string) => {
    const updated = [...keyPoints];
    updated[index] = { ...updated[index], text: newText };
    onChange(updated);
  };

  const handleDelete = (index: number) => {
    const updated = keyPoints.filter((_, i) => i !== index);
    onChange(updated);
  };

  const handleAdd = () => {
    onChange([...keyPoints, { text: '', confidence: 'parsed' }]);
  };

  return (
    <Box sx={{ mt: 2 }}>
      <Box sx={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', mb: 1 }}>
        <Typography variant="caption" sx={{ fontWeight: 600, color: 'text.secondary', textTransform: 'uppercase' }}>
          Key Grading Points ({keyPoints.length})
        </Typography>
        {!disabled && (
          <Button
            size="small"
            startIcon={<AddCircleIcon />}
            onClick={handleAdd}
            sx={{ fontSize: '0.75rem', py: 0.25 }}
          >
            Add Key Point
          </Button>
        )}
      </Box>

      {keyPoints.length === 0 ? (
        <Typography variant="caption" color="error.main" sx={{ display: 'block', fontStyle: 'italic', mb: 1 }}>
          At least one key grading point is required.
        </Typography>
      ) : (
        <Box sx={{ display: 'flex', flexDirection: 'column', gap: 1 }}>
          {keyPoints.map((kp, idx) => (
            <Box
              key={idx}
              sx={{
                display: 'flex',
                alignItems: 'center',
                gap: 1,
                bgcolor: 'background.default',
                p: 1,
                borderRadius: 1,
                border: '1px solid',
                borderColor: kp.text.trim() === '' ? 'error.light' : 'divider',
              }}
            >
              <Typography variant="body2" sx={{ fontWeight: 600, color: 'text.secondary', minWidth: 20 }}>
                {idx + 1}.
              </Typography>
              <TextField
                fullWidth
                size="small"
                multiline
                maxRows={3}
                placeholder="Key concept or expected answer point..."
                value={kp.text}
                disabled={disabled}
                onChange={(e) => handleTextChange(idx, e.target.value)}
                error={kp.text.trim() === ''}
                sx={{
                  bgcolor: 'background.paper',
                  '& .MuiInputBase-input': { fontSize: '0.85rem' },
                }}
              />
              <ConfidenceBadge confidence={kp.confidence} />
              {!disabled && (
                <IconButton
                  size="small"
                  color="error"
                  onClick={() => handleDelete(idx)}
                  title="Delete key point"
                >
                  <DeleteIcon fontSize="small" />
                </IconButton>
              )}
            </Box>
          ))}
        </Box>
      )}
    </Box>
  );
}
