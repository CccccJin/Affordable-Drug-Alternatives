import React from 'react';
import { Alert, Box, CircularProgress, Divider, Typography } from '@mui/material';
import type { Compound } from '../../types/api';
import { useSubstitutability } from '../../hooks/useSubstitutability';
import { EquivalenceGroupCard } from '../substitutability/EquivalenceGroupCard';
import { groupKey } from '../substitutability/groups';
import { ClinicalDisclaimer } from '../substitutability/ClinicalDisclaimer';
import { NadacDisclaimer } from '../substitutability/NadacDisclaimer';

interface SubstitutabilityPanelProps {
  compound: Compound | null;
}

export const SubstitutabilityPanel: React.FC<SubstitutabilityPanelProps> = ({ compound }) => {
  const result = useSubstitutability(compound);

  return (
    <Box sx={{ mt: 3 }}>
      <Divider sx={{ my: 2 }} />
      <Typography variant="h6" gutterBottom>
        Substitutability &amp; Cost
      </Typography>

      {result.status === 'loading' && (
        <Box sx={{ display: 'flex', alignItems: 'center', gap: 1.5, py: 2 }}>
          <CircularProgress size={18} />
          <Typography variant="body2" color="text.secondary">
            Loading FDA equivalence data&hellip;
          </Typography>
        </Box>
      )}

      {result.status === 'error' && <Alert severity="error">{result.message}</Alert>}

      {/* Absence is information. Say why there is nothing, never show a blank panel. */}
      {result.status === 'no-coverage' && (
        <Alert severity="info" variant="outlined">
          {result.reason}
        </Alert>
      )}

      {result.status === 'found' && (
        <>
          <ClinicalDisclaimer generated={result.meta.generated} />

          {result.groups.map(group => (
            <EquivalenceGroupCard key={groupKey(group)} group={group} />
          ))}

          <NadacDisclaimer />

          <Typography variant="caption" color="text.secondary" sx={{ mt: 1.5, display: 'block' }}>
            Sources: FDA Orange Book &middot; CMS NADAC week of {result.meta.nadacWeek}
            {' '}&middot; openFDA NDC {result.meta.openFdaNdc} &middot; generated{' '}
            {result.meta.generated}
          </Typography>
        </>
      )}
    </Box>
  );
};
