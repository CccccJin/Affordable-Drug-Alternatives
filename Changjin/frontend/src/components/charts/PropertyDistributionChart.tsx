import React, { useState } from 'react';
import {
  BarChart,
  Bar,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip,
  ResponsiveContainer,
  PieChart,
  Pie,
  Cell,
} from 'recharts';
import {
  Card,
  CardContent,
  Typography,
  Box,
  ToggleButton,
  ToggleButtonGroup,
} from '@mui/material';
import { BarChart as BarChartIcon, PieChart as PieChartIcon } from '@mui/icons-material';
import type { Compound } from '../../types/api';

interface PropertyDistributionChartProps {
  compounds: Compound[];
  className?: string;
}

interface DistributionData {
  range: string;
  count: number;
  avgSimilarity: number;
  [key: string]: string | number; // Index signature for Recharts compatibility
}

export const PropertyDistributionChart: React.FC<PropertyDistributionChartProps> = ({
  compounds,
  className,
}) => {
  const [chartType, setChartType] = useState<'bar' | 'pie'>('bar');

  // Generate molecular weight distribution data
  const getMolecularWeightDistribution = (): DistributionData[] => {
    const ranges = [
      { min: 0, max: 100, label: '0-100' },
      { min: 100, max: 200, label: '100-200' },
      { min: 200, max: 300, label: '200-300' },
      { min: 300, max: 400, label: '300-400' },
      { min: 400, max: 500, label: '400-500' },
      { min: 500, max: 1000, label: '500+' },
    ];

    return ranges.map(range => {
      // A compound with no recorded weight is left out of the histogram. The
      // fallback here used to bin it by `150 + smiles.length * 2`, which put it
      // in a bucket chosen by how the SMILES happened to be written.
      const compoundsInRange = compounds.filter(
        c => c.molecular_weight != null
          && c.molecular_weight >= range.min
          && c.molecular_weight < range.max
      );

      return {
        range: range.label,
        count: compoundsInRange.length,
        avgSimilarity: compoundsInRange.length > 0
          ? compoundsInRange.reduce((sum, c) => sum + c.similarity, 0) / compoundsInRange.length
          : 0,
      };
    }).filter(d => d.count > 0);
  };

  // Generate similarity distribution data
  const getSimilarityDistribution = (): DistributionData[] => {
    const ranges = [
      { min: 0, max: 0.2, label: '0.0-0.2' },
      { min: 0.2, max: 0.4, label: '0.2-0.4' },
      { min: 0.4, max: 0.6, label: '0.4-0.6' },
      { min: 0.6, max: 0.8, label: '0.6-0.8' },
      { min: 0.8, max: 1.0, label: '0.8-1.0' },
    ];

    return ranges.map(range => {
      const compoundsInRange = compounds.filter(c =>
        c.similarity >= range.min && c.similarity < range.max
      );

      return {
        range: range.label,
        count: compoundsInRange.length,
        avgSimilarity: compoundsInRange.length > 0
          ? compoundsInRange.reduce((sum, c) => sum + c.similarity, 0) / compoundsInRange.length
          : 0,
      };
    }).filter(d => d.count > 0);
  };

  const mwDistribution = getMolecularWeightDistribution();
  const similarityDistribution = getSimilarityDistribution();

  const COLORS = ['#0088FE', '#00C49F', '#FFBB28', '#FF8042', '#8884D8'];

  return (
    <Card className={className} elevation={2}>
      <CardContent>
        <Box sx={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', mb: 3 }}>
          <Typography variant="h6">
            Property Distributions
          </Typography>

          <ToggleButtonGroup
            value={chartType}
            exclusive
            onChange={(_event, newType) => newType && setChartType(newType)}
            aria-label="chart type"
          >
            <ToggleButton value="bar" aria-label="bar chart">
              <BarChartIcon />
            </ToggleButton>
            <ToggleButton value="pie" aria-label="pie chart">
              <PieChartIcon />
            </ToggleButton>
          </ToggleButtonGroup>
        </Box>

        {/* Molecular Weight Distribution */}
        <Box sx={{ mb: 4 }}>
          <Typography variant="subtitle1" gutterBottom>
            Molecular Weight Distribution
          </Typography>

          <Box sx={{ height: 300 }}>
            <ResponsiveContainer width="100%" height="100%">
              <BarChart data={mwDistribution}>
                <CartesianGrid strokeDasharray="3 3" />
                <XAxis dataKey="range" />
                <YAxis />
                <Tooltip
                  labelFormatter={(label) => `MW Range: ${label}`}
                  formatter={(value: number, name: string) => [
                    name === 'count' ? `${value} compounds` : `${value.toFixed(3)} avg similarity`,
                    name === 'count' ? 'Count' : 'Avg Similarity'
                  ]}
                />
                <Bar dataKey="count" fill="#8884d8" />
              </BarChart>
            </ResponsiveContainer>
          </Box>
        </Box>

        {/* Similarity Distribution */}
        <Box sx={{ mb: 4 }}>
          <Typography variant="subtitle1" gutterBottom>
            Similarity Score Distribution
          </Typography>

          <Box sx={{ height: 300 }}>
            <ResponsiveContainer width="100%" height="100%">
              {chartType === 'bar' ? (
                <BarChart data={similarityDistribution}>
                  <CartesianGrid strokeDasharray="3 3" />
                  <XAxis dataKey="range" />
                  <YAxis />
                  <Tooltip
                    labelFormatter={(label) => `Similarity: ${label}`}
                    formatter={(value: number) => [`${value} compounds`, 'Count']}
                  />
                  <Bar dataKey="count" fill="#82ca9d" />
                </BarChart>
              ) : (
                <PieChart>
                  <Pie
                    data={similarityDistribution}
                    cx="50%"
                    cy="50%"
                    labelLine={false}
                    label={({ range, count }) => `${range}: ${count}`}
                    outerRadius={80}
                    fill="#8884d8"
                    dataKey="count"
                  >
                    {similarityDistribution.map((_, idx) => (
                      <Cell key={`cell-${idx}`} fill={COLORS[idx % COLORS.length]} />
                    ))}
                  </Pie>
                  <Tooltip />
                </PieChart>
              )}
            </ResponsiveContainer>
          </Box>
        </Box>
      </CardContent>
    </Card>
  );
};
