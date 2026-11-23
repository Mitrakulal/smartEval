import { useState } from 'react';
import Box from '@mui/material/Box';
import Typography from '@mui/material/Typography';
import Paper from '@mui/material/Paper';
import Chip from '@mui/material/Chip';
import Button from '@mui/material/Button';
import Alert from '@mui/material/Alert';
import TextField from '@mui/material/TextField';
import Dialog from '@mui/material/Dialog';
import DialogTitle from '@mui/material/DialogTitle';
import DialogContent from '@mui/material/DialogContent';
import DialogActions from '@mui/material/DialogActions';
import TextSnippetIcon from '@mui/icons-material/TextSnippet';
import EditNoteIcon from '@mui/icons-material/EditNote';
import WarningAmberIcon from '@mui/icons-material/WarningAmber';

interface TranscriptViewerProps {
  transcript: string | null;
  confidence: number | null;
  flags: string[];
  isLoading: boolean;
  onUpdateTranscript?: (newText: string) => void;
}

export function TranscriptViewer({
  transcript,
  confidence,
  flags,
  isLoading,
  onUpdateTranscript,
}: TranscriptViewerProps) {
  const [isEditing, setIsEditing] = useState(false);
  const [editText, setEditText] = useState(transcript || '');

  const hasDiagram = flags.some((f) => f.includes('diagram'));
  const isLowConfidence = flags.some((f) => f.includes('confidence') || f.includes('ocr'));

  const legibility =
    confidence === null
      ? 'Unknown'
      : confidence >= 0.8
      ? 'High Legibility'
      : confidence >= 0.6
      ? 'Medium Legibility'
      : 'Low Legibility';

  const legibilityColor =
    confidence === null
      ? 'default'
      : confidence >= 0.8
      ? 'success'
      : confidence >= 0.6
      ? 'warning'
      : 'error';

  const handleSave = () => {
    if (onUpdateTranscript) {
      onUpdateTranscript(editText);
    }
    setIsEditing(false);
  };

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
          <TextSnippetIcon fontSize="small" color="primary" /> OCR Transcript
        </Typography>

        {transcript && (
          <Box sx={{ display: 'flex', alignItems: 'center', gap: 1 }}>
            <Chip
              label={legibility}
              color={legibilityColor}
              size="small"
              variant="outlined"
              sx={{ fontWeight: 600, fontSize: '0.75rem' }}
            />
            {confidence !== null && (
              <Typography variant="caption" sx={{ fontWeight: 600, color: 'text.secondary' }}>
                {Math.round(confidence * 100)}%
              </Typography>
            )}
          </Box>
        )}
      </Box>

      <Box sx={{ flexGrow: 1, p: 2, display: 'flex', flexDirection: 'column' }}>
        {hasDiagram && (
          <Alert
            severity="warning"
            icon={<WarningAmberIcon fontSize="inherit" />}
            sx={{ mb: 2, fontSize: '0.8125rem', py: 0.5 }}
          >
            Diagram detected in student response — requires manual lecturer review.
          </Alert>
        )}

        {isLowConfidence && (
          <Alert severity="info" sx={{ mb: 2, fontSize: '0.8125rem', py: 0.5 }}>
            Handwriting confidence is borderline. Please verify the transcript against the script.
          </Alert>
        )}

        {transcript ? (
          <Box sx={{ flexGrow: 1, display: 'flex', flexDirection: 'column' }}>
            <Box
              sx={{
                flexGrow: 1,
                p: 2,
                borderRadius: 1.5,
                bgcolor: 'background.default',
                border: '1px solid',
                borderColor: 'divider',
                fontFamily: 'monospace',
                fontSize: '0.875rem',
                lineHeight: 1.6,
                color: 'text.primary',
                whiteSpace: 'pre-wrap',
                overflowY: 'auto',
                maxHeight: 380,
              }}
            >
              {transcript}
            </Box>

            <Box sx={{ mt: 2, display: 'flex', justifyContent: 'flex-end' }}>
              <Button
                size="small"
                variant="outlined"
                startIcon={<EditNoteIcon />}
                onClick={() => {
                  setEditText(transcript);
                  setIsEditing(true);
                }}
              >
                Edit Transcript
              </Button>
            </Box>
          </Box>
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
                ? 'Processing OCR handwriting recognition...'
                : 'Upload an answer script on the left to extract the transcript.'}
            </Typography>
          </Box>
        )}
      </Box>

      {/* Edit Transcript Modal */}
      <Dialog open={isEditing} onClose={() => setIsEditing(false)} maxWidth="sm" fullWidth>
        <DialogTitle sx={{ fontWeight: 700 }}>Edit Recognized Transcript</DialogTitle>
        <DialogContent dividers>
          <TextField
            multiline
            rows={8}
            fullWidth
            value={editText}
            onChange={(e) => setEditText(e.target.value)}
            placeholder="Edit handwritten answer text..."
            sx={{ fontFamily: 'monospace' }}
          />
        </DialogContent>
        <DialogActions sx={{ p: 2 }}>
          <Button onClick={() => setIsEditing(false)} color="inherit">
            Cancel
          </Button>
          <Button onClick={handleSave} variant="contained" color="primary">
            Save Transcript
          </Button>
        </DialogActions>
      </Dialog>
    </Paper>
  );
}
