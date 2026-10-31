import Box from '@mui/material/Box';
import Typography from '@mui/material/Typography';
import Paper from '@mui/material/Paper';

/**
 * Evaluate screen placeholder.
 * This route and its components are owned by F2.
 */
export function Evaluate() {
  return (
    <Box sx={{ py: 4 }}>
      <Paper sx={{ p: 4, textAlign: 'center' }}>
        <Typography variant="h5" gutterBottom>
          Evaluate Screen
        </Typography>
        <Typography variant="body1" color="text.secondary">
          This module is assigned to F2 (USN evaluation, photo capture, transcript viewing, scoring review).
        </Typography>
      </Paper>
    </Box>
  );
}
