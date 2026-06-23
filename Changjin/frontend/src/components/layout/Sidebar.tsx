import React from 'react';
import {
  Drawer,
  List,
  ListItem,
  ListItemButton,
  ListItemIcon,
  ListItemText,
  Divider,
  Box,
  Typography,
  useTheme,
  useMediaQuery,
} from '@mui/material';
import {
  Search as SearchIcon,
  History as HistoryIcon,
  Science as ScienceIcon,
  BarChart as BarChartIcon,
  Settings as SettingsIcon,
  Help as HelpIcon,
} from '@mui/icons-material';
import { useSelector, useDispatch } from 'react-redux';
import type { RootState } from '../../store/store';
import { setSidebarOpen } from '../../store/slices/uiSlice';

const DRAWER_WIDTH = 240;

export const Sidebar: React.FC = () => {
  const theme = useTheme();
  const isMobile = useMediaQuery(theme.breakpoints.down('md'));
  const dispatch = useDispatch();

  const sidebarOpen = useSelector((state: RootState) => state.ui.sidebarOpen);

  const handleSidebarClose = () => {
    if (isMobile) {
      dispatch(setSidebarOpen(false));
    }
  };

  const menuItems = [
    {
      text: 'Search',
      icon: <SearchIcon />,
      path: '/search',
      description: 'Search for similar compounds',
    },
    {
      text: 'History',
      icon: <HistoryIcon />,
      path: '/history',
      description: 'Recent searches and favorites',
    },
    {
      text: 'Analysis',
      icon: <BarChartIcon />,
      path: '/analysis',
      description: 'Property analysis and charts',
    },
  ];

  const settingsItems = [
    {
      text: 'Settings',
      icon: <SettingsIcon />,
      path: '/settings',
      description: 'Application settings',
    },
    {
      text: 'Help',
      icon: <HelpIcon />,
      path: '/help',
      description: 'Documentation and support',
    },
  ];

  const drawer = (
    <Box sx={{ width: DRAWER_WIDTH }}>
      {/* Logo/Brand Section */}
      <Box
        sx={{
          p: 3,
          display: 'flex',
          alignItems: 'center',
          gap: 2,
          borderBottom: `1px solid ${theme.palette.divider}`,
        }}
      >
        <ScienceIcon
          sx={{
            fontSize: 32,
            color: theme.palette.primary.main,
          }}
        />
        <Box>
          <Typography variant="h6" sx={{ fontWeight: 600 }}>
            ChemSearch
          </Typography>
          <Typography variant="caption" color="text.secondary">
            Molecular Discovery
          </Typography>
        </Box>
      </Box>

      {/* Main Navigation */}
      <List sx={{ pt: 1 }}>
        {menuItems.map((item) => (
          <ListItem key={item.text} disablePadding>
            <ListItemButton
              onClick={handleSidebarClose}
              sx={{
                mx: 1,
                borderRadius: 2,
                '&:hover': {
                  backgroundColor: theme.palette.primary.main + '10',
                },
              }}
            >
              <ListItemIcon sx={{ color: theme.palette.primary.main }}>
                {item.icon}
              </ListItemIcon>
              <Box sx={{ flexGrow: 1 }}>
                <ListItemText
                  primary={item.text}
                  primaryTypographyProps={{
                    fontWeight: 500,
                  }}
                />
                <Typography variant="caption" color="text.secondary">
                  {item.description}
                </Typography>
              </Box>
            </ListItemButton>
          </ListItem>
        ))}
      </List>

      <Divider sx={{ my: 2 }} />

      {/* Settings Section */}
      <List>
        {settingsItems.map((item) => (
          <ListItem key={item.text} disablePadding>
            <ListItemButton
              onClick={handleSidebarClose}
              sx={{
                mx: 1,
                borderRadius: 2,
                '&:hover': {
                  backgroundColor: theme.palette.grey[100],
                },
              }}
            >
              <ListItemIcon sx={{ color: theme.palette.text.secondary }}>
                {item.icon}
              </ListItemIcon>
              <Box sx={{ flexGrow: 1 }}>
                <ListItemText
                  primary={item.text}
                  primaryTypographyProps={{
                    color: 'text.secondary',
                  }}
                />
                <Typography variant="caption" color="text.secondary">
                  {item.description}
                </Typography>
              </Box>
            </ListItemButton>
          </ListItem>
        ))}
      </List>

      {/* Footer */}
      <Box
        sx={{
          position: 'absolute',
          bottom: 0,
          left: 0,
          right: 0,
          p: 2,
          borderTop: `1px solid ${theme.palette.divider}`,
          backgroundColor: theme.palette.background.paper,
        }}
      >
        <Typography variant="caption" color="text.secondary" align="center" display="block">
          Version 1.0.0
        </Typography>
      </Box>
    </Box>
  );

  return (
    <>
      {/* Mobile backdrop */}
      {isMobile && sidebarOpen && (
        <Box
          sx={{
            position: 'fixed',
            top: 0,
            left: 0,
            right: 0,
            bottom: 0,
            backgroundColor: 'rgba(0, 0, 0, 0.5)',
            zIndex: theme.zIndex.drawer - 1,
          }}
          onClick={handleSidebarClose}
        />
      )}

      <Drawer
        variant={isMobile ? 'temporary' : 'persistent'}
        open={sidebarOpen}
        onClose={handleSidebarClose}
        sx={{
          width: DRAWER_WIDTH,
          flexShrink: 0,
          '& .MuiDrawer-paper': {
            width: DRAWER_WIDTH,
            boxSizing: 'border-box',
            borderRight: `1px solid ${theme.palette.divider}`,
          },
        }}
        ModalProps={{
          keepMounted: true, // Better open performance on mobile.
        }}
      >
        {drawer}
      </Drawer>
    </>
  );
};
