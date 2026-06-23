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
        display: 'flex', flexDirection: 'column', height: '100%', position: 'relative', overflow: 'hidden',
        transition: 'all 0.3s cubic-bezier(0.4, 0, 0.2, 1)', cursor: 'pointer',
        '&:hover': {
          transform: 'translateY(-4px)',
          boxShadow: '0 8px 25px rgba(0,0,0,0.15)',
          '& .compound-card-header': {
            background: 'linear-gradient(135deg, rgba(25, 118, 210, 0.1) 0%, rgba(25, 118, 210, 0.05) 100%)',
          },
        },
      }}
    >
      <CardContent sx={{ 
        flexGrow: 1,
        p: 2,
        pb: 1,
        display: 'flex',
        flexDirection: 'column',
      }}>
        {/* Header */}
        <Box sx={{
          display: 'flex',
          justifyContent: 'space-between',
          alignItems: 'flex-start',
          mb: 1.5,
          minHeight: '3rem',
        }}>
          <Box sx={{ flex: 1, minWidth: 0, pr: 1 }}>
            <Typography 
              variant="h6" 
              component="h3" 
              sx={{ 
                fontWeight: 600,
                fontSize: '0.95rem',
                lineHeight: 1.2,
                wordBreak: 'break-word',
              }}
            >
              {compound.chembl_id}
            </Typography>
          </Box>

          <Box sx={{ 
            display: 'flex',
            alignItems: 'center',
            gap: 0.5,
            flexShrink: 0,
          }}>
            <Chip
              label={formatSimilarity(compound.similarity)}
              color={similarityColor}
              size="small"
              sx={{ 
                fontWeight: 600, 
                fontSize: '0.7rem',
                height: '20px',
              }}
            />
            <IconButton
              size="small"
              onClick={(e) => {
                e.stopPropagation();
                handleFavoriteClick();
              }}
              sx={{
                color: isFavorite ? 'error.main' : 'text.secondary',
                '&:hover': {
                  color: 'error.main',
                  backgroundColor: 'rgba(244, 67, 54, 0.1)',
                },
              }}
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
            mb: 1.5,
            fontFamily: 'monospace',
            fontSize: '0.65rem',
            lineHeight: 1.2,
            wordBreak: 'break-all',
            display: '-webkit-box',
            WebkitLineClamp: 2,
            WebkitBoxOrient: 'vertical',
            overflow: 'hidden',
          }}
        >
          {compound.smiles}
        </Typography>

        {/* Molecular Structure */}
        <Box sx={{ 
          mb: 1.5,
          height: 100,
          width: '100%',
          display: 'flex',
          justifyContent: 'center',
          alignItems: 'center',
          borderRadius: 1,
          backgroundColor: 'grey.50',
          border: '1px solid',
          borderColor: 'grey.200',
        }}>
          <MoleculeViewer
            smiles={compound.smiles}
            width={120}
            height={80}
          />
        </Box>

        {/* Expandable Properties */}
        {showProperties && (
          <>
            <Button
              onClick={(e) => {
                e.stopPropagation();
                handleExpandClick();
              }}
              startIcon={expanded ? <ExpandLessIcon /> : <ExpandMoreIcon />}
              size="small"
              sx={{ 
                mb: 1,
                textTransform: 'none',
                fontSize: '0.8rem',
                fontWeight: 500,
                color: 'primary.main',
                borderRadius: 1,
                alignSelf: 'flex-start',
              }}
            >
              Properties
            </Button>

            <Collapse in={expanded}>
              <Box sx={{ mt: 1.5 }}>
                <Typography sx={{ 
                  fontSize: '0.75rem',
                  fontWeight: 600,
                  color: 'primary.main',
                  mb: 1.5,
                }}>
                  Predicted Properties:
                </Typography>

                <Box sx={{ 
                  display: 'grid', 
                  gridTemplateColumns: '1fr 1fr',
                  gap: 0.75,
                  rowGap: 0.75,
                }}>
                  <Box>
                    <Typography sx={{ fontSize: '0.7rem', color: 'text.secondary', fontWeight: 500 }}>
                      Mol. Weight
                    </Typography>
                    <Typography sx={{ fontSize: '0.75rem', color: 'text.primary' }}>
                      ~180 g/mol
                    </Typography>
                  </Box>
                  <Box>
                    <Typography sx={{ fontSize: '0.7rem', color: 'text.secondary', fontWeight: 500 }}>
                      LogP
                    </Typography>
                    <Typography sx={{ fontSize: '0.75rem', color: 'text.primary' }}>
                      ~1.6
                    </Typography>
                  </Box>
                  <Box>
                    <Typography sx={{ fontSize: '0.7rem', color: 'text.secondary', fontWeight: 500 }}>
                      HBD
                    </Typography>
                    <Typography sx={{ fontSize: '0.75rem', color: 'text.primary' }}>
                      1
                    </Typography>
                  </Box>
                  <Box>
                    <Typography sx={{ fontSize: '0.7rem', color: 'text.secondary', fontWeight: 500 }}>
                      HBA
                    </Typography>
                    <Typography sx={{ fontSize: '0.75rem', color: 'text.primary' }}>
                      4
                    </Typography>
                  </Box>
                  <Box>
                    <Typography sx={{ fontSize: '0.7rem', color: 'text.secondary', fontWeight: 500 }}>
                      Rotatable Bonds
                    </Typography>
                    <Typography sx={{ fontSize: '0.75rem', color: 'text.primary' }}>
                      3
                    </Typography>
                  </Box>
                  <Box>
                    <Typography sx={{ fontSize: '0.7rem', color: 'text.secondary', fontWeight: 500 }}>
                      Aromatic Rings
                    </Typography>
                    <Typography sx={{ fontSize: '0.75rem', color: 'text.primary' }}>
                      1
                    </Typography>
                  </Box>
                </Box>
              </Box>
            </Collapse>
          </>
        )}
      </CardContent>

      <CardActions sx={{
        justifyContent: 'space-between',
        alignItems: 'center',
        px: 2,
        py: 1.5,
        borderTop: '1px solid',
        borderColor: 'divider',
        backgroundColor: 'grey.25',
        gap: 1,
      }}>
        <Button
          size="small"
          onClick={(e) => {
            e.stopPropagation();
            onViewDetails?.(compound);
          }}
          sx={{
            textTransform: 'none',
            fontSize: '0.8rem',
            fontWeight: 500,
            borderRadius: 1,
            px: 1.5,
            py: 0.75,
            minWidth: 'auto',
          }}
        >
          Details
        </Button>

        <Button
          size="small"
          variant="outlined"
          onClick={(e) => e.stopPropagation()}
          sx={{
            textTransform: 'none',
            fontSize: '0.8rem',
            fontWeight: 500,
            borderRadius: 1,
            px: 1.5,
            py: 0.75,
            minWidth: 'auto',
          }}
        >
          Export
        </Button>
      </CardActions>
    </Card>
  );
};
