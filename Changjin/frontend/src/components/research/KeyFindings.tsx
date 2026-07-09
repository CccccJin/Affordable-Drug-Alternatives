import React from 'react';
import { Box, Paper, Typography, useTheme, alpha } from '@mui/material';
import {
  CategoryOutlined as AreasIcon,
  TrendingDownOutlined as SavingsIcon,
  SavingsOutlined as MaxIcon,
  ScienceOutlined as CompoundIcon,
} from '@mui/icons-material';
import { HEADLINE } from '../../data/researchData';
import { brand } from '../../styles/theme';

interface Finding {
  icon: React.ReactNode;
  metric: string;
  title: string;
  detail: string;
}

const FINDINGS: Finding[] = [
  {
    icon: <AreasIcon fontSize="small" />,
    metric: String(HEADLINE.areas),
    title: 'Therapeutic areas',
    detail: 'Originator drugs benchmarked against affordable alternatives.',
  },
  {
    icon: <SavingsIcon fontSize="small" />,
    metric: `~${HEADLINE.avgSavings}%`,
    title: 'Average cost reduction',
    detail: 'Mean saving of the alternative vs. the originator across therapies.',
  },
  {
    icon: <MaxIcon fontSize="small" />,
    metric: `${HEADLINE.maxSavings}%`,
    title: 'Maximum reduction',
    detail: `Largest saving, in ${HEADLINE.maxSavingsArea}, from generic substitution.`,
  },
  {
    icon: <CompoundIcon fontSize="small" />,
    metric: HEADLINE.compounds.toLocaleString(),
    title: 'Compounds indexed',
    detail: 'ChEMBL 35 export searched with Tanimoto + ChemBERTa similarity.',
  },
];

export const KeyFindings: React.FC = () => {
  const theme = useTheme();

  return (
    <Box
      sx={{
        display: 'grid',
        gridTemplateColumns: { xs: '1fr', sm: '1fr 1fr', lg: 'repeat(4, 1fr)' },
        gap: 2,
      }}
    >
      {FINDINGS.map((f, i) => (
        <Paper
          key={f.title}
          elevation={0}
          className="anim-fade-up"
          sx={{
            animationDelay: `${i * 0.06}s`,
            p: 2.75,
            borderRadius: 4,
            border: `1px solid ${theme.palette.divider}`,
            backgroundColor: alpha(theme.palette.background.paper, 0.7),
            display: 'flex',
            flexDirection: 'column',
            transition: 'transform 0.25s cubic-bezier(0.22,1,0.36,1), box-shadow 0.25s ease',
            '&:hover': {
              transform: 'translateY(-3px)',
              boxShadow: '0 12px 32px rgba(16,16,24,0.08)',
            },
          }}
        >
          <Box
            sx={{
              width: 34,
              height: 34,
              borderRadius: '10px',
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
              mb: 1.75,
              background: brand.gradientSoft,
              color: brand.indigo,
            }}
          >
            {f.icon}
          </Box>
          <Typography
            sx={{
              fontSize: 'clamp(1.6rem, 3vw, 2rem)',
              fontWeight: 700,
              letterSpacing: '-0.03em',
              lineHeight: 1.05,
              background: brand.gradient,
              backgroundClip: 'text',
              WebkitBackgroundClip: 'text',
              WebkitTextFillColor: 'transparent',
            }}
          >
            {f.metric}
          </Typography>
          <Typography variant="subtitle2" sx={{ mt: 0.75, mb: 0.25 }}>
            {f.title}
          </Typography>
          <Typography variant="body2" color="text.secondary">
            {f.detail}
          </Typography>
        </Paper>
      ))}
    </Box>
  );
};
