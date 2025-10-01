import React from 'react';
import {
  AppBar,
  Toolbar,
  Typography,
  Button,
  IconButton,
  Box,
  useTheme,
  useMediaQuery,
} from '@mui/material';
import {
  Menu as MenuIcon,
  Science as ScienceIcon,
  Search as SearchIcon,
} from '@mui/icons-material';
import { useDispatch } from 'react-redux';
import { toggleSidebar } from '../../store/slices/uiSlice';

interface HeaderProps {
  onSearchClick?: () => void;
}

export const Header: React.FC<HeaderProps> = ({ onSearchClick }) => {
  const theme = useTheme();
  const isMobile = useMediaQuery(theme.breakpoints.down('md'));
  const dispatch = useDispatch();

  const handleMenuClick = () => {
    dispatch(toggleSidebar());
  };

  return (
    <AppBar position="static" elevation={1}>
      <Toolbar>
        <IconButton
          edge="start"
          color="inherit"
          onClick={handleMenuClick}
          sx={{ mr: 2 }}
        >
          <MenuIcon />
        </IconButton>

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

          <Button
            color="inherit"
            variant="outlined"
            sx={{
              borderRadius: 2,
              textTransform: 'none',
              ml: 1,
            }}
          >
            Help
          </Button>
        </Box>
      </Toolbar>
    </AppBar>
  );
};
