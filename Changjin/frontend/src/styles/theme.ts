import { createTheme, alpha, type ThemeOptions } from '@mui/material/styles';

/* ---------------------------------------------------------------------------
   ChemSearch design tokens
   A warm-neutral, premium palette with an indigo→violet accent, inspired by
   modern AI product design: generous whitespace, soft depth, rounded shapes.
--------------------------------------------------------------------------- */

export const brand = {
  indigo: '#4F46E5',
  indigoDark: '#4338CA',
  indigoLight: '#818CF8',
  violet: '#A855F7',
  gradient: 'linear-gradient(135deg, #6366F1 0%, #A855F7 100%)',
  gradientSoft:
    'linear-gradient(135deg, rgba(99,102,241,0.12) 0%, rgba(168,85,247,0.10) 100%)',
};

const ink = {
  primary: '#1A1A1F',
  secondary: '#63635E',
  border: '#E9E8E3',
};

const fontStack = [
  'Inter',
  '-apple-system',
  'BlinkMacSystemFont',
  '"Segoe UI"',
  'Roboto',
  '"Helvetica Neue"',
  'Arial',
  'sans-serif',
].join(',');

export const serifStack = '"Instrument Serif", Georgia, "Times New Roman", serif';
export const monoStack =
  '"SF Mono", ui-monospace, "Cascadia Code", Menlo, Consolas, monospace';

const softShadow = {
  card: '0 1px 2px rgba(16,16,24,0.04), 0 8px 24px rgba(16,16,24,0.06)',
  cardHover: '0 2px 4px rgba(16,16,24,0.06), 0 16px 40px rgba(16,16,24,0.12)',
  dialog: '0 8px 16px rgba(16,16,24,0.08), 0 32px 80px rgba(16,16,24,0.18)',
};

const sharedTypography: ThemeOptions['typography'] = {
  fontFamily: fontStack,
  h1: {
    fontSize: 'clamp(2.5rem, 5vw, 3.75rem)',
    fontWeight: 600,
    letterSpacing: '-0.03em',
    lineHeight: 1.1,
  },
  h2: {
    fontSize: 'clamp(1.9rem, 3.4vw, 2.5rem)',
    fontWeight: 600,
    letterSpacing: '-0.025em',
    lineHeight: 1.15,
  },
  h3: {
    fontSize: '1.6rem',
    fontWeight: 600,
    letterSpacing: '-0.02em',
    lineHeight: 1.25,
  },
  h4: {
    fontSize: '1.35rem',
    fontWeight: 600,
    letterSpacing: '-0.015em',
    lineHeight: 1.3,
  },
  h5: {
    fontSize: '1.125rem',
    fontWeight: 600,
    letterSpacing: '-0.01em',
    lineHeight: 1.35,
  },
  h6: {
    fontSize: '1rem',
    fontWeight: 600,
    letterSpacing: '-0.005em',
    lineHeight: 1.4,
  },
  subtitle1: {
    fontSize: '1.05rem',
    fontWeight: 500,
    lineHeight: 1.5,
  },
  subtitle2: {
    fontSize: '0.875rem',
    fontWeight: 600,
    lineHeight: 1.45,
  },
  body1: {
    fontSize: '1rem',
    lineHeight: 1.65,
  },
  body2: {
    fontSize: '0.875rem',
    lineHeight: 1.6,
  },
  caption: {
    fontSize: '0.75rem',
    lineHeight: 1.5,
    letterSpacing: '0.01em',
  },
  overline: {
    fontSize: '0.7rem',
    fontWeight: 600,
    letterSpacing: '0.12em',
    textTransform: 'uppercase' as const,
  },
  button: {
    fontWeight: 600,
    letterSpacing: '0.005em',
  },
};

const buildComponents = (mode: 'light' | 'dark'): ThemeOptions['components'] => {
  const isLight = mode === 'light';
  const divider = isLight ? ink.border : 'rgba(255,255,255,0.09)';
  const paper = isLight ? '#FFFFFF' : '#17171C';

  return {
    MuiCssBaseline: {
      styleOverrides: {
        body: {
          backgroundColor: isLight ? '#F7F7F5' : '#0E0E12',
        },
      },
    },
    MuiButton: {
      defaultProps: {
        disableElevation: true,
      },
      styleOverrides: {
        root: {
          textTransform: 'none',
          borderRadius: 10,
          fontWeight: 600,
          transition:
            'transform 0.18s cubic-bezier(0.22,1,0.36,1), box-shadow 0.18s ease, background-color 0.18s ease, border-color 0.18s ease',
          '&:active': {
            transform: 'scale(0.98)',
          },
        },
        sizeLarge: {
          padding: '12px 28px',
          fontSize: '1rem',
          borderRadius: 12,
        },
        containedPrimary: {
          background: brand.gradient,
          color: '#fff',
          boxShadow: '0 2px 8px rgba(99,102,241,0.35)',
          '&:hover': {
            background: brand.gradient,
            boxShadow: '0 4px 16px rgba(99,102,241,0.45)',
            transform: 'translateY(-1px)',
          },
          '&.Mui-disabled': {
            background: isLight ? '#E5E5E0' : 'rgba(255,255,255,0.08)',
            color: isLight ? '#A3A39E' : 'rgba(255,255,255,0.3)',
            boxShadow: 'none',
          },
        },
        outlined: {
          borderColor: divider,
          '&:hover': {
            borderColor: brand.indigoLight,
            backgroundColor: alpha(brand.indigo, 0.04),
          },
        },
      },
    },
    MuiCard: {
      styleOverrides: {
        root: {
          borderRadius: 16,
          border: `1px solid ${divider}`,
          boxShadow: softShadow.card,
          backgroundImage: 'none',
          backgroundColor: paper,
        },
      },
    },
    MuiPaper: {
      styleOverrides: {
        root: {
          backgroundImage: 'none',
        },
        rounded: {
          borderRadius: 16,
        },
        outlined: {
          borderColor: divider,
        },
      },
    },
    MuiTextField: {
      styleOverrides: {
        root: {
          '& .MuiOutlinedInput-root': {
            borderRadius: 12,
            transition: 'box-shadow 0.2s ease',
            '& fieldset': {
              borderColor: divider,
              transition: 'border-color 0.2s ease',
            },
            '&:hover fieldset': {
              borderColor: isLight ? '#CFCFC8' : 'rgba(255,255,255,0.2)',
            },
            '&.Mui-focused': {
              boxShadow: `0 0 0 4px ${alpha(brand.indigo, 0.12)}`,
            },
            '&.Mui-focused fieldset': {
              borderColor: brand.indigo,
              borderWidth: 1.5,
            },
          },
        },
      },
    },
    MuiChip: {
      styleOverrides: {
        root: {
          borderRadius: 999,
          fontWeight: 500,
        },
      },
    },
    MuiDialog: {
      styleOverrides: {
        paper: {
          borderRadius: 20,
          border: `1px solid ${divider}`,
          boxShadow: softShadow.dialog,
        },
      },
    },
    MuiTabs: {
      styleOverrides: {
        root: {
          minHeight: 44,
        },
        indicator: {
          height: 3,
          borderRadius: 3,
          background: brand.gradient,
        },
      },
    },
    MuiTab: {
      styleOverrides: {
        root: {
          textTransform: 'none',
          fontWeight: 600,
          fontSize: '0.9rem',
          minHeight: 44,
        },
      },
    },
    MuiAlert: {
      styleOverrides: {
        root: {
          borderRadius: 12,
        },
        standardInfo: {
          backgroundColor: isLight ? alpha(brand.indigo, 0.06) : alpha(brand.indigo, 0.15),
          color: isLight ? '#3730A3' : '#C7D2FE',
          '& .MuiAlert-icon': {
            color: brand.indigo,
          },
        },
      },
    },
    MuiTooltip: {
      styleOverrides: {
        tooltip: {
          borderRadius: 8,
          fontSize: '0.75rem',
          fontWeight: 500,
          padding: '6px 12px',
          backgroundColor: isLight ? '#1A1A1F' : '#F2F2F0',
          color: isLight ? '#fff' : '#1A1A1F',
        },
      },
    },
    MuiTableCell: {
      styleOverrides: {
        root: {
          borderColor: divider,
        },
      },
    },
    MuiDivider: {
      styleOverrides: {
        root: {
          borderColor: divider,
        },
      },
    },
    MuiSkeleton: {
      styleOverrides: {
        root: {
          borderRadius: 8,
        },
      },
    },
    MuiPagination: {
      styleOverrides: {
        root: {
          '& .MuiPaginationItem-root': {
            borderRadius: 10,
            fontWeight: 500,
          },
        },
      },
    },
    MuiSwitch: {
      styleOverrides: {
        switchBase: {
          '&.Mui-checked + .MuiSwitch-track': {
            background: brand.gradient,
            opacity: 1,
          },
        },
      },
    },
    MuiLinearProgress: {
      styleOverrides: {
        root: {
          borderRadius: 999,
          height: 6,
        },
      },
    },
  };
};

export const themeOptions: ThemeOptions = {
  palette: {
    mode: 'light',
    primary: {
      main: brand.indigo,
      light: brand.indigoLight,
      dark: brand.indigoDark,
    },
    secondary: {
      main: brand.violet,
      light: '#C084FC',
      dark: '#7E22CE',
    },
    success: {
      main: '#15803D',
      light: '#4ADE80',
      dark: '#166534',
    },
    error: {
      main: '#DC2626',
      light: '#F87171',
      dark: '#B91C1C',
    },
    warning: {
      main: '#B45309',
      light: '#FBBF24',
      dark: '#92400E',
    },
    info: {
      main: '#2563EB',
      light: '#60A5FA',
      dark: '#1D4ED8',
    },
    background: {
      default: '#F7F7F5',
      paper: '#FFFFFF',
    },
    text: {
      primary: ink.primary,
      secondary: ink.secondary,
    },
    divider: ink.border,
  },
  typography: sharedTypography,
  shape: {
    borderRadius: 12,
  },
  components: buildComponents('light'),
};

export const darkThemeOptions: ThemeOptions = {
  ...themeOptions,
  palette: {
    ...themeOptions.palette,
    mode: 'dark',
    background: {
      default: '#0E0E12',
      paper: '#17171C',
    },
    text: {
      primary: '#F2F2F0',
      secondary: '#9C9C97',
    },
    divider: 'rgba(255,255,255,0.09)',
  },
  components: buildComponents('dark'),
};

export const createAppTheme = (mode: 'light' | 'dark' = 'light') => {
  return createTheme(mode === 'light' ? themeOptions : darkThemeOptions);
};
