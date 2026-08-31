import React from 'react';
import {
  AppBar,
  Toolbar,
  Typography,
  Button,
  Box,
  Container,
  IconButton,
  Tooltip,
  useTheme,
  useMediaQuery,
  alpha,
} from '@mui/material';
import {
  Search as SearchIcon,
  History as HistoryIcon,
  SavingsOutlined as SavingsIcon,
  DarkModeOutlined as DarkModeIcon,
  LightModeOutlined as LightModeIcon,
} from '@mui/icons-material';
import { useNavigate, useLocation } from 'react-router-dom';
import { useDispatch, useSelector } from 'react-redux';
import type { RootState } from '../../store/store';
import { setTheme } from '../../store/slices/uiSlice';
import { brand } from '../../styles/theme';

interface HeaderProps {
  onSearchClick?: () => void;
}

const BrandMark: React.FC = () => (
  <Box
    aria-hidden
    sx={{
      width: 32,
      height: 32,
      borderRadius: '9px',
      background: brand.gradient,
      display: 'flex',
      alignItems: 'center',
      justifyContent: 'center',
      flexShrink: 0,
      boxShadow: '0 2px 8px rgba(99,102,241,0.35)',
    }}
  >
    <svg width="18" height="18" viewBox="0 0 32 32" fill="none">
      <circle cx="12" cy="12" r="3.2" stroke="#fff" strokeWidth="2.4" />
      <circle cx="21" cy="20" r="3.2" stroke="#fff" strokeWidth="2.4" />
      <line
        x1="14.3"
        y1="14.3"
        x2="18.7"
        y2="17.7"
        stroke="#fff"
        strokeWidth="2.4"
        strokeLinecap="round"
      />
    </svg>
  </Box>
);

export const Header: React.FC<HeaderProps> = ({ onSearchClick }) => {
  const theme = useTheme();
  const isMobile = useMediaQuery(theme.breakpoints.down('sm'));
  const navigate = useNavigate();
  const location = useLocation();
  const dispatch = useDispatch();
  const themeMode = useSelector((state: RootState) => state.ui.theme);

  const isLight = themeMode === 'light';
  const isActive = (path: string) =>
    path === '/history'
      ? location.pathname === '/history'
      : location.pathname === '/' || location.pathname === '/search';

  const navButtonSx = (active: boolean) => ({
    borderRadius: 999,
    px: 2,
    textTransform: 'none' as const,
    fontWeight: 600,
    fontSize: '0.875rem',
    color: active ? 'text.primary' : 'text.secondary',
    backgroundColor: active
      ? alpha(theme.palette.primary.main, isLight ? 0.08 : 0.18)
      : 'transparent',
    '&:hover': {
      backgroundColor: alpha(theme.palette.primary.main, isLight ? 0.06 : 0.14),
      color: 'text.primary',
    },
  });

  return (
    <AppBar
      position="sticky"
      elevation={0}
      color="transparent"
      sx={{
        backdropFilter: 'blur(16px) saturate(1.6)',
        WebkitBackdropFilter: 'blur(16px) saturate(1.6)',
        backgroundColor: isLight
          ? 'rgba(247,247,245,0.78)'
          : 'rgba(14,14,18,0.72)',
        borderBottom: `1px solid ${theme.palette.divider}`,
      }}
    >
      <Container maxWidth="lg" disableGutters sx={{ px: { xs: 2.5, sm: 4 } }}>
        <Toolbar disableGutters sx={{ minHeight: { xs: 60, md: 68 }, gap: 1 }}>
          {/* Brand */}
          <Box
            role="link"
            tabIndex={0}
            aria-label="ChemSearch home"
            onClick={() => navigate('/')}
            onKeyDown={(e) => e.key === 'Enter' && navigate('/')}
            sx={{
              display: 'flex',
              alignItems: 'center',
              gap: 1.25,
              cursor: 'pointer',
              mr: 'auto',
              userSelect: 'none',
            }}
          >
            <BrandMark />
            <Box sx={{ display: { xs: 'none', sm: 'block' } }}>
              <Typography
                variant="subtitle1"
                component="span"
                sx={{
                  fontWeight: 700,
                  letterSpacing: '-0.02em',
                  color: 'text.primary',
                  lineHeight: 1.1,
                  display: 'block',
                }}
              >
                ChemSearch
              </Typography>
              <Typography
                variant="caption"
                sx={{ color: 'text.secondary', lineHeight: 1, display: 'block' }}
              >
                Molecular Discovery
              </Typography>
            </Box>
          </Box>

          {/* Navigation */}
          <Box component="nav" aria-label="Main" sx={{ display: 'flex', gap: 0.5 }}>
            <Button
              startIcon={!isMobile ? <SearchIcon fontSize="small" /> : undefined}
              onClick={onSearchClick ?? (() => navigate('/search'))}
              sx={navButtonSx(isActive('/search'))}
            >
              Search
            </Button>
            <Button
              startIcon={!isMobile ? <SavingsIcon fontSize="small" /> : undefined}
              onClick={() => navigate('/alternatives')}
              sx={navButtonSx(isActive('/alternatives'))}
            >
              Alternatives
            </Button>
            <Button
              startIcon={!isMobile ? <HistoryIcon fontSize="small" /> : undefined}
              onClick={() => navigate('/history')}
              sx={navButtonSx(isActive('/history'))}
            >
              History
            </Button>
          </Box>

          <Tooltip title={isLight ? 'Switch to dark mode' : 'Switch to light mode'}>
            <IconButton
              aria-label={isLight ? 'Switch to dark mode' : 'Switch to light mode'}
              onClick={() => dispatch(setTheme(isLight ? 'dark' : 'light'))}
              sx={{ ml: 0.5, color: 'text.secondary' }}
            >
              {isLight ? (
                <DarkModeIcon fontSize="small" />
              ) : (
                <LightModeIcon fontSize="small" />
              )}
            </IconButton>
          </Tooltip>
        </Toolbar>
      </Container>
    </AppBar>
  );
};
