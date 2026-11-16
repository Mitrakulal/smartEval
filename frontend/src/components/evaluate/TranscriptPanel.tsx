import { useState } from 'react';
import Alert from '@mui/material/Alert';
import Box from '@mui/material/Box';
import IconButton from '@mui/material/IconButton';
import Paper from '@mui/material/Paper';
import Tooltip from '@mui/material/Tooltip';
import Typography from '@mui/material/Typography';
import ContentCopyIcon from '@mui/icons-material/ContentCopy';

interface Props { transcript: string | null; confidence: number | null }

export function TranscriptPanel({ transcript, confidence }: Props) {
  const [copied, setCopied] = useState(false);
  const [copyError, setCopyError] = useState('');
  const copyText = async () => {
    if (!transcript) return;
    try { await navigator.clipboard.writeText(transcript); setCopied(true); setCopyError(''); window.setTimeout(() => setCopied(false), 1500); }
    catch { setCopyError('Clipboard access is unavailable in this browser.'); }
  };
  return <Paper variant="outlined" sx={{ p: 2, height: '100%' }}>
    <Box sx={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', mb: 1 }}>
      <Typography variant="subtitle2">Transcript</Typography>
      <Tooltip title={copied ? 'Copied' : 'Copy transcript'}><span><IconButton size="small" aria-label="Copy transcript" onClick={() => void copyText()} disabled={!transcript}><ContentCopyIcon fontSize="small" /></IconButton></span></Tooltip>
    </Box>
    {confidence !== null && <Typography variant="caption" color="text.secondary" sx={{ display: 'block', mb: 1 }}>OCR confidence · {Math.round(confidence * 100)}%</Typography>}
    {copyError && <Alert severity="warning" sx={{ mb: 1 }}>{copyError}</Alert>}
    <Box sx={{ minHeight: 230, maxHeight: 310, overflowY: 'auto', p: 1.5, bgcolor: 'background.default', borderRadius: 1 }}>
      <Typography variant="body2" sx={{ whiteSpace: 'pre-wrap', fontFamily: 'monospace', lineHeight: 1.7 }}>{transcript || 'No transcript available yet.'}</Typography>
    </Box>
  </Paper>;
}
