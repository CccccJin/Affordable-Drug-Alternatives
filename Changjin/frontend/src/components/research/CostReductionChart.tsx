import React from 'react';
import {
  ResponsiveContainer,
  BarChart,
  Bar,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip,
  LabelList,
  Cell,
} from 'recharts';
import { useTheme } from '@mui/material';
import { ChartCard } from './ChartCard';
import { COST_COMPARISONS, savingsPct } from '../../data/researchData';
import { brand } from '../../styles/theme';

export const CostReductionChart: React.FC = () => {
  const theme = useTheme();
  const axis = theme.palette.text.secondary;
  const grid = theme.palette.divider;

  const data = COST_COMPARISONS.map((c) => ({
    area: c.area,
    savings: savingsPct(c),
    originator: c.originator.name,
    alternative: c.alternative.name,
  })).sort((a, b) => b.savings - a.savings);

  // Colour scale: deeper indigo for larger savings
  const colourFor = (v: number) => {
    if (v >= 90) return brand.indigo;
    if (v >= 75) return '#6366F1';
    if (v >= 60) return '#818CF8';
    return '#A5B4FC';
  };

  return (
    <ChartCard
      title="Cost reduction by therapy"
      caption="How much a patient saves by switching from the originator drug to its affordable alternative."
      footnote="Reduction computed from the midpoint of each therapy's published cost range (README cost tables). Higher is better."
      delay={0.05}
    >
      <ResponsiveContainer width="100%" height={Math.max(320, data.length * 42)}>
        <BarChart
          data={data}
          layout="vertical"
          margin={{ top: 4, right: 56, bottom: 8, left: 8 }}
          barCategoryGap="28%"
        >
          <CartesianGrid horizontal={false} stroke={grid} strokeDasharray="3 3" />
          <XAxis
            type="number"
            domain={[0, 100]}
            tickFormatter={(v) => `${v}%`}
            tick={{ fill: axis, fontSize: 12 }}
            stroke={grid}
            label={{
              value: 'Cost reduction (%)',
              position: 'insideBottom',
              offset: -2,
              fill: axis,
              fontSize: 12,
            }}
          />
          <YAxis
            type="category"
            dataKey="area"
            width={128}
            tick={{ fill: theme.palette.text.primary, fontSize: 12 }}
            stroke={grid}
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
            formatter={(value: number) => [`${value}% cheaper`, 'Reduction']}
            labelFormatter={(label: string) => {
              const row = data.find((d) => d.area === label);
              return row ? `${row.originator} → ${row.alternative}` : label;
            }}
          />
          <Bar dataKey="savings" radius={[0, 6, 6, 0]} isAnimationActive>
            {data.map((d) => (
              <Cell key={d.area} fill={colourFor(d.savings)} />
            ))}
            <LabelList
              dataKey="savings"
              position="right"
              formatter={(value) => `${value}%`}
              style={{ fill: theme.palette.text.primary, fontSize: 12, fontWeight: 700 }}
            />
          </Bar>
        </BarChart>
      </ResponsiveContainer>
    </ChartCard>
  );
};
