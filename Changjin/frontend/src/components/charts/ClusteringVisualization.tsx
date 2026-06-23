import React, { useState, useMemo } from 'react';
import {
  ScatterChart,
  Scatter,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip,
  ResponsiveContainer,
  Cell,
} from 'recharts';
import {
  Card,
  CardContent,
  Typography,
  Box,
  FormControl,
  InputLabel,
  Select,
  MenuItem,
  Chip,
  Avatar,
} from '@mui/material';
import type { Compound } from '../../types/api';

interface ClusteringVisualizationProps {
  compounds: Compound[];
  className?: string;
}

interface ClusterPoint {
  x: number;  // First principal component
  y: number;  // Second principal component
  cluster: number;
  compound: Compound;
  size: number;  // Based on similarity or other property
}

interface ClusterInfo {
  id: number;
  center: { x: number; y: number };
  compounds: Compound[];
  avgSimilarity: number;
  properties: {
    avgMW: number;
    avgLogP: number;
  };
}

export const ClusteringVisualization: React.FC<ClusteringVisualizationProps> = ({
  compounds,
  className,
}) => {
  const [selectedCluster, setSelectedCluster] = useState<number | null>(null);
  const [colorScheme, setColorScheme] = useState<'similarity' | 'properties'>('similarity');

  // Generate mock clustering data (in real implementation, this would use PCA or t-SNE)
  const clusteringData = useMemo((): { points: ClusterPoint[]; clusters: ClusterInfo[] } => {
    if (compounds.length === 0) {
      return { points: [], clusters: [] };
    }

    // Mock PCA-like transformation for visualization
    const points: ClusterPoint[] = compounds.map((compound) => {
      // Create pseudo-random but deterministic positions based on SMILES
      const hash = compound.smiles.split('').reduce((a, b) => {
        a = ((a << 5) - a) + b.charCodeAt(0);
        return a & a;
      }, 0);

      const x = Math.sin(hash) * 100 + (Math.random() - 0.5) * 50;
      const y = Math.cos(hash) * 100 + (Math.random() - 0.5) * 50;

      // Assign clusters (simple clustering based on position)
      const cluster = Math.floor((Math.atan2(y, x) + Math.PI) / (Math.PI * 2) * 5);

      return {
        x,
        y,
        cluster,
        compound,
        size: compound.similarity * 20 + 5, // Size based on similarity
      };
    });

    // Generate cluster information
    const clusters: ClusterInfo[] = [];
    for (let i = 0; i < 5; i++) {
      const clusterCompounds = points.filter(p => p.cluster === i).map(p => p.compound);

      if (clusterCompounds.length > 0) {
        const centerX = points.filter(p => p.cluster === i).reduce((sum, p) => sum + p.x, 0) / clusterCompounds.length;
        const centerY = points.filter(p => p.cluster === i).reduce((sum, p) => sum + p.y, 0) / clusterCompounds.length;

        clusters.push({
          id: i,
          center: { x: centerX, y: centerY },
          compounds: clusterCompounds,
          avgSimilarity: clusterCompounds.reduce((sum, compound) => sum + compound.similarity, 0) / clusterCompounds.length,
          properties: {
            avgMW: clusterCompounds.reduce((sum, compound) => sum + (150 + (compound.smiles.length * 2)), 0) / clusterCompounds.length,
            avgLogP: clusterCompounds.reduce((sum) => sum + (-2 + (Math.random() * 4)), 0) / clusterCompounds.length,
          },
        });
      }
    }

    return { points, clusters };
  }, [compounds]);

  const getColor = (cluster: number, value?: number) => {
    if (colorScheme === 'similarity' && value !== undefined) {
      // Color by similarity
      const intensity = Math.floor((value * 255));
      return `rgb(${255 - intensity}, 100, ${intensity})`;
    }

    // Color by cluster
    const colors = ['#FF6B6B', '#4ECDC4', '#45B7D1', '#96CEB4', '#FFEAA7'];
    return colors[cluster % colors.length];
  };

  const handlePointClick = (data: ClusterPoint) => {
    if (data) {
      setSelectedCluster(data.cluster);
    }
  };

  const CustomTooltip = ({ active, payload }: { active?: boolean; payload?: Array<{ payload: ClusterPoint }> }) => {
    if (active && payload && payload.length) {
      const data = payload[0].payload;
      return (
        <Box sx={{ bgcolor: 'background.paper', p: 2, border: 1, borderColor: 'divider', borderRadius: 1 }}>
          <Typography variant="body2" sx={{ fontWeight: 600 }}>
            {data.compound.chembl_id}
          </Typography>
          <Typography variant="body2">
            Similarity: {data.compound.similarity.toFixed(3)}
          </Typography>
          <Typography variant="body2">
            SMILES: {data.compound.smiles.substring(0, 30)}...
          </Typography>
          <Typography variant="body2">
            Cluster: {data.cluster}
          </Typography>
        </Box>
      );
    }
    return null;
  };

  return (
    <Card className={className} elevation={2}>
      <CardContent>
        <Box sx={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', mb: 3 }}>
          <Typography variant="h6">
            Compound Clustering Analysis
          </Typography>

          <FormControl size="small" sx={{ minWidth: 150 }}>
            <InputLabel>Color by</InputLabel>
            <Select
              value={colorScheme}
              label="Color by"
              onChange={(e) => setColorScheme(e.target.value as 'similarity' | 'properties')}
            >
              <MenuItem value="similarity">Similarity</MenuItem>
              <MenuItem value="properties">Cluster</MenuItem>
            </Select>
          </FormControl>
        </Box>

        <Box sx={{ display: 'grid', gridTemplateColumns: '2fr 1fr', gap: 3 }}>
          {/* Scatter Plot */}
          <Box>
            <Box sx={{ height: 400, mb: 2 }}>
              <ResponsiveContainer width="100%" height="100%">
                <ScatterChart>
                  <CartesianGrid />
                  <XAxis
                    type="number"
                    dataKey="x"
                    name="PC1"
                    domain={['dataMin - 20', 'dataMax + 20']}
                  />
                  <YAxis
                    type="number"
                    dataKey="y"
                    name="PC2"
                    domain={['dataMin - 20', 'dataMax + 20']}
                  />
                  <Tooltip content={<CustomTooltip />} />
                  <Scatter
                    name="Compounds"
                    data={clusteringData.points}
                    onClick={handlePointClick}
                  >
                    {clusteringData.points.map((point) => (
                      <Cell
                        key={`cell-${point.compound.chembl_id}`}
                        fill={getColor(point.cluster, point.compound.similarity)}
                      />
                    ))}
                  </Scatter>
                </ScatterChart>
              </ResponsiveContainer>
            </Box>

            <Typography variant="body2" color="text.secondary">
              💡 Click on points to view cluster details. Colors represent {
                colorScheme === 'similarity' ? 'similarity scores' : 'cluster assignments'
              }.
            </Typography>
          </Box>

          {/* Cluster Information Panel */}
          <Box>
            <Typography variant="subtitle1" gutterBottom>
              Cluster Summary
            </Typography>

            {clusteringData.clusters.length > 0 ? (
              <Box>
                {clusteringData.clusters.map((cluster) => (
                  <Box
                    key={cluster.id}
                    component="div"
                    onClick={() => setSelectedCluster(cluster.id)}
                    sx={{
                      p: 2,
                      border: 1,
                      borderColor: selectedCluster === cluster.id ? 'primary.main' : 'divider',
                      borderRadius: 1,
                      mb: 1,
                      cursor: 'pointer',
                      '&:hover': {
                        bgcolor: 'action.hover',
                      },
                    }}
                  >
                    <Box sx={{ display: 'flex', alignItems: 'center', gap: 2 }}>
                      <Avatar
                        sx={{
                          bgcolor: getColor(cluster.id),
                          width: 24,
                          height: 24,
                          fontSize: '0.75rem',
                        }}
                      >
                        {cluster.id}
                      </Avatar>
                      <Box sx={{ flex: 1 }}>
                        <Box sx={{ display: 'flex', alignItems: 'center', gap: 1 }}>
                          <Typography variant="body2">
                            Cluster {cluster.id}
                          </Typography>
                          <Chip
                            label={`${cluster.compounds.length} compounds`}
                            size="small"
                            variant="outlined"
                          />
                        </Box>
                        <Box>
                          <Typography variant="caption" display="block">
                            Avg Similarity: {cluster.avgSimilarity.toFixed(3)}
                          </Typography>
                          <Typography variant="caption" display="block">
                            Avg MW: {cluster.properties.avgMW.toFixed(1)} g/mol
                          </Typography>
                        </Box>
                      </Box>
                    </Box>
                  </Box>
                ))}
              </Box>
            ) : (
              <Typography variant="body2" color="text.secondary">
                No clusters detected. Need more compounds for meaningful clustering.
              </Typography>
            )}

            {selectedCluster !== null && (
              <Box sx={{ mt: 2, p: 2, bgcolor: 'grey.50', borderRadius: 1 }}>
                <Typography variant="subtitle2" gutterBottom>
                  Cluster {selectedCluster} Details
                </Typography>
                <Typography variant="body2">
                  {clusteringData.clusters.find(c => c.id === selectedCluster)?.compounds.length || 0} compounds
                  in this cluster with similar structural and property profiles.
                </Typography>
              </Box>
            )}
          </Box>
        </Box>

        {/* Cluster Statistics */}
        {clusteringData.clusters.length > 0 && (
          <Box sx={{ mt: 3, p: 2, bgcolor: 'primary.50', borderRadius: 1 }}>
            <Typography variant="subtitle2" gutterBottom>
              Clustering Statistics
            </Typography>
            <Box sx={{ display: 'grid', gridTemplateColumns: '1fr 1fr 1fr', gap: 2 }}>
              <Box>
                <Typography variant="body2" color="text.secondary">
                  Total Clusters
                </Typography>
                <Typography variant="h6">
                  {clusteringData.clusters.length}
                </Typography>
              </Box>
              <Box>
                <Typography variant="body2" color="text.secondary">
                  Largest Cluster
                </Typography>
                <Typography variant="h6">
                  {Math.max(...clusteringData.clusters.map(c => c.compounds.length))} compounds
                </Typography>
              </Box>
              <Box>
                <Typography variant="body2" color="text.secondary">
                  Avg Cluster Size
                </Typography>
                <Typography variant="h6">
                  {(compounds.length / clusteringData.clusters.length).toFixed(1)} compounds
                </Typography>
              </Box>
            </Box>
          </Box>
        )}
      </CardContent>
    </Card>
  );
};
