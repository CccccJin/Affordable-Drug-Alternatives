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
import { formatSimilarity } from '../../services/utils/rdkitUtils';
import { MoleculeViewer } from '../molecules/MoleculeViewer';
import { useRDKit } from '../../hooks/useRDKit';

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
      <DialogTitle sx={{ pb: 1 }}>
        <Box sx={{ display: 'flex', alignItems: 'center', gap: 2 }}>
            <Typography variant="h5" component="span">
              {compound.chembl_id}
            </Typography>
            {compound.pref_name && (
              <Typography variant="body1" color="text.secondary" component="span">
                {compound.pref_name}
              </Typography>
            )}
          <Chip
            label={formatSimilarity(compound.similarity)}
            color="primary"
            size="small"
            sx={{ ml: 'auto' }}
          />
        </Box>
      </DialogTitle>

      <DialogContent dividers>
        <Box sx={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 3 }}>
          {/* Left Column - Structure & Basic Info */}
          <Box>
            <Typography variant="h6" gutterBottom>
              Molecular Structure
            </Typography>

            <Box sx={{ mb: 3 }}>
              <MoleculeViewer
                smiles={compound.smiles}
                width={300}
                height={250}
                showProperties={true}
              />
            </Box>

            <Typography variant="body2" color="text.secondary" sx={{ fontFamily: 'monospace' }}>
              SMILES: {compound.smiles}
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
      </DialogContent>

      <DialogActions>
        <Button onClick={onClose}>
          Close
        </Button>
        <Button variant="contained" color="primary">
          Export Data
        </Button>
        <Button variant="outlined">
          Add to Favorites
        </Button>
      </DialogActions>
    </Dialog>
  );
};
