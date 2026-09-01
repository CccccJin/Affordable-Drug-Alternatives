import React from 'react';
import { Box, Button, Typography } from '@mui/material';
import { Link as RouterLink, useLocation } from 'react-router-dom';

/**
 * The page for an address this app does not have.
 *
 * Without it react-router matched nothing and rendered nothing: a typo in the
 * hash, or a link to a route that has since been removed, left the header and
 * footer around an empty middle with no explanation and nothing to click.
 *
 * It names the address that failed, because the commonest cause is a stale or
 * mistyped link and seeing the string is what makes that obvious.
 */
export const NotFound: React.FC = () => {
  const { pathname } = useLocation();

  return (
    <Box sx={{ py: 10, maxWidth: '60ch' }}>
      <Typography variant="h4" component="h1" gutterBottom sx={{ fontWeight: 700 }}>
        No page at this address
      </Typography>
      <Typography variant="body1" color="text.secondary" sx={{ mb: 1 }}>
        This app has nothing at{' '}
        <Box component="code" sx={{ fontFamily: 'monospace', fontSize: '0.95em' }}>
          #{pathname}
        </Box>
        . If you followed a link, it may be out of date.
      </Typography>
      <Typography variant="body2" color="text.secondary" sx={{ mb: 3 }}>
        Search finds compounds by name or structure. Therapeutic equivalence
        looks up what FDA rates substitutable for a given drug.
      </Typography>
      <Box sx={{ display: 'flex', gap: 1.5, flexWrap: 'wrap' }}>
        <Button component={RouterLink} to="/search" variant="contained">
          Search compounds
        </Button>
        <Button component={RouterLink} to="/alternatives" variant="outlined">
          Therapeutic equivalence
        </Button>
      </Box>
    </Box>
  );
};
