import React from 'react';
import { Box, Chip, Paper, Typography, alpha, useTheme } from '@mui/material';
import ArrowForwardIcon from '@mui/icons-material/ArrowForward';
import type { EquivalenceGroup } from '../../types/api';
import { switchPair } from '../substitutability/groups';
import { formatPrice } from '../substitutability/format';

/**
 * The answer, stated before the evidence for it.
 *
 * The member table below this says the same thing, but a reader has to know to
 * compare the brand row against the cheapest row to see it. Someone who arrived
 * asking "is there a cheaper version of my drug" should not have to do that.
 */
export const SwitchSummary: React.FC<{ group: EquivalenceGroup }> = ({ group }) => {
  const theme = useTheme();
  const pair = switchPair(group);

  // No priced brand, or no priced generic: there is no switch to summarise, and
  // the group card below still shows what FDA rates equivalent.
  if (!pair) return null;

  const side = (label: string, name: string, price: number | null, unit: string | null) => (
    <Box sx={{ minWidth: 0, flex: '1 1 240px' }}>
      <Typography variant="overline" color="text.secondary" sx={{ display: 'block' }}>
        {label}
      </Typography>
      <Typography variant="subtitle1" sx={{ fontWeight: 700, lineHeight: 1.25 }}>
        {name}
      </Typography>
      <Typography
        variant="body2"
        sx={{
          fontFamily: 'ui-monospace, Menlo, monospace',
          fontVariantNumeric: 'tabular-nums',
          color: 'text.secondary',
        }}
      >
        ${formatPrice(price)} / {unit}
      </Typography>
    </Box>
  );

  return (
    <Paper
      variant="outlined"
      sx={{
        p: 2.5,
        mb: 2,
        borderColor: alpha(theme.palette.success.main, 0.4),
        backgroundColor: alpha(theme.palette.success.main, 0.04),
      }}
    >
      <Box
        sx={{
          display: 'flex',
          alignItems: 'center',
          gap: 2,
          flexWrap: 'wrap',
        }}
      >
        {side('Brand', pair.brand.tradeName, pair.brand.pricePerUnit, pair.brand.pricingUnit)}

        <ArrowForwardIcon sx={{ color: 'success.main', flexShrink: 0 }} />

        {side(
          'Lowest-cost rated equivalent',
          pair.generic.tradeName,
          pair.generic.pricePerUnit,
          pair.generic.pricingUnit
        )}

        <Box sx={{ flexShrink: 0, textAlign: 'right', minWidth: 120 }}>
          <Typography
            variant="h4"
            sx={{ fontWeight: 700, color: 'success.dark', lineHeight: 1 }}
          >
            {group.savingPercent!.toFixed(1)}%
          </Typography>
          <Typography variant="caption" color="text.secondary">
            lower published acquisition cost
          </Typography>
        </Box>
      </Box>

      <Box sx={{ display: 'flex', gap: 1, flexWrap: 'wrap', mt: 1.5 }}>
        <Chip size="small" label={group.ingredient} />
        <Chip size="small" variant="outlined" label={`${group.dosageForm};${group.route}`} />
        <Chip size="small" variant="outlined" label={group.strength} />
      </Box>
    </Paper>
  );
};
