import React from 'react';
import { Paper, Box, Typography, useTheme, alpha } from '@mui/material';

interface ChartCardProps {
  title: string;
  caption: string;
  footnote?: string;
  action?: React.ReactNode;
  children: React.ReactNode;
  delay?: number;
}

export const ChartCard: React.FC<ChartCardProps> = ({
  title,
  caption,
  footnote,
  action,
  children,
  delay = 0,
}) => {
  const theme = useTheme();

  return (
    <Paper
      elevation={0}
      className="anim-fade-up"
      sx={{
        animationDelay: `${delay}s`,
        p: { xs: 2.5, sm: 3.5 },
        borderRadius: 5,
        border: `1px solid ${theme.palette.divider}`,
        backgroundColor: alpha(theme.palette.background.paper, 0.85),
        backdropFilter: 'blur(12px)',
      }}
    >
      <Box
        sx={{
          display: 'flex',
          alignItems: 'flex-start',
          justifyContent: 'space-between',
          gap: 2,
          flexWrap: 'wrap',
          mb: 2.5,
        }}
      >
        <Box sx={{ minWidth: 0 }}>
          <Typography variant="h5" component="h3" sx={{ mb: 0.5 }}>
            {title}
          </Typography>
          <Typography variant="body2" color="text.secondary">
            {caption}
          </Typography>
        </Box>
        {action && <Box sx={{ flexShrink: 0 }}>{action}</Box>}
      </Box>

      {children}

      {footnote && (
        <Typography
          variant="caption"
          color="text.secondary"
          sx={{ display: 'block', mt: 2, lineHeight: 1.5 }}
        >
          {footnote}
        </Typography>
      )}
    </Paper>
  );
};
