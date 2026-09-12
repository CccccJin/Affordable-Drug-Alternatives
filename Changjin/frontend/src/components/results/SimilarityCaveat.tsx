import React from 'react';
import { Alert, Link, Typography, Box } from '@mui/material';
import { Link as RouterLink } from 'react-router-dom';

/**
 * Structural similarity is not substitutability, and this page is where that
 * gets confused.
 *
 * A result list reading "ASPIRIN 100% · PHENYLASPIRINATE 68% · SALSALATE 61%"
 * invites exactly one reading from a non-specialist: that these are aspirin's
 * alternatives. They are not. The two halves of this project measure different
 * things, and the project's own evaluation set is built on the gap between
 * them — its hardest negatives are pairs at Tanimoto 1.000 that FDA does *not*
 * rate equivalent, because a fingerprint cannot see a salt, a strength or a
 * dosage form:
 *
 *     1.000  HALOPERIDOL          vs  HALOPERIDOL LACTATE
 *     1.000  PROCHLORPERAZINE     vs  PROCHLORPERAZINE MALEATE
 *
 * The substitutability disclaimer lives on /alternatives and inside the
 * compound dialog. Neither is on the path a user takes to reach this list,
 * which is the default landing page for every search.
 */
export const SimilarityCaveat: React.FC = () => (
  <Alert severity="info" variant="outlined" sx={{ mb: 2 }}>
    <Typography variant="body2"><strong>Structural similarity does not establish substitutability.</strong></Typography>
    <Box component="details" sx={{ mt: 0.5 }}>
      <Box component="summary" sx={{ cursor: 'pointer', fontSize: '0.8rem' }}>Why this matters</Box>
      <Typography variant="body2">These scores say nothing about whether one drug can be used in place of another. A salt of the same molecule scores 1.000 here and is still not an approved substitute.</Typography>
    </Box>
    <Typography variant="caption" color="text.secondary" sx={{ mt: 0.5, display: 'block' }}>
      For whether FDA rates two products interchangeable, see{' '}
      <Link component={RouterLink} to="/alternatives">
        Therapeutic equivalence lookup
      </Link>
      . Nothing on this page is medical advice.
    </Typography>
  </Alert>
);
