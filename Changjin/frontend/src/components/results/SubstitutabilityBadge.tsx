import React from 'react';
import { Box, Typography, alpha, useTheme } from '@mui/material';
import CheckCircleOutlineIcon from '@mui/icons-material/CheckCircleOutline';
import InfoOutlinedIcon from '@mui/icons-material/InfoOutlined';
import type { SubstitutabilitySummary } from '../../hooks/useSubstitutabilitySummaries';

/**
 * The one thing on a result card a reader can act on.
 *
 * Deliberately louder than the similarity percentage beside it: that number is
 * a structural measurement the caveat above the list says not to act on, and it
 * was the only thing the card showed. This states the action and the money, and
 * leaves `grade.py`'s letter to the details dialog where the evidence chain is.
 */
export const SubstitutabilityBadge: React.FC<{ summary: SubstitutabilitySummary }> = ({
  summary,
}) => {
  const theme = useTheme();
  const pharmacy = summary.tier === 'pharmacy';
  const tone = pharmacy ? theme.palette.success : theme.palette.warning;
  const Icon = pharmacy ? CheckCircleOutlineIcon : InfoOutlinedIcon;

  return (
    <Box
      sx={{
        mt: 1.5,
        px: 1.5,
        py: 1.25,
        borderRadius: '10px',
        border: `1px solid ${alpha(tone.main, 0.35)}`,
        backgroundColor: alpha(tone.main, 0.07),
      }}
    >
      <Box sx={{ display: 'flex', alignItems: 'center', gap: 0.75 }}>
        <Icon sx={{ fontSize: 17, color: tone.dark }} />
        <Typography variant="body2" sx={{ fontWeight: 700, color: tone.dark }}>
          {summary.headline}
        </Typography>
      </Box>

      {summary.savingPercent !== null && (
        <Typography
          variant="body2"
          sx={{ mt: 0.25, fontWeight: 700, color: tone.dark, fontVariantNumeric: 'tabular-nums' }}
        >
          Saves up to {summary.savingPercent.toFixed(1)}%
        </Typography>
      )}

      <Typography variant="caption" color="text.secondary" sx={{ display: 'block', mt: 0.25 }}>
        {summary.detail}
      </Typography>
    </Box>
  );
};
