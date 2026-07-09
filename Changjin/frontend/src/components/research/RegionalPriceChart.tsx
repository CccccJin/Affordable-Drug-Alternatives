import React, { useState } from 'react';
import {
  ResponsiveContainer,
  BarChart,
  Bar,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip,
  Legend,
} from 'recharts';
import { ToggleButton, ToggleButtonGroup, useTheme } from '@mui/material';
import { ChartCard } from './ChartCard';
import { REGIONAL_SERIES, formatUSD } from '../../data/researchData';
import { brand } from '../../styles/theme';

export const RegionalPriceChart: React.FC = () => {
  const theme = useTheme();
  const [seriesKey, setSeriesKey] = useState(REGIONAL_SERIES[0].key);

  const axis = theme.palette.text.secondary;
  const grid = theme.palette.divider;
  const series = REGIONAL_SERIES.find((s) => s.key === seriesKey) ?? REGIONAL_SERIES[0];

  return (
    <ChartCard
      title="Price holds up across regions & payers"
      caption="The alternative stays consistently cheaper in every health system studied — evidence the saving is structural, not a one-off."
      footnote={`${series.basis}. Figures are list/net prices from README regional tables.`}
      delay={0.15}
      action={
        <ToggleButtonGroup
          size="small"
          exclusive
          value={seriesKey}
          onChange={(_, v) => v && setSeriesKey(v)}
          sx={{
            flexWrap: 'wrap',
            '& .MuiToggleButton-root': {
              textTransform: 'none',
              px: 1.75,
              py: 0.5,
              fontWeight: 600,
              fontSize: '0.78rem',
              border: `1px solid ${grid}`,
              '&.Mui-selected': {
                color: brand.indigo,
                backgroundColor: 'rgba(99,102,241,0.10)',
                '&:hover': { backgroundColor: 'rgba(99,102,241,0.16)' },
              },
            },
          }}
        >
          {REGIONAL_SERIES.map((s) => (
            <ToggleButton key={s.key} value={s.key}>
              {s.label}
            </ToggleButton>
          ))}
        </ToggleButtonGroup>
      }
    >
      <ResponsiveContainer width="100%" height={340}>
        <BarChart
          data={series.rows}
          margin={{ top: 8, right: 12, bottom: 8, left: 8 }}
          barCategoryGap="24%"
        >
          <CartesianGrid vertical={false} stroke={grid} strokeDasharray="3 3" />
          <XAxis
            dataKey="region"
            tick={{ fill: theme.palette.text.primary, fontSize: 11 }}
            stroke={grid}
            interval={0}
          />
          <YAxis
            tickFormatter={(v) => formatUSD(v)}
            tick={{ fill: axis, fontSize: 12 }}
            stroke={grid}
            width={52}
            label={{
              value: 'Annual cost (USD)',
              angle: -90,
              position: 'insideLeft',
              fill: axis,
              fontSize: 12,
              style: { textAnchor: 'middle' },
            }}
          />
          <Tooltip
            cursor={{ fill: theme.palette.action.hover }}
            contentStyle={{
              borderRadius: 12,
              border: `1px solid ${grid}`,
              background: theme.palette.background.paper,
              boxShadow: '0 12px 32px rgba(16,16,24,0.14)',
              fontSize: 13,
            }}
            formatter={(value: number, name: string) => [
              formatUSD(value),
              name === 'originator' ? series.originatorLabel : series.alternativeLabel,
            ]}
          />
          <Legend
            wrapperStyle={{ fontSize: 12, paddingTop: 8 }}
            formatter={(value) =>
              value === 'originator' ? series.originatorLabel : series.alternativeLabel
            }
          />
          <Bar dataKey="originator" fill="#CBD0F5" radius={[5, 5, 0, 0]} />
          <Bar dataKey="alternative" fill={brand.indigo} radius={[5, 5, 0, 0]} />
        </BarChart>
      </ResponsiveContainer>
    </ChartCard>
  );
};
