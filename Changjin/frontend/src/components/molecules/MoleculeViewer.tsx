import React, { useEffect, useState } from 'react';
import { Box, Typography, CircularProgress } from '@mui/material';
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

const placeholderSVG = (w: number, h: number, message: string): string =>
  `<svg width="${w}" height="${h}" viewBox="0 0 ${w} ${h}" xmlns="http://www.w3.org/2000/svg">
    <rect width="100%" height="100%" fill="#f8f9fa" stroke="#dee2e6" stroke-width="1" rx="6"/>
    <text x="${w / 2}" y="${h / 2}" text-anchor="middle" dominant-baseline="middle"
      font-family="Inter, Arial, sans-serif" font-size="11" fill="#8a8f98">${message}</text>
  </svg>`;

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
  const [rendering, setRendering] = useState(false);

  useEffect(() => {
    // Nothing to draw yet: don't leave a spinner hanging on an empty SMILES.
    if (!smiles) {
      setSvgContent('');
      setProperties(null);
      setRendering(false);
      return;
    }
    // Wait until the module is ready; this effect re-runs when isLoaded flips.
    if (!isLoaded) return;

    let cancelled = false;
    setRendering(true);

    const loadMolecule = async () => {
      try {
        const svg = await getMoleculeSVG(smiles, {
          width,
          height,
          bondLength: Math.min(width, height) / 8,
        });
        if (!cancelled) setSvgContent(svg);

        if (showProperties) {
          const moleculeProps = await getMoleculeProperties(smiles);
          if (!cancelled) setProperties(moleculeProps);
        }
      } catch (err) {
        console.error('Error rendering molecule:', err);
        if (!cancelled) {
          setSvgContent(placeholderSVG(width, height, 'Structure unavailable'));
          setProperties(null);
        }
      } finally {
        if (!cancelled) setRendering(false);
      }
    };

    loadMolecule();

    return () => {
      cancelled = true;
    };
  }, [smiles, isLoaded, width, height, showProperties, getMoleculeSVG, getMoleculeProperties]);

  const frameSx = {
    width,
    height,
    display: 'flex',
    flexDirection: 'column' as const,
    alignItems: 'center',
    justifyContent: 'center',
    borderRadius: 2,
  };

  // RDKit itself failed to load — show a static notice instead of spinning.
  if (error && !isLoaded) {
    return (
      <Box
        className={className}
        sx={frameSx}
        dangerouslySetInnerHTML={{
          __html: placeholderSVG(width, height, 'Structure renderer unavailable'),
        }}
      />
    );
  }

  if (!smiles) {
    return (
      <Box
        className={className}
        sx={frameSx}
        dangerouslySetInnerHTML={{ __html: placeholderSVG(width, height, 'No structure') }}
      />
    );
  }

  if (isLoading || rendering || !svgContent) {
    return (
      <Box className={className} sx={frameSx}>
        <CircularProgress size={28} sx={{ mb: 1.5 }} />
        <Typography variant="caption" color="text.secondary">
          Loading structure…
        </Typography>
      </Box>
    );
  }

  return (
    <Box className={className}>
      <Box
        sx={{
          width,
          height,
          borderRadius: 2,
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'center',
          overflow: 'hidden',
          '& svg': {
            maxWidth: '100%',
            maxHeight: '100%',
            width: '100%',
            height: '100%',
          },
        }}
        dangerouslySetInnerHTML={{ __html: svgContent }}
      />

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
