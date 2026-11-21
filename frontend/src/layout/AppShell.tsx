import AppBar from '@mui/material/AppBar';
import Toolbar from '@mui/material/Toolbar';
import Typography from '@mui/material/Typography';
import Container from '@mui/material/Container';
import Box from '@mui/material/Box';
import Chip from '@mui/material/Chip';
import AutoStoriesIcon from '@mui/icons-material/AutoStories';
import CircleIcon from '@mui/icons-material/Circle';
import { Outlet } from 'react-router-dom';
import { NavStepper } from './NavStepper.tsx';
import { useExam } from '../hooks/useExam.ts';
import { RouteErrorBoundary } from '../components/common/RouteErrorBoundary.tsx';
import { isMockMode } from '../api/client.ts';

export function AppShell() {
  const { data: exam } = useExam();

  return (
    <Box sx={{ display: 'flex', flexDirection: 'column', minHeight: '100vh', bgcolor: 'background.default' }}>
      <AppBar
        position="sticky"
        color="inherit"
        elevation={0}
        sx={{
          bgcolor: 'background.paper',
          borderBottom: '1px solid',
          borderColor: 'divider',
        }}
      >
        <Toolbar sx={{ justifyContent: 'space-between', minHeight: { xs: 56, sm: 64 } }}>
          <Box sx={{ display: 'flex', alignItems: 'center', gap: 1.5 }}>
            <Box
              sx={{
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'center',
                width: 36,
                height: 36,
                borderRadius: 2,
                bgcolor: 'primary.main',
                color: 'primary.contrastText',
              }}
            >
              <AutoStoriesIcon fontSize="small" />
            </Box>
            <Box>
              <Typography variant="h6" component="div" sx={{ fontWeight: 700, color: 'text.primary', lineHeight: 1.2 }}>
                SmartEval
              </Typography>
              {exam?.subject && (
                <Typography variant="caption" sx={{ color: 'text.secondary', fontWeight: 500 }}>
                  {exam.subject}
                </Typography>
              )}
            </Box>
          </Box>
          <Box sx={{ display: 'flex', alignItems: 'center', gap: 1 }}>
            {isMockMode && (
              <Chip
                label="Mock Mode"
                size="small"
                color="secondary"
                variant="outlined"
                sx={{ fontSize: '0.75rem', fontWeight: 600 }}
              />
            )}
            {exam?.state && (
              <Chip
                icon={<CircleIcon sx={{ fontSize: '10px !important' }} />}
                label={exam.state.replace('_', ' ')}
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
                variant="outlined"
                sx={{ fontWeight: 600 }}
              />
            )}
          </Box>
        </Toolbar>
      </AppBar>

      <Box sx={{ bgcolor: 'background.paper', borderBottom: '1px solid', borderColor: 'divider', py: 1.5 }}>
        <Container maxWidth="lg">
          <NavStepper examState={exam?.state} />
        </Container>
      </Box>

      <Container component="main" maxWidth="lg" sx={{ flexGrow: 1, py: 4 }}>
        <RouteErrorBoundary>
          <Outlet />
        </RouteErrorBoundary>
      </Container>
    </Box>
  );
}
