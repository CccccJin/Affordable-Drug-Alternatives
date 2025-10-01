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
  Divider,
  Button,
} from '@mui/material';
import {
  ExpandMore as ExpandMoreIcon,
  ExpandLess as ExpandLessIcon,
  Favorite as FavoriteIcon,
  FavoriteBorder as FavoriteBorderIcon,
} from '@mui/icons-material';
import type { Compound } from '../../types/api';
import { formatSimilarity } from '../../services/utils/rdkitUtils';
import { MoleculeViewer } from '../molecules/MoleculeViewer';

interface CompoundCardProps {
  compound: Compound;
  onViewDetails?: (compound: Compound) => void;
  showProperties?: boolean;
}

export const CompoundCard: React.FC<CompoundCardProps> = ({
  compound,
  onViewDetails,
  showProperties = false,
}) => {
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
    if (sim >= 0.8) return 'success' as const;
    if (sim >= 0.6) return 'warning' as const;
    if (sim >= 0.4) return 'error' as const;
    return 'default' as const;
  }, [compound.similarity]);

  return (
    <Card
      elevation={2}
      sx={{
        height: '100%',
        display: 'flex',
        flexDirection: 'column',
        transition: 'transform 0.2s, box-shadow 0.2s',
        '&:hover': {
          transform: 'translateY(-2px)',
          boxShadow: 4,
        },
      }}
    >
      <CardContent sx={{ flexGrow: 1 }}>
        {/* Header */}
        <Box sx={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', mb: 2 }}>
          <Typography variant="h6" component="h3" sx={{ fontWeight: 600 }}>
            {compound.chembl_id}
          </Typography>

          <Box sx={{ display: 'flex', alignItems: 'center', gap: 1 }}>
            <Chip
              label={formatSimilarity(compound.similarity)}
              color={similarityColor}
              size="small"
              sx={{ fontWeight: 600 }}
            />
            <IconButton
              size="small"
              onClick={handleFavoriteClick}
              color={isFavorite ? 'error' : 'default'}
            >
              {isFavorite ? <FavoriteIcon /> : <FavoriteBorderIcon />}
            </IconButton>
          </Box>
        </Box>

        {/* SMILES */}
        <Typography
          variant="body2"
          color="text.secondary"
          sx={{
            mb: 2,
            fontFamily: 'monospace',
            fontSize: '0.75rem',
            wordBreak: 'break-all',
          }}
        >
          {compound.smiles}
        </Typography>

        {/* Molecular Structure */}
        <Box sx={{ mb: 2 }}>
          <MoleculeViewer
            smiles={compound.smiles}
            width={200}
            height={150}
          />
        </Box>

        {/* Expandable Properties */}
        {showProperties && (
          <>
            <Button
              onClick={handleExpandClick}
              startIcon={expanded ? <ExpandLessIcon /> : <ExpandMoreIcon />}
              size="small"
              sx={{ mb: 2, textTransform: 'none' }}
            >
              {expanded ? 'Hide' : 'Show'} Properties
            </Button>

            <Collapse in={expanded}>
              <Box sx={{ mt: 2 }}>
                <Divider sx={{ mb: 2 }} />

                <Typography variant="subtitle2" gutterBottom>
                  Predicted Properties:
                </Typography>

                <Box sx={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 1 }}>
                  <Typography variant="body2" color="text.secondary">
                    Mol. Weight: ~180 g/mol
                  </Typography>
                  <Typography variant="body2" color="text.secondary">
                    LogP: ~1.6
                  </Typography>
                  <Typography variant="body2" color="text.secondary">
                    HBD: 1
                  </Typography>
                  <Typography variant="body2" color="text.secondary">
                    HBA: 4
                  </Typography>
                  <Typography variant="body2" color="text.secondary">
                    Rotatable Bonds: 3
                  </Typography>
                  <Typography variant="body2" color="text.secondary">
                    Aromatic Rings: 1
                  </Typography>
                </Box>
              </Box>
            </Collapse>
          </>
        )}
      </CardContent>

      <CardActions sx={{ justifyContent: 'space-between', px: 2, pb: 2 }}>
        <Button
          size="small"
          onClick={() => onViewDetails?.(compound)}
          sx={{ textTransform: 'none' }}
        >
          View Details
        </Button>

        <Button
          size="small"
          variant="outlined"
          sx={{ textTransform: 'none' }}
        >
          Export
        </Button>
      </CardActions>
    </Card>
  );
};
