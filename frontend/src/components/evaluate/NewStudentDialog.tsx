import { useState } from 'react';
import Dialog from '@mui/material/Dialog';
import DialogTitle from '@mui/material/DialogTitle';
import DialogContent from '@mui/material/DialogContent';
import DialogActions from '@mui/material/DialogActions';
import TextField from '@mui/material/TextField';
import Button from '@mui/material/Button';
import Box from '@mui/material/Box';
import CircularProgress from '@mui/material/CircularProgress';

interface NewStudentDialogProps {
  open: boolean;
  isLoading: boolean;
  onClose: () => void;
  onSubmit: (data: { usn: string; name: string }) => void;
}

export function NewStudentDialog({ open, isLoading, onClose, onSubmit }: NewStudentDialogProps) {
  const [usn, setUsn] = useState('');
  const [name, setName] = useState('');
  const [touched, setTouched] = useState(false);

  const isValidUsn = usn.trim().length >= 4;

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (!isValidUsn) {
      setTouched(true);
      return;
    }
    onSubmit({ usn: usn.trim(), name: name.trim() });
    setUsn('');
    setName('');
    setTouched(false);
  };

  return (
    <Dialog open={open} onClose={onClose} maxWidth="xs" fullWidth>
      <form onSubmit={handleSubmit}>
        <DialogTitle sx={{ fontWeight: 700, pb: 1 }}>Add New Student</DialogTitle>
        <DialogContent dividers>
          <Box sx={{ display: 'flex', flexDirection: 'column', gap: 2, pt: 1 }}>
            <TextField
              label="University Seat Number (USN)"
              placeholder="e.g. 4SF24CI001"
              variant="outlined"
              size="small"
              fullWidth
              required
              autoFocus
              value={usn}
              onChange={(e) => setUsn(e.target.value.toUpperCase())}
              error={touched && !isValidUsn}
              helperText={touched && !isValidUsn ? 'USN must be at least 4 characters' : undefined}
            />
            <TextField
              label="Student Name (Optional)"
              placeholder="e.g. Rahul Sharma"
              variant="outlined"
              size="small"
              fullWidth
              value={name}
              onChange={(e) => setName(e.target.value)}
            />
          </Box>
        </DialogContent>
        <DialogActions sx={{ p: 2 }}>
          <Button onClick={onClose} disabled={isLoading} color="inherit">
            Cancel
          </Button>
          <Button
            type="submit"
            variant="contained"
            color="primary"
            disabled={!isValidUsn || isLoading}
            startIcon={isLoading ? <CircularProgress size={16} color="inherit" /> : undefined}
          >
            {isLoading ? 'Adding...' : 'Add Student'}
          </Button>
        </DialogActions>
      </form>
    </Dialog>
  );
}
