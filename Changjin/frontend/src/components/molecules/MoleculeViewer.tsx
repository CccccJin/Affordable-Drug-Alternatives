import React, { useEffect, useRef, useState } from 'react';
import { Box, Typography, Alert, CircularProgress } from '@mui/material';
import { useRDKit } from '../../hooks/useRDKit';

export interface MoleculeViewerProps {
  smiles: string;
  width?: number;
  height?: number;
  showProperties?: boolean;
  className?: string;
}

interface MoleculeProperties {
  molecularWeight: number;
  logP: number;
  hBondDonors: number;
  hBondAcceptors: number;
  rotatableBonds: number;
  ringCount: number;
  aromaticRingCount: number;
}

export const MoleculeViewer: React.FC<MoleculeViewerProps> = ({
  smiles,
  width = 250,
  height = 200,
  showProperties = false,
  className,
}) => {
  const { isLoading, isLoaded, error, getMoleculeSVG, getMoleculeProperties } = useRDKit();
  const [svgContent, setSvgContent] = useState<string>('');
  const [properties, setProperties] = useState<MoleculeProperties | null>(null);
  const [loading, setLoading] = useState(false);
  const containerRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!smiles || !isLoaded) return;

    const loadMolecule = async () => {
      setLoading(true);
      try {
        // Generate SVG
        const svgOptions = {
          width,
          height,
          bondLength: Math.min(width, height) / 8,
        };

        const svg = await getMoleculeSVG(smiles, svgOptions);
        setSvgContent(svg);

        // Get properties if requested
        if (showProperties) {
          const moleculeProps = await getMoleculeProperties(smiles);
          setProperties(moleculeProps);
        }
      } catch (err) {
        console.error('Error loading molecule:', err);
        setSvgContent(getFallbackSVG(width, height));
      } finally {
        setLoading(false);
      }
    };

    loadMolecule();
  }, [smiles, isLoaded, width, height, showProperties, getMoleculeSVG, getMoleculeProperties]);

  const getFallbackSVG = (w: number, h: number): string => {
    return `<svg width="${w}" height="${h}" xmlns="http://www.w3.org/2000/svg">
      <rect width="100%" height="100%" fill="#f8f9fa" stroke="#dee2e6" stroke-width="1"/>
      <circle cx="${w/2}" cy="${h/2 - 20}" r="20" fill="#6c757d"/>
      <text x="${w/2}" y="${h/2 + 15}" text-anchor="middle" font-family="Arial" font-size="12" fill="#6c757d">
        Structure Preview
      </text>
      <text x="${w/2}" y="${h/2 + 35}" text-anchor="middle" font-family="Arial" font-size="10" fill="#adb5bd">
        (RDKit not available)
      </text>
    </svg>`;
  };

  if (error) {
    return (
      <Alert severity="error" sx={{ mb: 2 }}>
        <Typography variant="body2">
          Failed to load molecular structure: {error}
        </Typography>
      </Alert>
    );
  }

  if (loading || isLoading) {
    return (
      <Box
        sx={{
          width,
          height,
          display: 'flex',
          flexDirection: 'column',
          alignItems: 'center',
          justifyContent: 'center',
          bgcolor: 'grey.50',
          borderRadius: 1,
          border: '1px solid',
          borderColor: 'grey.200',
        }}
      >
        <CircularProgress size={40} sx={{ mb: 2 }} />
        <Typography variant="body2" color="text.secondary">
          Loading structure...
        </Typography>
      </Box>
    );
  }

  return (
    <Box className={className}>
      {/* SVG Container */}
      <Box
        ref={containerRef}
        sx={{
          width,
          height,
          bgcolor: 'grey.50',
          borderRadius: 1,
          border: '1px solid',
          borderColor: 'grey.200',
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'center',
          overflow: 'hidden',
          '& svg': {
            maxWidth: '100%',
            maxHeight: '100%',
          },
        }}
        dangerouslySetInnerHTML={{ __html: svgContent }}
      />

      {/* Properties Display */}
      {showProperties && properties && (
        <Box sx={{ mt: 2 }}>
          <Typography variant="subtitle2" gutterBottom>
            Calculated Properties:
          </Typography>
          <Box sx={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 1 }}>
            <Typography variant="body2" color="text.secondary">
              Mol. Weight: {properties.molecularWeight?.toFixed(2) || 'N/A'} g/mol
            </Typography>
            <Typography variant="body2" color="text.secondary">
              LogP: {properties.logP?.toFixed(2) || 'N/A'}
            </Typography>
            <Typography variant="body2" color="text.secondary">
              HBD: {properties.hBondDonors || 'N/A'}
            </Typography>
            <Typography variant="body2" color="text.secondary">
              HBA: {properties.hBondAcceptors || 'N/A'}
            </Typography>
            <Typography variant="body2" color="text.secondary">
              Rotatable Bonds: {properties.rotatableBonds || 'N/A'}
            </Typography>
            <Typography variant="body2" color="text.secondary">
              Rings: {properties.ringCount || 'N/A'}
            </Typography>
          </Box>
        </Box>
      )}
    </Box>
  );
};
