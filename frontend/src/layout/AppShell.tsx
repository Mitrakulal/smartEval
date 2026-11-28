import { useState } from 'react';
import AppBar from '@mui/material/AppBar';
import Avatar from '@mui/material/Avatar';
import Box from '@mui/material/Box';
import Chip from '@mui/material/Chip';
import Divider from '@mui/material/Divider';
import Drawer from '@mui/material/Drawer';
import IconButton from '@mui/material/IconButton';
import List from '@mui/material/List';
import ListItemButton from '@mui/material/ListItemButton';
import ListItemIcon from '@mui/material/ListItemIcon';
import ListItemText from '@mui/material/ListItemText';
import Toolbar from '@mui/material/Toolbar';
import Tooltip from '@mui/material/Tooltip';
import Typography from '@mui/material/Typography';
import useMediaQuery from '@mui/material/useMediaQuery';
import { useTheme } from '@mui/material/styles';
import AutoStoriesRoundedIcon from '@mui/icons-material/AutoStoriesRounded';
import ChevronRightRoundedIcon from '@mui/icons-material/ChevronRightRounded';
import FactCheckRoundedIcon from '@mui/icons-material/FactCheckRounded';
import MenuRoundedIcon from '@mui/icons-material/MenuRounded';
import TableChartRoundedIcon from '@mui/icons-material/TableChartRounded';
import TuneRoundedIcon from '@mui/icons-material/TuneRounded';
import { Outlet, useLocation, useNavigate } from 'react-router-dom';
import { useExam } from '../hooks/useExam.ts';
import { RouteErrorBoundary } from '../components/common/RouteErrorBoundary.tsx';
import { isMockMode } from '../api/client.ts';
import type { ExamStateName } from '../api/types.ts';

const DRAWER_WIDTH = 272;

interface NavItem {
  label: string;
  route: string;
  caption: string;
  icon: typeof TuneRoundedIcon;
}

const NAV_ITEMS: NavItem[] = [
  {
    label: 'Setup',
    route: '/setup',
    caption: 'Answer key & rules',
    icon: TuneRoundedIcon,
  },
  {
    label: 'Evaluate',
    route: '/evaluate',
    caption: 'Review student scripts',
    icon: FactCheckRoundedIcon,
  },
  {
    label: 'Marksheet',
    route: '/marksheet',
    caption: 'Approve & export',
    icon: TableChartRoundedIcon,
  },
];

const PAGE_META: Record<string, { eyebrow: string; title: string; subtitle: string }> = {
  '/setup': {
    eyebrow: 'Workspace',
    title: 'Exam setup',
    subtitle:
      'Upload the answer key, confirm the question structure, and tune how the AI evaluates each response.',
  },
  '/evaluate': {
    eyebrow: 'Review desk',
    title: 'Answer evaluation',
    subtitle:
      'Check the OCR transcript, inspect semantic matches, and make the final mark call for every question.',
  },
  '/marksheet': {
    eyebrow: 'Results',
    title: 'Marksheet',
    subtitle:
      'Review class performance, resolve flagged answers, and export the final CSV for records.',
  },
};

function stateLabel(state?: ExamStateName): string {
  if (!state) return 'No key';
  return state.replaceAll('_', ' ');
}

function stateStyles(state?: ExamStateName): { bg: string; color: string; border: string } {
  switch (state) {
    case 'READY':
      return {
        bg: 'rgba(34, 197, 94, 0.12)',
        color: '#15803D',
        border: 'rgba(34, 197, 94, 0.22)',
      };
    case 'FINAL':
      return {
        bg: 'rgba(108, 76, 241, 0.12)',
        color: '#5B3DF5',
        border: 'rgba(108, 76, 241, 0.22)',
      };
    case 'KEY_PARSED':
      return {
        bg: 'rgba(245, 158, 11, 0.12)',
        color: '#B45309',
        border: 'rgba(245, 158, 11, 0.22)',
      };
    default:
      return {
        bg: 'rgba(112, 115, 140, 0.10)',
        color: '#5F627B',
        border: 'rgba(112, 115, 140, 0.18)',
      };
  }
}

function StatusChip({ state }: { state?: ExamStateName }) {
  if (!state) return null;
  const colors = stateStyles(state);

  return (
    <Chip
      label={stateLabel(state)}
      size="small"
      sx={{
        bgcolor: colors.bg,
        color: colors.color,
        border: `1px solid ${colors.border}`,
        fontWeight: 700,
        fontSize: '0.68rem',
        textTransform: 'capitalize',
      }}
    />
  );
}

interface SidebarContentProps {
  examState?: ExamStateName;
  subject?: string;
  onNavigate: () => void;
}

function SidebarContent({ examState, subject, onNavigate }: SidebarContentProps) {
  const location = useLocation();
  const navigate = useNavigate();
  const isLocked = examState !== 'READY' && examState !== 'FINAL';

  const goTo = (route: string, disabled: boolean) => {
    if (disabled) return;
    navigate(route);
    onNavigate();
  };

  return (
    <Box sx={{ display: 'flex', flexDirection: 'column', height: '100%', minHeight: 0 }}>
      <Box sx={{ display: 'flex', alignItems: 'center', gap: 1.4, px: 1, pt: 0.5, pb: 3 }}>
        <Box
          sx={{
            width: 42,
            height: 42,
            borderRadius: 2.5,
            display: 'grid',
            placeItems: 'center',
            background: 'linear-gradient(135deg, #8B5CF6 0%, #6D4AFF 100%)',
            boxShadow: '0 10px 24px rgba(7, 10, 25, 0.28)',
            color: '#fff',
            flexShrink: 0,
          }}
        >
          <AutoStoriesRoundedIcon fontSize="small" />
        </Box>
        <Box sx={{ minWidth: 0 }}>
          <Typography
            variant="h6"
            sx={{ color: '#fff', fontWeight: 800, lineHeight: 1.1, letterSpacing: '-0.03em' }}
          >
            SmartEval
          </Typography>
          <Typography
            variant="caption"
            sx={{ color: 'rgba(255,255,255,0.48)', fontWeight: 500, letterSpacing: '0.02em' }}
          >
            Lecturer console
          </Typography>
        </Box>
      </Box>

      <Typography
        variant="overline"
        sx={{
          color: 'rgba(255,255,255,0.34)',
          fontSize: '0.64rem',
          px: 1.25,
          mb: 1,
        }}
      >
        Workspace
      </Typography>

      <List disablePadding>
        {NAV_ITEMS.map((item) => {
          const active = location.pathname.startsWith(item.route);
          const disabled = item.route !== '/setup' && isLocked;
          const Icon = item.icon;

          return (
            <Tooltip
              key={item.route}
              title={disabled ? 'Confirm the answer key in Setup first' : ''}
              placement="right"
              arrow
            >
              <span>
                <ListItemButton
                  selected={active}
                  disabled={disabled}
                  onClick={() => goTo(item.route, disabled)}
                  sx={{
                    px: 1.25,
                    py: 1.05,
                    mb: 0.7,
                    borderRadius: 3,
                    color: active ? '#fff' : 'rgba(255,255,255,0.64)',
                    border: '1px solid',
                    borderColor: active ? 'rgba(255,255,255,0.12)' : 'transparent',
                    transition: 'background-color 160ms ease, color 160ms ease',
                    '&.Mui-selected': {
                      background: 'linear-gradient(135deg, #7C5CFF 0%, #5B3DF5 100%)',
                      boxShadow: '0 12px 28px rgba(7, 10, 25, 0.28)',
                      '&:hover': {
                        background: 'linear-gradient(135deg, #7C5CFF 0%, #5B3DF5 100%)',
                      },
                    },
                    '&:hover': {
                      bgcolor: active ? undefined : 'rgba(255,255,255,0.06)',
                      color: '#fff',
                    },
                    '&.Mui-disabled': {
                      color: 'rgba(255,255,255,0.28)',
                      borderColor: 'transparent',
                    },
                  }}
                >
                  <ListItemIcon
                    sx={{
                      minWidth: 40,
                      color: 'inherit',
                      '& .MuiSvgIcon-root': { fontSize: 21 },
                    }}
                  >
                    <Icon />
                  </ListItemIcon>
                  <ListItemText
                    primary={item.label}
                    secondary={item.caption}
                    slotProps={{
                      primary: {
                        component: 'div',
                        sx: { fontWeight: 700, fontSize: '0.875rem', lineHeight: 1.2 },
                      },
                      secondary: {
                        component: 'div',
                        sx: {
                          color: active ? 'rgba(255,255,255,0.70)' : 'rgba(255,255,255,0.38)',
                          fontSize: '0.68rem',
                          lineHeight: 1.35,
                          mt: 0.25,
                        },
                      },
                    }}
                  />
                  {active && <ChevronRightRoundedIcon sx={{ fontSize: 18, opacity: 0.7 }} />}
                </ListItemButton>
              </span>
            </Tooltip>
          );
        })}
      </List>

      <Box sx={{ mt: 'auto', pt: 3 }}>
        <Divider sx={{ borderColor: 'rgba(255,255,255,0.08)', mb: 2 }} />
        <Box
          sx={{
            p: 1.5,
            borderRadius: 3,
            bgcolor: 'rgba(255,255,255,0.055)',
            border: '1px solid rgba(255,255,255,0.07)',
          }}
        >
          <Typography
            variant="caption"
            sx={{
              display: 'block',
              color: 'rgba(255,255,255,0.38)',
              fontWeight: 700,
              textTransform: 'uppercase',
              letterSpacing: '0.08em',
              fontSize: '0.62rem',
              mb: 0.9,
            }}
          >
            Exam status
          </Typography>
          <Box sx={{ display: 'flex', alignItems: 'center', gap: 0.8, flexWrap: 'wrap' }}>
            <Chip
              label={stateLabel(examState)}
              size="small"
              sx={{
                bgcolor: 'rgba(255,255,255,0.08)',
                color:
                  examState === 'READY'
                    ? '#86EFAC'
                    : examState === 'FINAL'
                    ? '#C4B5FD'
                    : examState === 'KEY_PARSED'
                    ? '#FCD34D'
                    : '#CBD5E1',
                border: '1px solid rgba(255,255,255,0.08)',
                fontWeight: 700,
                fontSize: '0.65rem',
                textTransform: 'capitalize',
              }}
            />
          </Box>
          <Typography
            variant="caption"
            sx={{
              display: 'block',
              mt: 1,
              color: 'rgba(255,255,255,0.52)',
              lineHeight: 1.4,
              overflow: 'hidden',
              textOverflow: 'ellipsis',
              whiteSpace: 'nowrap',
            }}
          >
            {subject || 'No subject configured'}
          </Typography>
        </Box>

        <Box sx={{ display: 'flex', alignItems: 'center', gap: 1.25, px: 1, pt: 2 }}>
          <Avatar
            sx={{
              width: 34,
              height: 34,
              bgcolor: 'rgba(255,255,255,0.10)',
              color: '#fff',
              fontSize: '0.72rem',
            }}
          >
            SE
          </Avatar>
          <Box sx={{ minWidth: 0 }}>
            <Typography
              variant="caption"
              sx={{ display: 'block', color: '#fff', fontWeight: 700, lineHeight: 1.2 }}
            >
              Lecturer review
            </Typography>
            <Typography
              variant="caption"
              sx={{ color: 'rgba(255,255,255,0.40)', fontSize: '0.66rem' }}
            >
              Final authority
            </Typography>
          </Box>
        </Box>
      </Box>
    </Box>
  );
}

export function AppShell() {
  const { data: exam } = useExam();
  const theme = useTheme();
  const isDesktop = useMediaQuery(theme.breakpoints.up('md'));
  const [mobileOpen, setMobileOpen] = useState(false);
  const location = useLocation();

  const meta =
    PAGE_META[Object.keys(PAGE_META).find((path) => location.pathname.startsWith(path)) ?? ''] ??
    PAGE_META['/setup'];

  const drawerPaperSx = {
    width: DRAWER_WIDTH,
    boxSizing: 'border-box',
    border: 0,
    color: '#fff',
    background: 'linear-gradient(180deg, #1A2340 0%, #11172A 100%)',
    p: 2,
    overflowY: 'auto',
  } as const;

  return (
    <Box sx={{ display: 'flex', minHeight: '100vh', bgcolor: 'background.default' }}>
      <Drawer
        variant="permanent"
        sx={{
          display: { xs: 'none', md: 'block' },
          width: DRAWER_WIDTH,
          flexShrink: 0,
          '& .MuiDrawer-paper': drawerPaperSx,
        }}
      >
        <SidebarContent
          examState={exam?.state}
          subject={exam?.subject}
          onNavigate={() => undefined}
        />
      </Drawer>

      <Drawer
        variant="temporary"
        open={mobileOpen}
        onClose={() => setMobileOpen(false)}
        ModalProps={{ keepMounted: true }}
        sx={{
          display: { xs: 'block', md: 'none' },
          '& .MuiDrawer-paper': { ...drawerPaperSx, width: 286 },
        }}
      >
        <SidebarContent
          examState={exam?.state}
          subject={exam?.subject}
          onNavigate={() => setMobileOpen(false)}
        />
      </Drawer>

      <Box sx={{ flex: 1, minWidth: 0, display: 'flex', flexDirection: 'column' }}>
        <AppBar
          position="sticky"
          elevation={0}
          sx={{
            display: { xs: 'block', md: 'none' },
            bgcolor: 'rgba(255,255,255,0.88)',
            backdropFilter: 'blur(18px)',
            borderBottom: '1px solid',
            borderColor: 'divider',
            color: 'text.primary',
          }}
        >
          <Toolbar sx={{ minHeight: 64, gap: 1 }}>
            <IconButton
              edge="start"
              aria-label="Open navigation"
              onClick={() => setMobileOpen(true)}
              sx={{ color: 'text.primary' }}
            >
              <MenuRoundedIcon />
            </IconButton>
            <Box
              sx={{
                width: 34,
                height: 34,
                borderRadius: 2,
                display: 'grid',
                placeItems: 'center',
                background: 'linear-gradient(135deg, #8B5CF6 0%, #6D4AFF 100%)',
                color: '#fff',
              }}
            >
              <AutoStoriesRoundedIcon sx={{ fontSize: 19 }} />
            </Box>
            <Typography variant="subtitle1" sx={{ fontWeight: 800, letterSpacing: '-0.03em' }}>
              SmartEval
            </Typography>
            <Box sx={{ ml: 'auto', display: 'flex', alignItems: 'center', gap: 0.75 }}>
              <StatusChip state={exam?.state} />
              {isMockMode && (
                <Chip
                  label="Mock"
                  size="small"
                  sx={{
                    bgcolor: 'rgba(108,76,241,0.10)',
                    color: 'primary.main',
                    fontWeight: 700,
                    fontSize: '0.66rem',
                  }}
                />
              )}
            </Box>
          </Toolbar>
        </AppBar>

        <Box
          component="main"
          sx={{
            flexGrow: 1,
            width: '100%',
            maxWidth: 1480,
            mx: 'auto',
            px: { xs: 2, sm: 3, lg: 4 },
            py: { xs: 2.5, md: 3.5 },
          }}
        >
          <Box
            sx={{
              display: 'flex',
              alignItems: { xs: 'flex-start', md: 'center' },
              justifyContent: 'space-between',
              flexWrap: 'wrap',
              gap: 2,
              mb: { xs: 2.5, md: 3.5 },
            }}
          >
            <Box>
              <Typography
                variant="overline"
                sx={{ color: 'primary.main', fontSize: '0.68rem', display: 'block' }}
              >
                {meta.eyebrow}
              </Typography>
              <Typography
                variant="h4"
                component="h1"
                sx={{
                  fontWeight: 800,
                  letterSpacing: '-0.045em',
                  lineHeight: 1.12,
                  mt: 0.35,
                  fontSize: { xs: '1.75rem', sm: '2rem', md: '2.2rem' },
                }}
              >
                {meta.title}
              </Typography>
              <Typography
                variant="body2"
                color="text.secondary"
                sx={{ mt: 0.75, maxWidth: 680, lineHeight: 1.6 }}
              >
                {meta.subtitle}
              </Typography>
            </Box>

            <Box
              sx={{
                display: { xs: 'none', md: 'flex' },
                alignItems: 'center',
                gap: 1,
                flexWrap: 'wrap',
              }}
            >
              {isMockMode && (
                <Chip
                  label="Mock data"
                  size="small"
                  sx={{
                    bgcolor: 'rgba(108,76,241,0.10)',
                    color: 'primary.main',
                    fontWeight: 700,
                    fontSize: '0.7rem',
                  }}
                />
              )}
              <StatusChip state={exam?.state} />
              {isDesktop && (
                <Tooltip title="Signed in as lecturer" arrow>
                  <Avatar
                    sx={{
                      width: 42,
                      height: 42,
                      ml: 0.5,
                      background: 'linear-gradient(135deg, #7C5CFF 0%, #5B3DF5 100%)',
                      boxShadow: '0 8px 18px rgba(91, 61, 245, 0.24)',
                      fontSize: '0.78rem',
                    }}
                  >
                    SE
                  </Avatar>
                </Tooltip>
              )}
            </Box>
          </Box>

          <RouteErrorBoundary>
            <Outlet />
          </RouteErrorBoundary>
        </Box>
      </Box>
    </Box>
  );
}
