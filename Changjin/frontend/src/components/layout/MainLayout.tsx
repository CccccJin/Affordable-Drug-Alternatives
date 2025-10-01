import React from 'react';
import { ThemeProvider, CssBaseline, Box, useMediaQuery } from '@mui/material';
import { useSelector } from 'react-redux';
import { useNavigate } from 'react-router-dom';
import { useDispatch } from 'react-redux';
import type { RootState } from '../../store/store';
import { createAppTheme } from '../../styles/theme';
import { Header } from './Header';
import { Sidebar } from './Sidebar';
import { clearSearch } from '../../store/slices/searchSlice';
import { clearResults } from '../../store/slices/resultsSlice';

interface MainLayoutProps {
  children: React.ReactNode;
}

export const MainLayout: React.FC<MainLayoutProps> = ({ children }) => {
  const themeMode = useSelector((state: RootState) => state.ui.theme);
  const sidebarOpen = useSelector((state: RootState) => state.ui.sidebarOpen);
  const isMobile = useMediaQuery('(max-width:900px)');
  const navigate = useNavigate();
  const dispatch = useDispatch();

  const theme = React.useMemo(() => createAppTheme(themeMode), [themeMode]);

  const handleNewSearch = React.useCallback(() => {
    // Clear current search state
    dispatch(clearSearch());
    // Clear results state
    dispatch(clearResults());
    // Navigate to search form
    navigate('/search');
  }, [dispatch, navigate]);

  // Handle sidebar state for mobile
  React.useEffect(() => {
    if (isMobile && sidebarOpen) {
      // Close sidebar on mobile when clicking outside
      const handleClickOutside = () => {
        // This would need to be implemented with a ref
      };
      document.addEventListener('mousedown', handleClickOutside);
      return () => document.removeEventListener('mousedown', handleClickOutside);
    }
  }, [isMobile, sidebarOpen]);

  return (
    <ThemeProvider theme={theme}>
      <CssBaseline />
      <Box sx={{ display: 'flex', minHeight: '100vh' }}>
        <Sidebar />

        <Box
          component="main"
          sx={{
            flexGrow: 1,
            display: 'flex',
            flexDirection: 'column',
            marginLeft: !isMobile && sidebarOpen ? '240px' : 0,
            transition: theme.transitions.create(['margin'], {
              easing: theme.transitions.easing.sharp,
              duration: theme.transitions.duration.leavingScreen,
            }),
          }}
        >
          <Header onSearchClick={handleNewSearch} />

          <Box
            sx={{
              flexGrow: 1,
              p: 3,
              backgroundColor: theme.palette.background.default,
            }}
          >
            {children}
          </Box>
        </Box>
      </Box>
    </ThemeProvider>
  );
};
