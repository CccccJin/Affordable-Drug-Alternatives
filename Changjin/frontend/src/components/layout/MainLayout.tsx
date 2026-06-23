import React from 'react';
import { ThemeProvider, CssBaseline, Box } from '@mui/material';
import { useSelector } from 'react-redux';
import type { RootState } from '../../store/store';
import { createAppTheme } from '../../styles/theme';
import { Header } from './Header';

interface MainLayoutProps {
  children: React.ReactNode;
}

export const MainLayout: React.FC<MainLayoutProps> = ({ children }) => {
  const themeMode = useSelector((state: RootState) => state.ui.theme);

  const theme = React.useMemo(() => createAppTheme(themeMode), [themeMode]);

  const handleNewSearch = React.useCallback(() => {
    // Clear current search state
    // dispatch(clearSearch());
    // Clear results state
    // dispatch(clearResults());
    // For now, just navigate to search form
    window.location.href = '/search';
  }, []);

  return (
    <ThemeProvider theme={theme}>
      <CssBaseline />
      <Box sx={{ display: 'flex', flexDirection: 'column', minHeight: '100vh' }}>
        <Header onSearchClick={handleNewSearch} />

        <Box
          component="main"
          sx={{
            flexGrow: 1,
            p: 3,
            backgroundColor: theme.palette.background.default,
          }}
        >
          {children}
        </Box>
      </Box>
    </ThemeProvider>
  );
};
