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
  LabelList,
} from 'recharts';
import { ToggleButton, ToggleButtonGroup, useTheme } from '@mui/material';
import { ChartCard } from './ChartCard';
import {
  COST_COMPARISONS,
  originatorMid,
  alternativeMid,
  formatUSD,
  type CostBasis,
} from '../../data/researchData';
import { brand } from '../../styles/theme';

export const OriginatorVsAlternativeChart: React.FC = () => {
  const theme = useTheme();
  const [basis, setBasis] = useState<CostBasis>('annual');

  const axis = theme.palette.text.secondary;
  const grid = theme.palette.divider;

  const data = COST_COMPARISONS.filter((c) => c.basis === basis)
    .map((c) => ({
      area: c.area,
      originator: originatorMid(c),
      alternative: alternativeMid(c),
      originatorName: c.originator.name,
      alternativeName: c.alternative.name,
    }))
    .sort((a, b) => b.originator - a.originator);

  return (
    <ChartCard
      title="Originator vs. affordable alternative"
      caption="Head-to-head treatment cost. The affordable option is dramatically cheaper across every therapy area."
      footnote="Bars show the midpoint of published cost ranges on a logarithmic scale (costs span three orders of magnitude). Annual = yearly therapy cost; Per course = one full treatment course."
      delay={0.1}
      action={
        <ToggleButtonGroup
          size="small"
          exclusive
          value={basis}
          onChange={(_, v) => v && setBasis(v)}
          sx={{
            '& .MuiToggleButton-root': {
              textTransform: 'none',
              px: 2,
              py: 0.5,
              fontWeight: 600,
              fontSize: '0.8rem',
              border: `1px solid ${grid}`,
              '&.Mui-selected': {
                color: brand.indigo,
                backgroundColor: 'rgba(99,102,241,0.10)',
                '&:hover': { backgroundColor: 'rgba(99,102,241,0.16)' },
              },
            },
          }}
        >
          <ToggleButton value="annual">Annual</ToggleButton>
          <ToggleButton value="course">Per course</ToggleButton>
        </ToggleButtonGroup>
      }
    >
      <ResponsiveContainer width="100%" height={Math.max(300, data.length * 74)}>
        <BarChart
          data={data}
          layout="vertical"
          margin={{ top: 4, right: 64, bottom: 8, left: 8 }}
          barCategoryGap="26%"
        >
          <CartesianGrid horizontal={false} stroke={grid} strokeDasharray="3 3" />
          <XAxis
            type="number"
            scale="log"
            domain={[10, 1000000]}
            ticks={[10, 100, 1000, 10000, 100000, 1000000]}
            tickFormatter={(v) => formatUSD(v)}
            tick={{ fill: axis, fontSize: 12 }}
            stroke={grid}
            label={{
              value: 'Cost (USD, log scale)',
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
            formatter={(value: number, _name: string, props) => {
              const isOrig = props?.dataKey === 'originator';
              const label = isOrig
                ? props.payload.originatorName
                : props.payload.alternativeName;
              return [formatUSD(value), label];
            }}
          />
          <Legend
            wrapperStyle={{ fontSize: 12, paddingTop: 8 }}
            formatter={(value) =>
              value === 'originator' ? 'Originator drug' : 'Affordable alternative'
            }
          />
          <Bar dataKey="originator" fill="#CBD0F5" radius={[0, 5, 5, 0]}>
            <LabelList
              dataKey="originator"
              position="right"
              formatter={(value) => formatUSD(Number(value))}
              style={{ fill: axis, fontSize: 11 }}
            />
          </Bar>
          <Bar dataKey="alternative" fill={brand.indigo} radius={[0, 5, 5, 0]}>
            <LabelList
              dataKey="alternative"
              position="right"
              formatter={(value) => formatUSD(Number(value))}
              style={{ fill: theme.palette.text.primary, fontSize: 11, fontWeight: 600 }}
            />
          </Bar>
        </BarChart>
      </ResponsiveContainer>
    </ChartCard>
  );
};
