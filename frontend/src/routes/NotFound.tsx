import Box from '@mui/material/Box';
import Typography from '@mui/material/Typography';
import Button from '@mui/material/Button';
import { useNavigate } from 'react-router-dom';

export function NotFound() {
  const navigate = useNavigate();

  return (
    <Box
      sx={{
        display: 'flex',
        flexDirection: 'column',
        alignItems: 'center',
        justifyContent: 'center',
        py: 12,
        textAlign: 'center',
      }}
    >
      <Typography variant="h2" component="h1" sx={{ fontWeight: 700, mb: 1, color: 'text.secondary' }}>
        404
      </Typography>
      <Typography variant="h5" sx={{ mb: 2 }}>
        Page Not Found
      </Typography>
      <Typography variant="body1" color="text.secondary" sx={{ mb: 4 }}>
        The requested URL does not exist in SmartEval.
      </Typography>
      <Button variant="contained" color="primary" onClick={() => navigate('/setup')}>
        Back to Setup
      </Button>
    </Box>
  );
}
