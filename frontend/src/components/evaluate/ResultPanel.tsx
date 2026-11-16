import { useState } from 'react';
import Alert from '@mui/material/Alert';
import Box from '@mui/material/Box';
import Button from '@mui/material/Button';
import Dialog from '@mui/material/Dialog';
import DialogContent from '@mui/material/DialogContent';
import Grid from '@mui/material/Grid';
import Paper from '@mui/material/Paper';
import Stack from '@mui/material/Stack';
import TextField from '@mui/material/TextField';
import Typography from '@mui/material/Typography';
import ZoomInIcon from '@mui/icons-material/ZoomIn';
import { FlagBadge } from '../FlagBadge.tsx';
import { MarkInput } from '../MarkInput.tsx';
import type { Answer } from '../../api/types.ts';
import { KeyPointMatchList } from './KeyPointMatchList.tsx';
import { TranscriptPanel } from './TranscriptPanel.tsx';

interface Props { answer: Answer; disabled: boolean; onAccept: (marks: number) => void; onOverride: (marks: number, reason: string) => void; isSaving: boolean }

export function ResultPanel({ answer, disabled, onAccept, onOverride, isSaving }: Props) {
  const initialMarks = answer.final_marks ?? answer.suggested_marks ?? '';
  const [marks, setMarks] = useState<number | ''>(initialMarks);
  const [reason, setReason] = useState('');
  const [editing, setEditing] = useState(false);
  const [imageOpen, setImageOpen] = useState(false);
  const [imageFailed, setImageFailed] = useState(false);
  const pendingReview = answer.decision !== 'accepted' && answer.decision !== 'overridden';
  const validMarks = typeof marks === 'number' && Number.isFinite(marks) && marks >= 0 && marks <= answer.max_marks && Number.isInteger(marks * 2);
  const imageSrc = answer.image_url && !imageFailed ? answer.image_url : null;
  return <Stack spacing={2}>
    {answer.flags.length > 0 && <Stack direction="row" spacing={1} useFlexGap flexWrap="wrap">{answer.flags.map((flag) => <FlagBadge key={flag} flag={flag} />)}</Stack>}
    {answer.review_reason && <Alert severity="warning">Review note: {answer.review_reason}</Alert>}
    <Grid container spacing={2}>
      <Grid size={{ xs: 12, md: 4 }}>
        <Paper variant="outlined" sx={{ p: 2, height: '100%' }}>
          <Typography variant="subtitle2" sx={{ mb: 1.5 }}>Answer image</Typography>
          {imageSrc ? <Box component="button" type="button" onClick={() => setImageOpen(true)} aria-label="Zoom answer image" sx={{ p: 0, width: '100%', border: 0, bgcolor: 'background.default', cursor: 'zoom-in', position: 'relative' }}>
            <Box component="img" src={imageSrc} alt={`Uploaded answer for question ${answer.question_number}`} onError={() => setImageFailed(true)} sx={{ display: 'block', width: '100%', maxHeight: 310, objectFit: 'contain', borderRadius: 1 }} />
            <ZoomInIcon sx={{ position: 'absolute', right: 8, bottom: 8, bgcolor: 'background.paper', borderRadius: '50%', p: 0.5 }} />
          </Box> : <Box sx={{ minHeight: 230, display: 'grid', placeItems: 'center', bgcolor: 'background.default', borderRadius: 1 }}><Typography variant="body2" color="text.secondary">Answer image unavailable</Typography></Box>}
        </Paper>
      </Grid>
      <Grid size={{ xs: 12, md: 4 }}><TranscriptPanel transcript={answer.transcript} confidence={answer.ocr_confidence} /></Grid>
      <Grid size={{ xs: 12, md: 4 }}><KeyPointMatchList points={answer.key_points} coveredCount={answer.covered_count} keyPointCount={answer.key_point_count} coverage={answer.coverage} /></Grid>
    </Grid>
    <Paper variant="outlined" sx={{ p: 2 }}>
      <Stack direction={{ xs: 'column', sm: 'row' }} spacing={2} alignItems={{ sm: 'center' }} justifyContent="space-between">
        <Box><Typography variant="subtitle2">Suggested marks</Typography><Typography variant="h6">{answer.suggested_marks === null ? '—' : `${answer.suggested_marks} / ${answer.max_marks}`}</Typography></Box>
        {answer.decision && answer.decision !== 'pending' ? <Alert severity="success" sx={{ py: 0.25 }}>Reviewed · {answer.final_marks ?? 0} / {answer.max_marks} ({answer.decision})</Alert> :
          <Stack direction={{ xs: 'column', sm: 'row' }} spacing={1.5} alignItems={{ sm: 'center' }}>
            {editing && <><Box><Typography variant="caption" color="text.secondary">Final marks</Typography><MarkInput value={marks} maxMarks={answer.max_marks} disabled={disabled || isSaving} onChange={setMarks} error={!validMarks} helperText={`0–${answer.max_marks}, in 0.5 increments`} /></Box><TextField size="small" label="Reason for override" value={reason} onChange={(event) => setReason(event.target.value)} disabled={disabled || isSaving} required error={!reason.trim()} helperText="Required when changing the suggested marks" sx={{ minWidth: 230 }} /></>}
            {!editing ? <Button variant="outlined" onClick={() => { setMarks(initialMarks); setEditing(true); }} disabled={disabled || isSaving || !pendingReview}>Override</Button> : <Button color="inherit" onClick={() => { setEditing(false); setReason(''); }} disabled={isSaving}>Cancel edit</Button>}
            <Button variant="contained" onClick={() => editing ? (validMarks && reason.trim() ? onOverride(marks as number, reason.trim()) : undefined) : (typeof initialMarks === 'number' ? onAccept(initialMarks) : undefined)} disabled={disabled || isSaving || !pendingReview || (editing ? !validMarks || !reason.trim() : typeof initialMarks !== 'number')}>
              {isSaving ? 'Saving…' : editing ? 'Save override' : 'Accept marks'}
            </Button>
          </Stack>}
      </Stack>
    </Paper>
    <Dialog open={imageOpen} onClose={() => setImageOpen(false)} maxWidth="lg"><DialogContent sx={{ p: 1 }}>{imageSrc && <Box component="img" src={imageSrc} alt={`Uploaded answer for question ${answer.question_number}`} sx={{ display: 'block', maxWidth: '90vw', maxHeight: '85vh', objectFit: 'contain' }} />}</DialogContent></Dialog>
  </Stack>;
}
