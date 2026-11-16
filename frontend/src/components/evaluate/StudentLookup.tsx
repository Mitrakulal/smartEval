import { useState } from 'react';
import Alert from '@mui/material/Alert';
import Button from '@mui/material/Button';
import Dialog from '@mui/material/Dialog';
import DialogActions from '@mui/material/DialogActions';
import DialogContent from '@mui/material/DialogContent';
import DialogContentText from '@mui/material/DialogContentText';
import DialogTitle from '@mui/material/DialogTitle';
import TextField from '@mui/material/TextField';
import { getApiErrorCode, getApiErrorMessage } from '../../api/evaluateClient.ts';
import type { StudentSummary } from '../../api/types.ts';

interface Props { open: boolean; isSaving: boolean; onClose: () => void; onCreate: (usn: string, name: string, replace: boolean) => Promise<StudentSummary>; onCreated: (student: StudentSummary) => void }

export function StudentLookup({ open, isSaving, onClose, onCreate, onCreated }: Props) {
  const [usn, setUsn] = useState('');
  const [name, setName] = useState('');
  const [error, setError] = useState('');
  const [duplicate, setDuplicate] = useState(false);
  const submit = async (replace = false) => {
    const normalized = usn.trim().toUpperCase();
    if (!normalized) { setError('Enter a USN to continue.'); return; }
    setError('');
    try {
      const student = await onCreate(normalized, name.trim(), replace);
      onCreated(student); setUsn(''); setName(''); setDuplicate(false); onClose();
    } catch (reason: unknown) {
      setError(getApiErrorMessage(reason)); setDuplicate(getApiErrorCode(reason) === 'DUPLICATE_USN');
    }
  };
  return <Dialog open={open} onClose={onClose} maxWidth="xs" fullWidth>
    <DialogTitle>{duplicate ? 'USN already exists' : 'Add student'}</DialogTitle>
    <DialogContent>
      {duplicate ? <Alert severity="warning" sx={{ mb: 2 }}>Replacing this student will replace their existing results.</Alert> : <DialogContentText sx={{ mb: 2 }}>Enter the student’s USN and optionally their name.</DialogContentText>}
      {error && !duplicate && <Alert severity="error" sx={{ mb: 2 }}>{error}</Alert>}
      <TextField autoFocus fullWidth required label="USN" value={usn} onChange={(event) => setUsn(event.target.value)} disabled={duplicate || isSaving} sx={{ mb: 2 }} />
      {!duplicate && <TextField fullWidth label="Name (optional)" value={name} onChange={(event) => setName(event.target.value)} disabled={isSaving} />}
      {duplicate && <DialogContentText>{error} Replace the record and its results?</DialogContentText>}
    </DialogContent>
    <DialogActions sx={{ px: 3, pb: 2 }}>
      <Button color="inherit" onClick={() => { setDuplicate(false); setError(''); onClose(); }} disabled={isSaving}>Cancel</Button>
      {duplicate ? <Button color="error" variant="contained" onClick={() => void submit(true)} disabled={isSaving}>Replace results</Button> : <Button variant="contained" onClick={() => void submit()} disabled={isSaving}>{isSaving ? 'Adding…' : 'Add student'}</Button>}
    </DialogActions>
  </Dialog>;
}
