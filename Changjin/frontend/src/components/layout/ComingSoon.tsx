import React from 'react';
import { Box, Typography, Button, useTheme, alpha } from '@mui/material';
import { ConstructionOutlined as ConstructionIcon } from '@mui/icons-material';
import { useNavigate } from 'react-router-dom';

interface ComingSoonProps {
  title: string;
}

export const ComingSoon: React.FC<ComingSoonProps> = ({ title }) => {
  const theme = useTheme();
  const navigate = useNavigate();

  return (
    <Box
      className="anim-fade-up"
      sx={{
        display: 'flex',
        flexDirection: 'column',
        alignItems: 'center',
        justifyContent: 'center',
        py: 12,
        textAlign: 'center',
      }}
    >
      <Box
        sx={{
          width: 72,
          height: 72,
          borderRadius: '22px',
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'center',
          mb: 3,
          backgroundColor: alpha(theme.palette.primary.main, 0.07),
          color: 'primary.main',
        }}
      >
        <ConstructionIcon sx={{ fontSize: 34 }} />
      </Box>
      <Typography variant="h3" component="h1" gutterBottom>
        {title} is coming soon
      </Typography>
      <Typography variant="body1" color="text.secondary" sx={{ maxWidth: 420, mb: 4 }}>
        We're still building this part of ChemSearch. In the meantime, explore
        compound similarity search.
      </Typography>
      <Button variant="contained" onClick={() => navigate('/search')}>
        Back to search
      </Button>
    </Box>
  );
};
