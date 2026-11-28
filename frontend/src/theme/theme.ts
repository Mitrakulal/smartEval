import { createTheme } from '@mui/material/styles';

const INK = '#171A2E';
const MUTED = '#70738C';
const PURPLE = '#6C4CF1';
const NAVY = '#171F36';
const BORDER = '#ECEAF4';
const SOFT_PURPLE = 'rgba(108, 76, 241, 0.08)';

/**
 * SmartEval visual system.
 *
 * Light dashboard canvas, deep navy navigation, violet accents, soft rounded
 * surfaces and compact pill-shaped metadata. The goal is a calm academic tool
 * that still feels modern enough for a live demo.
 */
export const theme = createTheme({
  palette: {
    mode: 'light',
    primary: {
      main: PURPLE,
      light: '#A78BFA',
      dark: '#4C1D95',
      contrastText: '#ffffff',
    },
    secondary: {
      main: NAVY,
      light: '#2A3554',
      dark: '#101526',
      contrastText: '#ffffff',
    },
    background: {
      default: '#F6F5FB',
      paper: '#FFFFFF',
    },
    text: {
      primary: INK,
      secondary: MUTED,
    },
    error: {
      main: '#EF4444',
      light: '#FCA5A5',
      dark: '#B91C1C',
    },
    warning: {
      main: '#F59E0B',
      light: '#FCD34D',
      dark: '#B45309',
    },
    success: {
      main: '#22C55E',
      light: '#86EFAC',
      dark: '#15803D',
    },
    info: {
      main: '#7C6CF6',
      light: '#C4B5FD',
      dark: '#5B21B6',
    },
    divider: BORDER,
    action: {
      hover: 'rgba(108, 76, 241, 0.06)',
      selected: 'rgba(108, 76, 241, 0.10)',
      disabledBackground: '#F1EFF8',
    },
  },
  shape: {
    borderRadius: 14,
  },
  typography: {
    fontFamily: [
      '"Plus Jakarta Sans"',
      'Inter',
      '-apple-system',
      'BlinkMacSystemFont',
      '"Segoe UI"',
      'Roboto',
      '"Helvetica Neue"',
      'Arial',
      'sans-serif',
    ].join(','),
    h3: {
      fontWeight: 800,
      letterSpacing: '-0.04em',
    },
    h4: {
      fontWeight: 800,
      letterSpacing: '-0.04em',
    },
    h5: {
      fontWeight: 800,
      letterSpacing: '-0.035em',
    },
    h6: {
      fontWeight: 700,
      letterSpacing: '-0.02em',
    },
    subtitle1: {
      fontWeight: 700,
      color: INK,
    },
    subtitle2: {
      fontWeight: 600,
      color: '#5F627B',
    },
    body1: {
      fontSize: '0.9375rem',
      lineHeight: 1.55,
    },
    body2: {
      fontSize: '0.875rem',
      lineHeight: 1.55,
    },
    button: {
      textTransform: 'none',
      fontWeight: 700,
      letterSpacing: 0,
    },
    overline: {
      fontWeight: 800,
      letterSpacing: '0.12em',
    },
  },
  components: {
    MuiCssBaseline: {
      styleOverrides: {
        body: {
          backgroundColor: '#F6F5FB',
          backgroundImage:
            'radial-gradient(circle at 12% -4%, rgba(124, 92, 255, 0.10), transparent 32%), radial-gradient(circle at 96% 4%, rgba(167, 139, 250, 0.09), transparent 28%)',
          backgroundAttachment: 'fixed',
        },
        '*::selection': {
          backgroundColor: 'rgba(108, 76, 241, 0.20)',
        },
        '*::-webkit-scrollbar': {
          width: 8,
          height: 8,
        },
        '*::-webkit-scrollbar-thumb': {
          backgroundColor: '#D8D3E8',
          borderRadius: 999,
        },
        '*::-webkit-scrollbar-track': {
          backgroundColor: 'transparent',
        },
      },
    },
    MuiButton: {
      defaultProps: {
        disableElevation: true,
      },
      styleOverrides: {
        root: {
          borderRadius: 12,
          minHeight: 40,
          paddingInline: 18,
          boxShadow: 'none',
          '&:hover': {
            boxShadow: 'none',
          },
        },
        contained: {
          '&.MuiButton-containedPrimary': {
            background: 'linear-gradient(135deg, #7C5CFF 0%, #5B3DF5 100%)',
            '&:hover': {
              background: 'linear-gradient(135deg, #6D4AFF 0%, #4F32E8 100%)',
              boxShadow: '0 10px 24px rgba(91, 61, 245, 0.24)',
            },
          },
        },
        outlined: {
          borderColor: '#DCD8EE',
          '&:hover': {
            borderColor: PURPLE,
            backgroundColor: 'rgba(108, 76, 241, 0.04)',
          },
        },
      },
    },
    MuiPaper: {
      styleOverrides: {
        root: {
          backgroundImage: 'none',
          borderRadius: 18,
        },
        outlined: {
          borderColor: BORDER,
        },
        elevation1: {
          border: `1px solid ${BORDER}`,
          boxShadow: '0 12px 32px rgba(23, 26, 46, 0.05)',
        },
        elevation2: {
          border: `1px solid ${BORDER}`,
          boxShadow: '0 18px 44px rgba(23, 26, 46, 0.08)',
        },
      },
    },
    MuiChip: {
      styleOverrides: {
        root: {
          borderRadius: 999,
          fontWeight: 600,
        },
        outlined: {
          borderColor: '#DCD8EE',
        },
      },
    },
    MuiOutlinedInput: {
      styleOverrides: {
        root: {
          borderRadius: 12,
          backgroundColor: '#FFFFFF',
          '&:hover .MuiOutlinedInput-notchedOutline': {
            borderColor: '#C9C2E8',
          },
          '&.Mui-focused .MuiOutlinedInput-notchedOutline': {
            borderColor: PURPLE,
            borderWidth: 2,
          },
        },
        notchedOutline: {
          borderColor: '#E2DEF0',
        },
      },
    },
    MuiInputLabel: {
      styleOverrides: {
        root: {
          color: MUTED,
        },
      },
    },
    MuiTableCell: {
      styleOverrides: {
        root: {
          borderBottomColor: BORDER,
          paddingTop: 14,
          paddingBottom: 14,
        },
        head: {
          color: MUTED,
          fontSize: '0.72rem',
          fontWeight: 800,
          letterSpacing: '0.06em',
          textTransform: 'uppercase',
        },
      },
    },
    MuiTableRow: {
      styleOverrides: {
        root: {
          '&.MuiTableRow-hover:hover': {
            backgroundColor: 'rgba(108, 76, 241, 0.04)',
          },
        },
      },
    },
    MuiTableHead: {
      styleOverrides: {
        root: {
          backgroundColor: '#F8F7FD',
        },
      },
    },
    MuiTableFooter: {
      styleOverrides: {
        root: {
          backgroundColor: '#F8F7FD',
        },
      },
    },
    MuiDialog: {
      styleOverrides: {
        paper: {
          borderRadius: 22,
          boxShadow: '0 28px 80px rgba(23, 26, 46, 0.20)',
        },
      },
    },
    MuiAlert: {
      styleOverrides: {
        root: {
          borderRadius: 14,
        },
      },
    },
    MuiLinearProgress: {
      styleOverrides: {
        root: {
          borderRadius: 999,
        },
        bar: {
          borderRadius: 999,
        },
      },
    },
    MuiSlider: {
      styleOverrides: {
        root: {
          color: PURPLE,
        },
        thumb: {
          boxShadow: '0 4px 12px rgba(108, 76, 241, 0.32)',
        },
      },
    },
    MuiTooltip: {
      styleOverrides: {
        tooltip: {
          backgroundColor: INK,
          borderRadius: 10,
          fontSize: '0.75rem',
          padding: '8px 10px',
        },
      },
    },
    MuiListItemButton: {
      styleOverrides: {
        root: {
          borderRadius: 12,
        },
      },
    },
    MuiAvatar: {
      styleOverrides: {
        root: {
          fontWeight: 800,
        },
      },
    },
    MuiDivider: {
      styleOverrides: {
        root: {
          borderColor: BORDER,
        },
      },
    },
  },
});

export const softPurple = SOFT_PURPLE;
