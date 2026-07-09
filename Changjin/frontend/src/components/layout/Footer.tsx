import React from 'react';
import { Box, Container, Typography, Link, useTheme } from '@mui/material';

export const Footer: React.FC = () => {
  const theme = useTheme();

  return (
    <Box
      component="footer"
      sx={{
        borderTop: `1px solid ${theme.palette.divider}`,
        py: 4,
        mt: 'auto',
      }}
    >
      <Container
        maxWidth="lg"
        sx={{
          px: { xs: 2.5, sm: 4 },
          display: 'flex',
          flexDirection: { xs: 'column', sm: 'row' },
          alignItems: { xs: 'flex-start', sm: 'center' },
          justifyContent: 'space-between',
          gap: 1.5,
        }}
      >
        <Typography variant="body2" color="text.secondary">
          ChemSearch — AI-powered discovery of affordable drug alternatives
        </Typography>
        <Typography variant="caption" color="text.secondary">
          Compound data from{' '}
          <Link
            href="https://www.ebi.ac.uk/chembl/"
            target="_blank"
            rel="noopener noreferrer"
            underline="hover"
            color="inherit"
            sx={{ fontWeight: 600 }}
          >
            ChEMBL
          </Link>
          {' '}· For research use only
        </Typography>
      </Container>
    </Box>
  );
};
