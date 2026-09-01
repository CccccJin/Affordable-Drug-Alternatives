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
import {
  molecularWeightDistribution,
  similarityDistribution,
  withoutMolecularWeight,
} from './distribution';

interface PropertyDistributionChartProps {
  compounds: Compound[];
  className?: string;
}

export const PropertyDistributionChart: React.FC<PropertyDistributionChartProps> = ({
  compounds,
  className,
}) => {
  const [chartType, setChartType] = useState<'bar' | 'pie'>('bar');

  const mwDistribution = molecularWeightDistribution(compounds);
  const simDistribution = similarityDistribution(compounds);
  const unweighed = withoutMolecularWeight(compounds);

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
          {unweighed > 0 && (
            <Typography variant="caption" color="text.secondary">
              {unweighed} of {compounds.length} results have no recorded molecular
              weight and are not shown above.
            </Typography>
          )}
        </Box>

        {/* Similarity Distribution */}
        <Box sx={{ mb: 4 }}>
          <Typography variant="subtitle1" gutterBottom>
            Similarity Score Distribution
          </Typography>

          <Box sx={{ height: 300 }}>
            <ResponsiveContainer width="100%" height="100%">
              {chartType === 'bar' ? (
                <BarChart data={simDistribution}>
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
                    data={simDistribution}
                    cx="50%"
                    cy="50%"
                    labelLine={false}
                    label={({ range, count }) => `${range}: ${count}`}
                    outerRadius={80}
                    fill="#8884d8"
                    dataKey="count"
                  >
                    {simDistribution.map((_, idx) => (
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
