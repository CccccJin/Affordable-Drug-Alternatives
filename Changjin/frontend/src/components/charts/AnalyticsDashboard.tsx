import React from 'react';
import { Typography, Box } from '@mui/material';
import { PropertyDistributionChart } from './PropertyDistributionChart';
import { ClusteringVisualization } from './ClusteringVisualization';
import type { Compound } from '../../types/api';

interface AnalyticsDashboardProps {
  compounds: Compound[];
  className?: string;
}

export const AnalyticsDashboard: React.FC<AnalyticsDashboardProps> = ({
  compounds,
  className,
}) => {
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
        <Box sx={{ p: 2, bgcolor: 'primary.50', borderRadius: 1, textAlign: 'center' }}>
          <Typography variant="h4" color="primary.main">
            {compounds.length}
          </Typography>
          <Typography variant="body2" color="text.secondary">
            Total Compounds
          </Typography>
        </Box>

        <Box sx={{ p: 2, bgcolor: 'success.50', borderRadius: 1, textAlign: 'center' }}>
          <Typography variant="h4" color="success.main">
            {compounds.filter(c => c.similarity > 0.8).length}
          </Typography>
          <Typography variant="body2" color="text.secondary">
            High Similarity (&gt;0.8)
          </Typography>
        </Box>

        <Box sx={{ p: 2, bgcolor: 'warning.50', borderRadius: 1, textAlign: 'center' }}>
          <Typography variant="h4" color="warning.main">
            {(compounds.reduce((sum, c) => sum + c.similarity, 0) / compounds.length).toFixed(2)}
          </Typography>
          <Typography variant="body2" color="text.secondary">
            Avg Similarity
          </Typography>
        </Box>

        <Box sx={{ p: 2, bgcolor: 'info.50', borderRadius: 1, textAlign: 'center' }}>
          <Typography variant="h4" color="info.main">
            {new Set(compounds.map(c => c.smiles.length > 30 ? 'complex' : 'simple')).size}
          </Typography>
          <Typography variant="body2" color="text.secondary">
            Structure Types
          </Typography>
        </Box>
      </Box>
    </Box>
  );
};
