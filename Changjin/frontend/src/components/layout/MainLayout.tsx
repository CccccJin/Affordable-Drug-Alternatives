import React from 'react';
import { ThemeProvider, CssBaseline, Box, Container } from '@mui/material';
import { useSelector } from 'react-redux';
import { useLocation, useNavigate } from 'react-router-dom';
import type { RootState } from '../../store/store';
import { createAppTheme } from '../../styles/theme';
import { Header } from './Header';
import { Footer } from './Footer';

interface MainLayoutProps {
  children: React.ReactNode;
}

export const MainLayout: React.FC<MainLayoutProps> = ({ children }) => {
  const themeMode = useSelector((state: RootState) => state.ui.theme);
  const navigate = useNavigate();
  const location = useLocation();

  const theme = React.useMemo(() => createAppTheme(themeMode), [themeMode]);
  const isLanding = location.pathname === '/' || location.pathname === '/search';

  const handleNewSearch = React.useCallback(() => {
    navigate('/search');
  }, [navigate]);

  return (
    <ThemeProvider theme={theme}>
      <CssBaseline />
      <Box
        sx={{
          display: 'flex',
          flexDirection: 'column',
          minHeight: '100vh',
          position: 'relative',
          isolation: 'isolate',
          overflow: 'clip',
        }}
      >
        {/* Ambient background: soft drifting gradient orbs */}
        <Box
          aria-hidden
          sx={{
            position: 'fixed',
            inset: 0,
            zIndex: -1,
            pointerEvents: 'none',
            overflow: 'hidden',
            '&::before, &::after': {
              content: '""',
              position: 'absolute',
              borderRadius: '50%',
              filter: 'blur(90px)',
              animation: 'gradient-drift 24s ease-in-out infinite',
            },
            '&::before': {
              width: 560,
              height: 560,
              top: -220,
              right: -140,
              background:
                themeMode === 'light'
                  ? 'radial-gradient(circle, rgba(47,143,158,0.16), transparent 65%)'
                  : 'radial-gradient(circle, rgba(47,143,158,0.20), transparent 65%)',
            },
            '&::after': {
              width: 480,
              height: 480,
              bottom: -200,
              left: -160,
              background:
                themeMode === 'light'
                  ? 'radial-gradient(circle, rgba(75,149,138,0.10), transparent 65%)'
                  : 'radial-gradient(circle, rgba(75,149,138,0.14), transparent 65%)',
              animationDelay: '-12s',
            },
          }}
        />

        <Header onSearchClick={handleNewSearch} />

        <Container
          maxWidth={isLanding ? false : 'lg'}
          component="main"
          sx={{
            flexGrow: 1,
            width: '100%',
            px: isLanding ? 0 : { xs: 2.5, sm: 4 },
            py: isLanding ? 0 : { xs: 4, md: 6 },
          }}
        >
          {children}
        </Container>

        <Footer />
      </Box>
    </ThemeProvider>
  );
};
