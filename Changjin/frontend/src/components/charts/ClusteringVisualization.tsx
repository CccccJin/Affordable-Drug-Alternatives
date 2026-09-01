import React, { useEffect, useMemo, useState } from 'react';
import {
  ScatterChart,
  Scatter,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip,
  ResponsiveContainer,
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
  Alert,
  CircularProgress,
  alpha,
} from '@mui/material';
import type { Compound } from '../../types/api';
import { rdkitService } from '../../services/rdkit/rdkitService';
import { loadFingerprintCorpus } from '../../services/search/fingerprintStore';
import { buildChemicalSpace } from '../../services/search/chemicalSpace';

/**
 * Tanimoto floor for two compounds to land in the same Butina cluster. 0.6 is
 * below the conventional 0.7 "highly similar" line because a result set is
 * already pre-filtered by similarity to the query; at 0.7 almost everything
 * shown becomes a singleton.
 */
const CLUSTER_CUTOFF = 0.6;

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
    // null when no member of the cluster carries the property, rather than a
    // number derived from something else.
    avgMW: number | null;
    avgLogP: number | null;
  };
}

export const ClusteringVisualization: React.FC<ClusteringVisualizationProps> = ({
  compounds,
  className,
}) => {
  const [selectedCluster, setSelectedCluster] = useState<number | null>(null);
  const [colorScheme, setColorScheme] = useState<'similarity' | 'properties'>('similarity');

  const [space, setSpace] = useState<ReturnType<typeof buildChemicalSpace> | null>(null);
  const [spaceError, setSpaceError] = useState<string | null>(null);

  // Fingerprints come from RDKit rather than from the corpus blob: the plot
  // shows whatever is on screen, which after filtering and sorting is no longer
  // aligned with corpus row order.
  useEffect(() => {
    let cancelled = false;
    if (compounds.length === 0) {
      setSpace(null);
      return;
    }

    (async () => {
      try {
        const { geometry } = await loadFingerprintCorpus();
        const fingerprints = await Promise.all(
          compounds.map(compound =>
            rdkitService.getMorganFingerprint(compound.smiles, geometry)
          )
        );
        if (cancelled) return;
        setSpaceError(null);
        setSpace(buildChemicalSpace(fingerprints, CLUSTER_CUTOFF));
      } catch (error) {
        if (cancelled) return;
        setSpace(null);
        setSpaceError(error instanceof Error ? error.message : 'Could not project these compounds');
      }
    })();

    return () => {
      cancelled = true;
    };
  }, [compounds]);

  const clusteringData = useMemo((): { points: ClusterPoint[]; clusters: ClusterInfo[] } => {
    if (!space) return { points: [], clusters: [] };

    const points: ClusterPoint[] = space.points.map((point, i) => ({
      x: point.x,
      y: point.y,
      cluster: point.cluster,
      compound: compounds[i],
      size: compounds[i].similarity * 20 + 5,
    }));

    const byCluster = new Map<number, ClusterPoint[]>();
    for (const point of points) {
      const list = byCluster.get(point.cluster) ?? [];
      list.push(point);
      byCluster.set(point.cluster, list);
    }

    /** Mean of a property over the members that actually carry it. */
    const meanOf = (members: Compound[], key: 'molecular_weight' | 'logp'): number | null => {
      const values = members
        .map(member => member[key])
        .filter((value): value is number => typeof value === 'number');
      return values.length ? values.reduce((a, b) => a + b, 0) / values.length : null;
    };

    const clusters: ClusterInfo[] = [...byCluster.entries()]
      .sort((a, b) => b[1].length - a[1].length || a[0] - b[0])
      .map(([id, members]) => {
        const molecules = members.map(m => m.compound);
        return {
          id,
          center: {
            x: members.reduce((sum, m) => sum + m.x, 0) / members.length,
            y: members.reduce((sum, m) => sum + m.y, 0) / members.length,
          },
          compounds: molecules,
          avgSimilarity:
            molecules.reduce((sum, m) => sum + m.similarity, 0) / molecules.length,
          properties: {
            avgMW: meanOf(molecules, 'molecular_weight'),
            avgLogP: meanOf(molecules, 'logp'),
          },
        };
      });

    return { points, clusters };
  }, [space, compounds]);

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

  /**
   * Scatter symbols are drawn here rather than left to recharts, which sizes
   * them from a ZAxis scale and emits `d="M0,0"` — a zero-radius path — when it
   * cannot resolve one. Radius encodes similarity to the query, so the marker
   * carries the same information as the colour without depending on that scale.
   */
  const renderPoint = (props: unknown) => {
    const { cx, cy, payload } = props as {
      cx?: number;
      cy?: number;
      payload?: ClusterPoint;
    };
    if (cx === undefined || cy === undefined || !payload) return <g />;
    return (
      <circle
        cx={cx}
        cy={cy}
        r={4 + payload.compound.similarity * 7}
        fill={getColor(payload.cluster, payload.compound.similarity)}
        fillOpacity={0.85}
        stroke="#fff"
        strokeWidth={1}
        style={{ cursor: 'pointer' }}
      />
    );
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
            {/* The ellipsis used to be unconditional, so a short SMILES was
                shown as though it had been cut off. */}
            SMILES: {data.compound.smiles.length > 30
              ? `${data.compound.smiles.slice(0, 30)}…`
              : data.compound.smiles}
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

        <Box sx={{ display: 'grid', gridTemplateColumns: { xs: '1fr', md: '2fr 1fr' }, gap: 3 }}>
          {/* Scatter Plot */}
          <Box>
            {spaceError && <Alert severity="error" sx={{ mb: 2 }}>{spaceError}</Alert>}

            {/* Constant height, and the chart mounts only once the projection is
                ready: ResponsiveContainer measures its parent on mount and does
                not reliably re-measure, so mounting it inside a zero-height box
                leaves an empty plot even after the data arrives. */}
            <Box sx={{ height: 400, mb: 2 }}>
              {!space ? (
                <Box sx={{ display: 'flex', alignItems: 'center', gap: 1.5, height: '100%' }}>
                  {!spaceError && compounds.length > 0 && <CircularProgress size={18} />}
                  <Typography variant="body2" color="text.secondary">
                    {spaceError
                      ? 'No projection available.'
                      : compounds.length === 0
                        ? 'No compounds to project.'
                        : `Fingerprinting ${compounds.length} compounds…`}
                  </Typography>
                </Box>
              ) : (
              <ResponsiveContainer width="100%" height="100%">
                <ScatterChart>
                  <CartesianGrid />
                  <XAxis
                    type="number"
                    dataKey="x"
                    name="MDS1"
                    domain={['dataMin - 0.05', 'dataMax + 0.05']}
                    tickFormatter={(v: number) => v.toFixed(2)}
                  />
                  <YAxis
                    type="number"
                    dataKey="y"
                    name="MDS2"
                    domain={['dataMin - 0.05', 'dataMax + 0.05']}
                    tickFormatter={(v: number) => v.toFixed(2)}
                  />
                  <Tooltip content={<CustomTooltip />} />
                  <Scatter
                    name="Compounds"
                    data={clusteringData.points}
                    onClick={handlePointClick}
                    isAnimationActive={false}
                    shape={renderPoint}
                  />
                </ScatterChart>
              </ResponsiveContainer>
              )}
            </Box>

            <Typography variant="body2" color="text.secondary">
              Click a point for its cluster. Colours show {
                colorScheme === 'similarity' ? 'similarity to the query' : 'cluster assignment'
              }.
            </Typography>
            {space && (
              <Typography variant="caption" color="text.secondary" sx={{ mt: 0.5, display: 'block' }}>
                Axes are classical MDS on 1 &minus; Tanimoto over Morgan fingerprints, so
                distance on the plot approximates structural distance. Kruskal stress{' '}
                <strong>{space.stress.toFixed(2)}</strong> &mdash; two dimensions cannot hold
                the geometry of a 1024-bit space, so read proximity as a hint, not a measurement.
                Clusters are Taylor&ndash;Butina at Tanimoto &ge; {CLUSTER_CUTOFF}.
              </Typography>
            )}
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
                            Avg MW:{' '}
                            {cluster.properties.avgMW === null
                              ? '—'
                              : `${cluster.properties.avgMW.toFixed(1)} g/mol`}
                          </Typography>
                        </Box>
                      </Box>
                    </Box>
                  </Box>
                ))}
              </Box>
            ) : (
              <Typography variant="body2" color="text.secondary">
                Nothing to cluster yet.
              </Typography>
            )}

            {selectedCluster !== null && (
              <Box sx={{ mt: 2, p: 2, bgcolor: 'grey.50', borderRadius: 1 }}>
                <Typography variant="subtitle2" gutterBottom>
                  Cluster {selectedCluster} Details
                </Typography>
                <Typography variant="body2">
                  {clusteringData.clusters.find(c => c.id === selectedCluster)?.compounds.length || 0}{' '}
                  compounds within Tanimoto {CLUSTER_CUTOFF} of this cluster&rsquo;s centre.
                </Typography>
              </Box>
            )}
          </Box>
        </Box>

        {/* Cluster Statistics */}
        {clusteringData.clusters.length > 0 && (
          <Box sx={{ mt: 3, p: 2, borderRadius: 1, bgcolor: theme => alpha(theme.palette.primary.main, 0.07) }}>
            <Typography variant="subtitle2" gutterBottom>
              Clustering Statistics
            </Typography>
            <Box sx={{ display: 'grid', gridTemplateColumns: { xs: '1fr', sm: 'repeat(3, 1fr)' }, gap: 2 }}>
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
