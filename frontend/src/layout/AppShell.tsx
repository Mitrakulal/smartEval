import AppBar from '@mui/material/AppBar';
import Toolbar from '@mui/material/Toolbar';
import Typography from '@mui/material/Typography';
import Container from '@mui/material/Container';
import Box from '@mui/material/Box';
import Chip from '@mui/material/Chip';
import { Outlet } from 'react-router-dom';
import { NavStepper } from './NavStepper.tsx';
import { useExam } from '../hooks/useExam.ts';
import { RouteErrorBoundary } from '../components/common/RouteErrorBoundary.tsx';
import { isMockMode } from '../api/client.ts';

export function AppShell() {
  const { data: exam } = useExam();

  return (
    <Box sx={{ display: 'flex', flexDirection: 'column', minHeight: '100vh', bgcolor: 'background.default' }}>
      <AppBar position="static" color="default" elevation={1}>
        <Toolbar sx={{ justifyContent: 'space-between' }}>
          <Box sx={{ display: 'flex', alignItems: 'center', gap: 1.5 }}>
            <Typography variant="h6" component="div" sx={{ fontWeight: 700, color: 'primary.main' }}>
              SmartEval
            </Typography>
            {exam?.subject ? (
              <Typography variant="subtitle1" component="span" sx={{ color: 'text.secondary' }}>
                · {exam.subject}
              </Typography>
            ) : null}
          </Box>
          <Box sx={{ display: 'flex', alignItems: 'center', gap: 1 }}>
            {isMockMode && (
              <Chip
                label="Mock Mode"
                size="small"
                color="default"
                variant="outlined"
                sx={{ fontSize: '0.75rem' }}
              />
            )}
            {exam?.state && (
              <Chip
                label={`Status: ${exam.state}`}
                size="small"
                color={
                  exam.state === 'READY'
                    ? 'success'
                    : exam.state === 'FINAL'
                    ? 'primary'
                    : exam.state === 'KEY_PARSED'
                    ? 'warning'
                    : 'default'
                }
                variant="filled"
              />
            )}
          </Box>
        </Toolbar>
      </AppBar>

      <Box sx={{ bgcolor: 'background.paper', borderBottom: 1, borderColor: 'divider', py: 1 }}>
        <Container maxWidth="lg">
          <NavStepper examState={exam?.state} />
        </Container>
      </Box>

      <Container component="main" maxWidth="lg" sx={{ flexGrow: 1, py: 3 }}>
        <RouteErrorBoundary>
          <Outlet />
        </RouteErrorBoundary>
      </Container>
    </Box>
  );
}
