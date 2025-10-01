import React from 'react';
import {
  AppBar,
  Toolbar,
  Typography,
  Button,
  Box,
  useTheme,
  useMediaQuery,
} from '@mui/material';
import {
  Science as ScienceIcon,
  Search as SearchIcon,
  History as HistoryIcon,
} from '@mui/icons-material';
import { useNavigate } from 'react-router-dom';

interface HeaderProps {
  onSearchClick?: () => void;
}

export const Header: React.FC<HeaderProps> = ({ onSearchClick }) => {
  const theme = useTheme();
  const isMobile = useMediaQuery(theme.breakpoints.down('md'));
  const navigate = useNavigate();

  const handleHistoryClick = () => {
    navigate('/history');
  };

  return (
    <AppBar position="static" elevation={1}>
      <Toolbar>
        <ScienceIcon sx={{ mr: 2 }} />

        <Typography
          variant="h6"
          component="div"
          sx={{
            flexGrow: 1,
            fontWeight: 600,
            letterSpacing: '-0.5px',
          }}
        >
          Chemical Similarity Search
        </Typography>

        <Box sx={{ display: 'flex', gap: 1 }}>
          <Button
            color="inherit"
            startIcon={<HistoryIcon />}
            onClick={handleHistoryClick}
            sx={{
              borderRadius: 2,
              textTransform: 'none',
              '&:hover': {
                backgroundColor: 'rgba(255, 255, 255, 0.1)',
              },
            }}
          >
            History
          </Button>

          {!isMobile && (
            <Button
              color="inherit"
              startIcon={<SearchIcon />}
              onClick={onSearchClick}
              disabled={!onSearchClick}
              sx={{
                borderRadius: 2,
                textTransform: 'none',
                '&:hover': {
                  backgroundColor: 'rgba(255, 255, 255, 0.1)',
                },
              }}
            >
              New Search
            </Button>
          )}
        </Box>
      </Toolbar>
    </AppBar>
  );
};
