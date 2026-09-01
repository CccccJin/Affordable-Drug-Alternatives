import React, { useState } from 'react';
import {
  Card,
  CardContent,
  CardActions,
  Typography,
  Box,
  Chip,
  IconButton,
  Collapse,
  Button,
  Tooltip,
  useTheme,
  alpha,
} from '@mui/material';
import {
  ExpandMore as ExpandMoreIcon,
  ExpandLess as ExpandLessIcon,
  Favorite as FavoriteIcon,
  FavoriteBorder as FavoriteBorderIcon,
} from '@mui/icons-material';
import type { Compound } from '../../types/api';
import { formatSimilarity } from '../../services/utils/formatting';
import { SubstitutabilityBadge } from './SubstitutabilityBadge';
import type { SubstitutabilitySummary } from '../../hooks/useSubstitutabilitySummaries';
import { MoleculeViewer } from '../molecules/MoleculeViewer';
import { monoStack } from '../../styles/theme';

interface CompoundCardProps {
  compound: Compound;
  /** Substitutability verdict, when the FDA exports hold one for this compound. */
  substitutability?: SubstitutabilitySummary;
  onViewDetails?: (compound: Compound) => void;
  /** Export just this compound. Without it the button is not rendered. */
  onExport?: (compound: Compound) => void;
  showProperties?: boolean;
}

interface PropertyItemProps {
  label: string;
  value: string | number;
}

const PropertyItem: React.FC<PropertyItemProps> = ({ label, value }) => (
  <Box>
    <Typography
      sx={{ fontSize: '0.68rem', color: 'text.secondary', fontWeight: 500, mb: 0.25 }}
    >
      {label}
    </Typography>
    <Typography sx={{ fontSize: '0.8rem', color: 'text.primary', fontWeight: 500 }}>
      {value}
    </Typography>
  </Box>
);

export const CompoundCard: React.FC<CompoundCardProps> = ({
  compound,
  substitutability,
  onViewDetails,
  onExport,
  showProperties = false,
}) => {
  const theme = useTheme();
  const [expanded, setExpanded] = useState(false);
  const [isFavorite, setIsFavorite] = useState(false);

  const handleExpandClick = () => {
    setExpanded(!expanded);
  };

  const handleFavoriteClick = () => {
    setIsFavorite(!isFavorite);
  };

  const similarityColor = React.useMemo(() => {
    const sim = compound.similarity;
    if (sim >= 0.8) return theme.palette.success.main;
    if (sim >= 0.6) return theme.palette.warning.main;
    return theme.palette.error.main;
  }, [compound.similarity, theme]);

  const formatNumber = (value: number | null | undefined, decimals: number = 2): string =>
    value == null ? 'N/A' : value.toFixed(decimals);

  return (
    <Card
      elevation={0}
      sx={{
        display: 'flex',
        flexDirection: 'column',
        height: '100%',
        width: '100%',
        position: 'relative',
        overflow: 'hidden',
        transition:
          'transform 0.28s cubic-bezier(0.22,1,0.36,1), box-shadow 0.28s ease, border-color 0.28s ease',
        '&:hover': {
          transform: 'translateY(-4px)',
          boxShadow: '0 2px 4px rgba(16,16,24,0.06), 0 20px 44px rgba(16,16,24,0.12)',
          borderColor: alpha(theme.palette.primary.main, 0.35),
        },
        '&:focus-within': {
          borderColor: alpha(theme.palette.primary.main, 0.5),
        },
      }}
    >
      <CardContent
        sx={{
          flexGrow: 1,
          p: 2.5,
          pb: 1.5,
          display: 'flex',
          flexDirection: 'column',
        }}
      >
        {/* Header */}
        <Box
          sx={{
            display: 'flex',
            justifyContent: 'space-between',
            alignItems: 'flex-start',
            mb: 1.5,
            gap: 1,
          }}
        >
          <Box sx={{ flex: 1, minWidth: 0 }}>
            <Typography
              variant="subtitle2"
              component="h3"
              sx={{ lineHeight: 1.3, wordBreak: 'break-word' }}
            >
              {compound.pref_name || compound.chembl_id}
            </Typography>
            <Typography
              variant="caption"
              sx={{
                color: 'text.secondary',
                fontFamily: monoStack,
                fontSize: '0.68rem',
              }}
            >
              {compound.chembl_id}
            </Typography>
          </Box>

          <Box sx={{ display: 'flex', alignItems: 'center', gap: 0.25, flexShrink: 0 }}>
            <Tooltip title={`Similarity: ${formatSimilarity(compound.similarity)}`}>
              <Chip
                label={formatSimilarity(compound.similarity)}
                size="small"
                sx={{
                  fontWeight: 700,
                  fontSize: '0.7rem',
                  height: 22,
                  color: similarityColor,
                  backgroundColor: alpha(similarityColor, 0.1),
                }}
              />
            </Tooltip>
            <IconButton
              size="small"
              aria-label={isFavorite ? 'Remove from favorites' : 'Add to favorites'}
              onClick={(e) => {
                e.stopPropagation();
                handleFavoriteClick();
              }}
              sx={{
                color: isFavorite ? 'error.main' : 'text.disabled',
                transition: 'transform 0.15s ease, color 0.15s ease',
                '&:hover': {
                  color: 'error.main',
                  backgroundColor: alpha(theme.palette.error.main, 0.08),
                  transform: 'scale(1.1)',
                },
              }}
            >
              {isFavorite ? (
                <FavoriteIcon fontSize="small" />
              ) : (
                <FavoriteBorderIcon fontSize="small" />
              )}
            </IconButton>
          </Box>
        </Box>

        {/* Molecular Structure */}
        <Box
          sx={{
            mb: 1.5,
            height: 120,
            width: '100%',
            display: 'flex',
            justifyContent: 'center',
            alignItems: 'center',
            borderRadius: 3,
            backgroundColor:
              theme.palette.mode === 'light'
                ? '#FBFBFA'
                : alpha(theme.palette.common.white, 0.03),
            border: `1px solid ${theme.palette.divider}`,
            overflow: 'hidden',
          }}
        >
          <MoleculeViewer smiles={compound.smiles} width={150} height={100} />
        </Box>

        {/* SMILES */}
        <Typography
          variant="body2"
          sx={{
            mb: 1,
            fontFamily: monoStack,
            fontSize: '0.66rem',
            lineHeight: 1.5,
            color: 'text.secondary',
            wordBreak: 'break-all',
            display: '-webkit-box',
            WebkitLineClamp: 2,
            WebkitBoxOrient: 'vertical',
            overflow: 'hidden',
          }}
        >
          {compound.smiles}
        </Typography>

        {/* The actionable answer, above the fold of the card. Absent when the
            FDA exports hold nothing for this compound — which is nine cards in
            ten, so a "no data" badge would be noise rather than information. */}
        {substitutability && <SubstitutabilityBadge summary={substitutability} />}

        {/* Expandable Properties */}
        {showProperties && (
          <>
            <Button
              onClick={(e) => {
                e.stopPropagation();
                handleExpandClick();
              }}
              endIcon={
                expanded ? (
                  <ExpandLessIcon fontSize="small" />
                ) : (
                  <ExpandMoreIcon fontSize="small" />
                )
              }
              size="small"
              aria-expanded={expanded}
              sx={{
                textTransform: 'none',
                fontSize: '0.78rem',
                fontWeight: 600,
                color: 'primary.main',
                alignSelf: 'flex-start',
                px: 1,
                mx: -1,
              }}
            >
              Properties
            </Button>

            <Collapse in={expanded}>
              <Box
                sx={{
                  mt: 1.5,
                  p: 1.5,
                  borderRadius: 2.5,
                  backgroundColor:
                    theme.palette.mode === 'light'
                      ? alpha(theme.palette.primary.main, 0.04)
                      : alpha(theme.palette.primary.main, 0.1),
                  display: 'grid',
                  gridTemplateColumns: '1fr 1fr',
                  gap: 1.25,
                }}
              >
                <PropertyItem
                  label="Mol. weight"
                  value={`${formatNumber(compound.molecular_weight)} g/mol`}
                />
                <PropertyItem label="LogP" value={formatNumber(compound.logp)} />
                <PropertyItem label="H-bond donors" value={compound.h_bond_donors ?? 'N/A'} />
                <PropertyItem
                  label="H-bond acceptors"
                  value={compound.h_bond_acceptors ?? 'N/A'}
                />
                <PropertyItem
                  label="Rotatable bonds"
                  value={compound.rotatable_bonds ?? 'N/A'}
                />
                <PropertyItem
                  label="Aromatic rings"
                  value={compound.aromatic_rings ?? 'N/A'}
                />
              </Box>
            </Collapse>
          </>
        )}
      </CardContent>

      <CardActions
        sx={{
          justifyContent: 'flex-end',
          px: 2.5,
          py: 1.5,
          borderTop: `1px solid ${theme.palette.divider}`,
          gap: 1,
        }}
      >
        {/* Rendered only when it can do something. This button previously
            existed with an onClick that called stopPropagation and nothing
            else, so it looked live and did nothing. */}
        {onExport && (
          <Button
            size="small"
            variant="text"
            onClick={(e) => {
              e.stopPropagation();
              onExport(compound);
            }}
            sx={{ color: 'text.secondary' }}
          >
            Export
          </Button>
        )}
        <Button
          size="small"
          variant="outlined"
          onClick={(e) => {
            e.stopPropagation();
            onViewDetails?.(compound);
          }}
        >
          View details
        </Button>
      </CardActions>
    </Card>
  );
};
