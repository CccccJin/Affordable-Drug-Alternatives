import React, { useState } from 'react';
import {
  Dialog,
  DialogTitle,
  DialogContent,
  DialogActions,
  Button,
  Typography,
  Box,
  FormControl,
  FormLabel,
  RadioGroup,
  FormControlLabel,
  Radio,
  Switch,
  FormControlLabel as SwitchLabel,
  Alert,
  Card,
  CardContent,
  Chip,
} from '@mui/material';
import { Download as DownloadIcon, FileDownload as FileIcon } from '@mui/icons-material';
import type { Compound } from '../../types/api';
import { ExportService, type ExportFormat, type ExportOptions } from '../../services/export/ExportService';

interface ExportDialogProps {
  compounds: Compound[];
  open: boolean;
  onClose: () => void;
}

export const ExportDialog: React.FC<ExportDialogProps> = ({
  compounds,
  open,
  onClose,
}) => {
  const [selectedFormat, setSelectedFormat] = useState<ExportFormat>('csv');
  const [includeProperties, setIncludeProperties] = useState(true);
  const [isExporting, setIsExporting] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const supportedFormats = ExportService.getSupportedFormats();

  const handleExport = async () => {
    if (compounds.length === 0) {
      setError('No compounds to export');
      return;
    }

    setIsExporting(true);
    setError(null);

    try {
      const options: ExportOptions = {
        format: selectedFormat,
        includeProperties,
        filename: `chemical_search_results_${new Date().toISOString().split('T')[0]}`,
      };

      await ExportService.exportCompounds(compounds, options);

      // Close dialog after successful export
      onClose();
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Export failed');
    } finally {
      setIsExporting(false);
    }
  };

  const handleClose = () => {
    if (!isExporting) {
      setError(null);
      onClose();
    }
  };

  const getFormatDescription = (format: ExportFormat): string => {
    const formatInfo = supportedFormats.find(f => f.format === format);
    return formatInfo?.description || '';
  };

  return (
    <Dialog
      open={open}
      onClose={handleClose}
      maxWidth="sm"
      fullWidth
      disableEscapeKeyDown={isExporting}
    >
      <DialogTitle sx={{ pb: 1 }}>
        <Box sx={{ display: 'flex', alignItems: 'center', gap: 2 }}>
          <DownloadIcon color="primary" />
          <Typography variant="h6">
            Export Search Results
          </Typography>
        </Box>
      </DialogTitle>

      <DialogContent dividers>
        {/* Summary */}
        <Box sx={{ mb: 3, p: 2, bgcolor: 'grey.50', borderRadius: 1 }}>
          <Typography variant="body2" color="text.secondary" gutterBottom>
            Export Summary:
          </Typography>
          <Box sx={{ display: 'flex', gap: 2, alignItems: 'center' }}>
            <Chip
              label={`${compounds.length} compounds`}
              color="primary"
              size="small"
            />
            <Typography variant="body2" color="text.secondary">
              ready for export
            </Typography>
          </Box>
        </Box>

        {error && (
          <Alert severity="error" sx={{ mb: 3 }}>
            {error}
          </Alert>
        )}

        {/* Format Selection */}
        <FormControl component="fieldset" sx={{ mb: 3 }}>
          <FormLabel component="legend" sx={{ mb: 2 }}>
            Export Format
          </FormLabel>
          <RadioGroup
            value={selectedFormat}
            onChange={(e) => setSelectedFormat(e.target.value as ExportFormat)}
          >
            {supportedFormats.map((format) => (
              <Card
                key={format.format}
                elevation={selectedFormat === format.format ? 2 : 0}
                sx={{
                  mb: 1,
                  border: selectedFormat === format.format ? 2 : 1,
                  borderColor: selectedFormat === format.format ? 'primary.main' : 'divider',
                }}
              >
                <CardContent sx={{ py: 2 }}>
                  <FormControlLabel
                    value={format.format}
                    control={<Radio />}
                    label={
                      <Box>
                        <Typography variant="subtitle2" sx={{ fontWeight: 600 }}>
                          {format.label}
                        </Typography>
                        <Typography variant="body2" color="text.secondary">
                          {format.description}
                        </Typography>
                      </Box>
                    }
                  />
                </CardContent>
              </Card>
            ))}
          </RadioGroup>
        </FormControl>

        {/* Export Options */}
        <Box sx={{ mb: 3 }}>
          <SwitchLabel
            control={
              <Switch
                checked={includeProperties}
                onChange={(e) => setIncludeProperties(e.target.checked)}
                color="primary"
              />
            }
            label="Include calculated molecular properties"
          />

          <Typography variant="body2" color="text.secondary" sx={{ mt: 1 }}>
            Adds columns for molecular weight, LogP, hydrogen bond donors/acceptors, etc.
          </Typography>
        </Box>

        {/* Format Preview */}
        <Alert severity="info" sx={{ mt: 2 }}>
          <Typography variant="body2">
            <strong>Format Details:</strong>
            <br />
            {getFormatDescription(selectedFormat)}
            {includeProperties && (
              <>
                <br /><br />
                <strong>Including:</strong> Molecular properties (MW, LogP, HBD, HBA, etc.)
              </>
            )}
          </Typography>
        </Alert>
      </DialogContent>

      <DialogActions>
        <Button onClick={handleClose} disabled={isExporting}>
          Cancel
        </Button>
        <Button
          variant="contained"
          startIcon={isExporting ? undefined : <FileIcon />}
          onClick={handleExport}
          disabled={isExporting || compounds.length === 0}
          color="primary"
        >
          {isExporting ? 'Exporting...' : `Export ${compounds.length} Compounds`}
        </Button>
      </DialogActions>
    </Dialog>
  );
};
