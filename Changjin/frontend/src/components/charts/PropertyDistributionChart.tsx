import React, { useState } from 'react';
import { BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer, LabelList } from 'recharts';
import { Card, CardContent, Typography, Box, ToggleButton, ToggleButtonGroup, Table, TableHead, TableBody, TableRow, TableCell } from '@mui/material';
import type { Compound } from '../../types/api';
import { molecularWeightDistribution, similarityDistribution, withoutMolecularWeight } from './distribution';

export const PropertyDistributionChart: React.FC<{ compounds: Compound[]; className?: string }> = ({ compounds, className }) => {
  const [property, setProperty] = useState<'similarity' | 'weight'>('similarity');
  const data = property === 'similarity' ? similarityDistribution(compounds) : molecularWeightDistribution(compounds);
  const total = data.reduce((sum, bin) => sum + bin.count, 0);
  const missing = withoutMolecularWeight(compounds);
  const label = property === 'similarity' ? 'Similarity to query' : 'Molecular weight (g/mol)';
  return (
    <Card className={className} variant="outlined" sx={{ minWidth: 0 }}>
      <CardContent>
        <Box sx={{ display: 'flex', justifyContent: 'space-between', gap: 2, flexWrap: 'wrap', mb: 2 }}>
          <Box><Typography variant="h6">Result distribution</Typography>
            <Typography variant="body2" color="text.secondary">{label} · {total} compounds</Typography></Box>
          <ToggleButtonGroup size="small" value={property} exclusive onChange={(_, value) => value && setProperty(value)} aria-label="Distribution property">
            <ToggleButton value="similarity">Similarity</ToggleButton>
            <ToggleButton value="weight">Weight</ToggleButton>
          </ToggleButtonGroup>
        </Box>
        {total ? <Box sx={{ height: 300 }} role="img" aria-label={`${label} distribution. Exact counts available in View chart data.`}>
          <ResponsiveContainer width="100%" height="100%">
            <BarChart data={data} margin={{ top: 24, right: 12, bottom: 8, left: -20 }}>
              <CartesianGrid vertical={false} strokeDasharray="3 3" stroke="#b8becb" />
              <XAxis dataKey="range" tick={{ fontSize: 12 }} axisLine={false} tickLine={false} />
              <YAxis allowDecimals={false} axisLine={false} tickLine={false} />
              <Tooltip labelFormatter={value => `${label}: ${value}`} formatter={(value: number) => [`${value} (${(value / total * 100).toFixed(1)}%)`, 'Compounds']} />
              <Bar dataKey="count" fill={property === 'similarity' ? '#6366f1' : '#0d9488'} radius={[6, 6, 0, 0]} maxBarSize={64}>
                <LabelList dataKey="count" position="top" fill="#64748b" />
              </Bar>
            </BarChart>
          </ResponsiveContainer>
        </Box> : <Typography sx={{ py: 8 }} color="text.secondary">No recorded molecular weights for these results.</Typography>}
        {property === 'weight' && missing > 0 && <Typography variant="caption" color="text.secondary">{missing} results have no recorded weight and are excluded.</Typography>}
        <Box component="details" sx={{ mt: 2 }}>
          <Box component="summary" sx={{ cursor: 'pointer', color: 'text.secondary' }}>View chart data</Box>
          <Table size="small" aria-label={`${label} distribution data`}>
            <TableHead><TableRow><TableCell>Range</TableCell><TableCell align="right">Compounds</TableCell><TableCell align="right">Share</TableCell></TableRow></TableHead>
            <TableBody>{data.map(bin => <TableRow key={bin.range}><TableCell>{bin.range}</TableCell><TableCell align="right">{bin.count}</TableCell><TableCell align="right">{total ? (bin.count / total * 100).toFixed(1) : 0}%</TableCell></TableRow>)}</TableBody>
          </Table>
        </Box>
      </CardContent>
    </Card>
  );
};
