import Alert from '@mui/material/Alert';
import AlertTitle from '@mui/material/AlertTitle';
import Box from '@mui/material/Box';

interface WarningsListProps {
  warnings: string[];
}

export function WarningsList({ warnings }: WarningsListProps) {
  if (!warnings || warnings.length === 0) return null;

  return (
    <Box sx={{ mb: 2 }}>
      <Alert severity="warning" variant="standard">
        <AlertTitle>Parser Warnings ({warnings.length})</AlertTitle>
        <ul style={{ margin: 0, paddingLeft: 20 }}>
          {warnings.map((w, index) => (
            <li key={index}>{w}</li>
          ))}
        </ul>
      </Alert>
    </Box>
  );
}
