import React from 'react';
import { Box, Typography, Chip, Divider, useTheme, alpha } from '@mui/material';
import {
  InsightsOutlined as InsightsIcon,
  VerifiedOutlined as VerifiedIcon,
  SourceOutlined as SourceIcon,
} from '@mui/icons-material';
import { KeyFindings } from './KeyFindings';
import { CostReductionChart } from './CostReductionChart';
import { OriginatorVsAlternativeChart } from './OriginatorVsAlternativeChart';
import { RegionalPriceChart } from './RegionalPriceChart';
import { METHODOLOGY, DATA_SOURCES, HEADLINE } from '../../data/researchData';
import { brand } from '../../styles/theme';

const TrustRow: React.FC<{
  icon: React.ReactNode;
  label: string;
  items: string[];
}> = ({ icon, label, items }) => {
  const theme = useTheme();
  return (
    <Box sx={{ display: 'flex', flexWrap: 'wrap', alignItems: 'center', gap: 1 }}>
      <Box
        sx={{
          display: 'inline-flex',
          alignItems: 'center',
          gap: 0.75,
          color: 'text.secondary',
          mr: 0.5,
        }}
      >
        {icon}
        <Typography variant="caption" sx={{ fontWeight: 700, letterSpacing: '0.02em' }}>
          {label}
        </Typography>
      </Box>
      {items.map((item) => (
        <Chip
          key={item}
          label={item}
          size="small"
          variant="outlined"
          sx={{
            fontSize: '0.7rem',
            height: 24,
            borderColor: theme.palette.divider,
            color: 'text.secondary',
          }}
        />
      ))}
    </Box>
  );
};

export const ResearchResults: React.FC = () => {
  const theme = useTheme();

  return (
    <Box component="section" aria-labelledby="research-results-heading" sx={{ mt: { xs: 6, md: 9 } }}>
      {/* Section header */}
      <Box className="anim-fade-up" sx={{ textAlign: 'center', mb: 4, maxWidth: 620, mx: 'auto' }}>
        <Box
          sx={{
            display: 'inline-flex',
            alignItems: 'center',
            gap: 0.75,
            px: 1.75,
            py: 0.6,
            mb: 2,
            borderRadius: 999,
            border: `1px solid ${theme.palette.divider}`,
            backgroundColor: alpha(theme.palette.background.paper, 0.7),
          }}
        >
          <InsightsIcon sx={{ fontSize: 14, color: brand.indigo }} />
          <Typography variant="caption" sx={{ fontWeight: 600, color: 'text.secondary' }}>
            Research results
          </Typography>
        </Box>

        <Typography id="research-results-heading" variant="h2" component="h2" sx={{ mb: 1.5 }}>
          Affordable alternatives, proven
        </Typography>
        <Typography variant="subtitle1" sx={{ color: 'text.secondary', fontWeight: 400 }}>
          A comparative analysis of originator drugs and their lower-cost
          equivalents across {' '}
          <Box component="span" sx={{ color: 'text.primary', fontWeight: 600 }}>
            {HEADLINE.areas} therapeutic areas
          </Box>
          {' '}— showing the same active ingredient can cost a fraction of the price.
        </Typography>
      </Box>

      {/* Key findings */}
      <Box sx={{ mb: { xs: 3, md: 4 } }}>
        <KeyFindings />
      </Box>

      {/* Charts */}
      <Box sx={{ display: 'flex', flexDirection: 'column', gap: 3 }}>
        <CostReductionChart />
        <OriginatorVsAlternativeChart />
        <RegionalPriceChart />
      </Box>

      {/* Trust / methodology strip */}
      <Box
        className="anim-fade-up"
        sx={{
          mt: 3,
          p: { xs: 2.5, sm: 3 },
          borderRadius: 5,
          border: `1px solid ${theme.palette.divider}`,
          backgroundColor: alpha(theme.palette.background.paper, 0.6),
          display: 'flex',
          flexDirection: 'column',
          gap: 2,
        }}
      >
        <TrustRow
          icon={<VerifiedIcon sx={{ fontSize: 16 }} />}
          label="METHOD"
          items={METHODOLOGY}
        />
        <Divider />
        <TrustRow
          icon={<SourceIcon sx={{ fontSize: 16 }} />}
          label="SOURCES"
          items={DATA_SOURCES}
        />
      </Box>
    </Box>
  );
};
