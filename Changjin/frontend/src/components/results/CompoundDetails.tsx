import React, { useState, useEffect } from 'react';
import {
  Dialog,
  DialogTitle,
  DialogContent,
  DialogActions,
  Button,
  Typography,
  Box,
  Chip,
  Divider,
  Table,
  TableBody,
  TableCell,
  TableContainer,
  TableRow,
  Paper,
} from '@mui/material';
import type { Compound } from '../../types/api';
import { useDescriptors } from '../../hooks/useDescriptors';
import { formatSimilarity } from '../../services/utils/formatting';
import { MoleculeViewer } from '../molecules/MoleculeViewer';
import { useRDKit } from '../../hooks/useRDKit';
import { SubstitutabilityPanel } from './SubstitutabilityPanel';

interface MoleculeProperties {
  molecularWeight: number;
  logP: number;
  hBondDonors: number;
  hBondAcceptors: number;
  rotatableBonds: number;
  ringCount: number;
  aromaticRingCount: number;
}

interface CompoundDetailsProps {
  compound: Compound | null;
  open: boolean;
  onClose: () => void;
}

export const CompoundDetails: React.FC<CompoundDetailsProps> = ({
  compound,
  open,
  onClose,
}) => {
  const { getMoleculeProperties, isLoading: rdkitLoading } = useRDKit();
  // The dialog shows the corpus descriptors when it has them and falls back to
  // computing with RDKit when it does not. Requesting them here means the
  // fallback is reserved for compounds genuinely missing a value, rather than
  // for every compound simply because the file had not been fetched.
  useDescriptors();
  const [calculatedProperties, setCalculatedProperties] = useState<MoleculeProperties | null>(null);
  const [propertiesLoading, setPropertiesLoading] = useState(false);

  // Calculate properties when compound changes
  useEffect(() => {
    if (!compound || !open) {
      setCalculatedProperties(null);
      return;
    }

    const loadProperties = async () => {
      if (compound.molecular_weight != null || compound.logp != null) {
        setCalculatedProperties({
          molecularWeight: compound.molecular_weight || 0,
          logP: compound.logp || 0,
          hBondDonors: compound.h_bond_donors || 0,
          hBondAcceptors: compound.h_bond_acceptors || 0,
          rotatableBonds: compound.rotatable_bonds || 0,
          ringCount: compound.aromatic_rings || 0,
          aromaticRingCount: compound.aromatic_rings || 0,
        });
        return;
      }

      setPropertiesLoading(true);
      try {
        const properties = await getMoleculeProperties(compound.smiles);
        setCalculatedProperties(properties);
      } catch (error) {
        console.error('Failed to calculate properties:', error);
        setCalculatedProperties(null);
      } finally {
        setPropertiesLoading(false);
      }
    };

    loadProperties();
  }, [compound, open, getMoleculeProperties]);

  if (!compound) return null;

  const formatProperty = (value: number, decimals: number = 2): string => {
    return isNaN(value) ? 'N/A' : value.toFixed(decimals);
  };

  const properties = calculatedProperties || {
    molecularWeight: 0,
    logP: 0,
    hBondDonors: 0,
    hBondAcceptors: 0,
    rotatableBonds: 0,
    ringCount: 0,
    aromaticRingCount: 0,
  };

  return (
    <Dialog
      open={open}
      onClose={onClose}
      maxWidth="md"
      fullWidth
      PaperProps={{
        sx: { minHeight: '70vh' },
      }}
    >
      <DialogTitle sx={{ pb: 1.5, pt: 3, px: 3 }}>
        <Box sx={{ display: 'flex', alignItems: 'center', gap: 2, flexWrap: 'wrap' }}>
          <Box>
            <Typography variant="h4" component="span" sx={{ display: 'block' }}>
              {compound.pref_name || compound.chembl_id}
            </Typography>
            <Typography
              variant="caption"
              color="text.secondary"
              sx={{ fontFamily: 'ui-monospace, Menlo, monospace' }}
            >
              {compound.chembl_id}
            </Typography>
          </Box>
          <Chip
            label={`Similarity ${formatSimilarity(compound.similarity)}`}
            color="primary"
            size="small"
            sx={{ ml: 'auto', fontWeight: 600 }}
          />
        </Box>
      </DialogTitle>

      <DialogContent dividers sx={{ px: 3 }}>
        <Box
          sx={{
            display: 'grid',
            gridTemplateColumns: { xs: '1fr', md: '1fr 1fr' },
            gap: 3,
          }}
        >
          {/* Left Column - Structure & Basic Info */}
          <Box>
            <Typography variant="h6" gutterBottom>
              Molecular Structure
            </Typography>

            <Box
              sx={{
                mb: 3,
                p: 1.5,
                borderRadius: 3,
                border: '1px solid',
                borderColor: 'divider',
                display: 'inline-block',
              }}
            >
              <MoleculeViewer
                smiles={compound.smiles}
                width={300}
                height={250}
                showProperties={true}
                label={compound.pref_name || compound.chembl_id}
              />
            </Box>

            <Typography
              variant="body2"
              color="text.secondary"
              sx={{
                fontFamily: 'ui-monospace, Menlo, monospace',
                fontSize: '0.75rem',
                wordBreak: 'break-all',
                p: 1.5,
                borderRadius: 2,
                bgcolor: 'action.hover',
              }}
            >
              {compound.smiles}
            </Typography>
          </Box>

          {/* Right Column - Properties Table */}
          <Box>
            <Typography variant="h6" gutterBottom>
              Molecular Properties
            </Typography>

            {propertiesLoading || rdkitLoading ? (
              <Box sx={{ display: 'flex', justifyContent: 'center', p: 3 }}>
                <Typography variant="body2" color="text.secondary">
                  Calculating properties...
                </Typography>
              </Box>
            ) : (
              <TableContainer component={Paper} variant="outlined">
                <Table size="small">
                  <TableBody>
                    <TableRow>
                      <TableCell component="th" scope="row" sx={{ fontWeight: 600 }}>
                        Molecular Weight
                      </TableCell>
                      <TableCell>{formatProperty(properties.molecularWeight)} g/mol</TableCell>
                    </TableRow>
                    <TableRow>
                      <TableCell component="th" scope="row" sx={{ fontWeight: 600 }}>
                        LogP
                      </TableCell>
                      <TableCell>{formatProperty(properties.logP)}</TableCell>
                    </TableRow>
                    <TableRow>
                      <TableCell component="th" scope="row" sx={{ fontWeight: 600 }}>
                        H-Bond Donors
                      </TableCell>
                      <TableCell>{properties.hBondDonors}</TableCell>
                    </TableRow>
                    <TableRow>
                      <TableCell component="th" scope="row" sx={{ fontWeight: 600 }}>
                        H-Bond Acceptors
                      </TableCell>
                      <TableCell>{properties.hBondAcceptors}</TableCell>
                    </TableRow>
                    <TableRow>
                      <TableCell component="th" scope="row" sx={{ fontWeight: 600 }}>
                        Rotatable Bonds
                      </TableCell>
                      <TableCell>{properties.rotatableBonds}</TableCell>
                    </TableRow>
                    <TableRow>
                      <TableCell component="th" scope="row" sx={{ fontWeight: 600 }}>
                        Ring Count
                      </TableCell>
                      <TableCell>{properties.ringCount}</TableCell>
                    </TableRow>
                    <TableRow>
                      <TableCell component="th" scope="row" sx={{ fontWeight: 600 }}>
                        Aromatic Rings
                      </TableCell>
                      <TableCell>{properties.aromaticRingCount}</TableCell>
                    </TableRow>
                  </TableBody>
                </Table>
              </TableContainer>
            )}
          </Box>
        </Box>

        {/* Full Width - Additional Information */}
        <Box sx={{ mt: 3 }}>
          <Divider sx={{ my: 2 }} />
          
          <Typography variant="h6" gutterBottom>
            Structural Information
          </Typography>

          <Box sx={{ mb: 2 }}>
            <Typography variant="body2" paragraph>
              This compound shows high structural similarity to the query molecule. 
              The similarity score indicates a strong match in molecular topology and 
              functional groups, making it a promising candidate for further investigation.
            </Typography>
          </Box>

          <Typography variant="h6" gutterBottom>
            Biological Activity
          </Typography>

          <Typography variant="body2" color="text.secondary">
            Activity data and target information would be displayed here when connected to the real database.
          </Typography>
        </Box>

        <SubstitutabilityPanel compound={compound} />
      </DialogContent>

      <DialogActions sx={{ px: 3, py: 2, gap: 1 }}>
        <Button onClick={onClose} sx={{ mr: 'auto', color: 'text.secondary' }}>
          Close
        </Button>
        <Button variant="outlined">
          Add to favorites
        </Button>
        <Button variant="contained" color="primary">
          Export data
        </Button>
      </DialogActions>
    </Dialog>
  );
};
