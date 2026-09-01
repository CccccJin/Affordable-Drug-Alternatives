import React from 'react';
import { Typography, Box, alpha } from '@mui/material';
import { PropertyDistributionChart } from './PropertyDistributionChart';
import { ClusteringVisualization } from './ClusteringVisualization';
import { useQuery } from '@tanstack/react-query';
import { useSubstitutabilitySummaries } from '../../hooks/useSubstitutabilitySummaries';
import { substitutabilityQueryKey } from '../../hooks/useSubstitutability';
import { loadSubstitutability } from '../../services/api/substitutabilityApi';
import { spreadRowsFor } from './spreadData';
import { PriceSpread } from './PriceSpread';
import type { Compound } from '../../types/api';

/**
 * The summary row above the charts.
 *
 * It used to be four measures of structural similarity — the number the caveat
 * on this same page tells the reader not to act on — and one of those four was
 * not a measurement at all: "Structure Types" counted the distinct values of
 * `smiles.length > 30 ? 'complex' : 'simple'`, a set of at most two strings, so
 * it displayed 1 or 2 whatever the results were. SMILES length is a property of
 * how a structure was written down, not of the structure; the same molecule has
 * many valid SMILES of different lengths.
 *
 * Two of the four now answer the question the page exists to answer: how many
 * of these results a pharmacist could actually substitute, and how much the
 * cheapest such switch saves. Both come from FDA and CMS data already loaded
 * for the result cards, so no new request is made.
 */

type Tone = 'primary' | 'success' | 'warning' | 'info';

const SummaryCard: React.FC<{
  tone: Tone;
  value: string | number;
  label: string;
}> = ({ tone, value, label }) => (
  <Box
    sx={{
      p: 2,
      borderRadius: 1,
      textAlign: 'center',
      bgcolor: theme => alpha(theme.palette[tone].main, 0.07),
    }}
  >
    <Typography variant="h4" component="p" color={`${tone}.main`}>
      {value}
    </Typography>
    <Typography variant="body2" color="text.secondary">
      {label}
    </Typography>
  </Box>
);

interface AnalyticsDashboardProps {
  compounds: Compound[];
  className?: string;
}

export const AnalyticsDashboard: React.FC<AnalyticsDashboardProps> = ({
  compounds,
  className,
}) => {
  // Before the early return below: hooks may not be called conditionally.
  const summaries = useSubstitutabilitySummaries(compounds);

  // Same query key and staleTime as the summaries hook, so React Query serves
  // both from one fetch rather than pulling the 166 KB payload twice.
  const substitutability = useQuery({
    queryKey: substitutabilityQueryKey,
    queryFn: loadSubstitutability,
    staleTime: Infinity,
  });
  const substitutabilityData = substitutability.data;
  const spreadRows = React.useMemo(
    () => (substitutabilityData ? spreadRowsFor(substitutabilityData, compounds) : []),
    [substitutabilityData, compounds]
  );

  const substitutable = compounds.filter(
    c => summaries.get(c.chembl_id)?.tier === 'pharmacy'
  ).length;

  const savings = compounds
    .map(c => summaries.get(c.chembl_id)?.savingPercent)
    .filter((s): s is number => typeof s === 'number');
  const bestSaving = savings.length ? Math.max(...savings) : null;

  if (compounds.length === 0) {
    return (
      <Box
        sx={{
          display: 'flex',
          flexDirection: 'column',
          alignItems: 'center',
          justifyContent: 'center',
          py: 8,
          textAlign: 'center',
        }}
      >
        <Typography variant="h6" color="text.secondary" gutterBottom>
          Analytics Dashboard
        </Typography>
        <Typography variant="body2" color="text.secondary">
          Perform a search to view property distributions and clustering analysis.
        </Typography>
      </Box>
    );
  }

  return (
    <Box className={className}>
      <Typography variant="h5" gutterBottom sx={{ mb: 3 }}>
        Analytics Dashboard
      </Typography>

      <Box sx={{ display: 'grid', gridTemplateColumns: { lg: '1fr 1fr' }, gap: 3 }}>
        <PropertyDistributionChart compounds={compounds} />
        <ClusteringVisualization compounds={compounds} />
      </Box>

      {/* Summary Cards */}
      <Box sx={{ display: 'grid', gridTemplateColumns: { sm: '1fr 1fr', md: '1fr 1fr 1fr 1fr' }, gap: 2, mt: 3 }}>
        <SummaryCard tone="primary" value={compounds.length} label="Total Compounds" />
        <SummaryCard
          tone="info"
          value={compounds.filter(c => c.similarity > 0.8).length}
          label="High Structural Similarity (>0.8)"
        />
        <SummaryCard
          tone="success"
          value={substitutable}
          label="A pharmacist can substitute"
        />
        <SummaryCard
          tone="warning"
          // One decimal, like the result cards. Rounding to whole percent turned
          // a 99.9% saving into "100%", which reads as free.
          value={bestSaving === null ? '—' : `${bestSaving.toFixed(1)}%`}
          label="Largest saving available"
        />
      </Box>

      <Typography variant="caption" color="text.secondary" sx={{ mt: 1.5, display: 'block' }}>
        Substitutability and savings come from the FDA Orange and Purple Books and
        CMS NADAC, and cover US products only. Structural similarity is not
        substitutability: the two right-hand figures are the ones tied to an FDA
        rating. NADAC is a pharmacy acquisition cost, not a price you would pay.
      </Typography>

      {/* The evidence the two right-hand cards are drawn from. Absent when no
          result reaches a group with two surveyed prices in one unit, which is
          the common case — it renders nothing rather than an empty frame. */}
      <PriceSpread
        rows={spreadRows}
        nadacWeek={substitutabilityData?.meta.nadacWeek ?? ''}
      />
    </Box>
  );
};
