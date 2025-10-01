import React, { useState } from 'react';
import {
  Typography,
  Box,
  Alert,
  CircularProgress,
  Pagination,
  FormControl,
  InputLabel,
  Select,
  MenuItem,
  TextField,
  InputAdornment,
  Button,
} from '@mui/material';
import { Search as SearchIcon, Download as DownloadIcon } from '@mui/icons-material';
import type { SearchResponse, Compound } from '../../types/api';
import { CompoundCard } from './CompoundCard';
import { ExportDialog } from '../export/ExportDialog';

interface ResultsListProps {
  results: SearchResponse | null;
  isLoading: boolean;
  error: Error | null;
  onViewDetails?: (compound: Compound) => void;
  currentPage?: number;
  totalPages?: number;
  onPageChange?: (page: number) => void;
  onSortChange?: (sortBy: string) => void;
  sortBy?: string;
  searchQuery?: string;
  onSearchQueryChange?: (query: string) => void;
}

export const ResultsList: React.FC<ResultsListProps> = ({
  results,
  isLoading,
  error,
  onViewDetails,
  currentPage = 1,
  totalPages = 1,
  onPageChange,
  onSortChange,
  sortBy = 'similarity',
  searchQuery = '',
  onSearchQueryChange,
}) => {
  const [exportDialogOpen, setExportDialogOpen] = useState(false);

  const handleSearchQueryChange = (event: React.ChangeEvent<HTMLInputElement>) => {
    onSearchQueryChange?.(event.target.value);
  };

  // Loading state
  if (isLoading) {
    return (
      <Box
        sx={{
          display: 'flex',
          flexDirection: 'column',
          alignItems: 'center',
          justifyContent: 'center',
          py: 8,
        }}
      >
        <CircularProgress size={60} sx={{ mb: 3 }} />
        <Typography variant="h6" color="text.secondary">
          Searching compounds...
        </Typography>
        <Typography variant="body2" color="text.secondary">
          This may take a few moments
        </Typography>
      </Box>
    );
  }

  // Error state
  if (error) {
    return (
      <Alert severity="error" sx={{ mb: 3 }}>
        <Typography variant="h6" gutterBottom>
          Search Failed
        </Typography>
        <Typography variant="body2">
          {error.message || 'An error occurred while searching for compounds.'}
        </Typography>
      </Alert>
    );
  }

  // No results state
  if (!results || results.count === 0) {
    return (
      <Box
        sx={{
          display: 'flex',
          flexDirection: 'column',
          alignItems: 'center',
          justifyContent: 'center',
          py: 8,
          textAlign: 'center',
        }}
      >
        <SearchIcon sx={{ fontSize: 64, color: 'text.secondary', mb: 2 }} />
        <Typography variant="h6" color="text.secondary" gutterBottom>
          No compounds found
        </Typography>
        <Typography variant="body2" color="text.secondary">
          Try adjusting your search criteria or similarity threshold.
        </Typography>
      </Box>
    );
  }

  return (
    <Box>
      {/* Results Header */}
      <Box
        sx={{
          display: 'flex',
          justifyContent: 'space-between',
          alignItems: 'center',
          mb: 3,
          flexWrap: 'wrap',
          gap: 2,
        }}
      >
        <Typography variant="h5" component="h2">
          Search Results ({results.count} compounds)
        </Typography>

        <Box sx={{ display: 'flex', gap: 2, alignItems: 'center' }}>
          {/* Export Button */}
          <Button
            variant="outlined"
            startIcon={<DownloadIcon />}
            onClick={() => setExportDialogOpen(true)}
            size="small"
          >
            Export Results
          </Button>

          {/* Sort Dropdown */}
          <FormControl size="small" sx={{ minWidth: 150 }}>
            <InputLabel>Sort by</InputLabel>
            <Select
              value={sortBy}
              label="Sort by"
              onChange={(event) => onSortChange?.(event.target.value)}
            >
              <MenuItem value="similarity">Similarity (High to Low)</MenuItem>
              <MenuItem value="name">Compound Name</MenuItem>
              <MenuItem value="molecular_weight">Molecular Weight</MenuItem>
            </Select>
          </FormControl>

          {/* Filter Search */}
          <TextField
            size="small"
            placeholder="Filter compounds..."
            value={searchQuery}
            onChange={handleSearchQueryChange}
            InputProps={{
              startAdornment: (
                <InputAdornment position="start">
                  <SearchIcon fontSize="small" />
                </InputAdornment>
              ),
            }}
            sx={{ minWidth: 200 }}
          />
        </Box>
      </Box>

      {/* Results Grid */}
      <Box
        sx={{
          display: 'grid',
          gridTemplateColumns: {
            xs: '1fr',
            sm: '1fr 1fr',
            md: '1fr 1fr 1fr',
            lg: '1fr 1fr 1fr 1fr',
          },
          gap: 3,
        }}
      >
        {results.results.map((compound) => (
          <CompoundCard
            key={compound.chembl_id}
            compound={compound}
            onViewDetails={onViewDetails}
            showProperties={true}
          />
        ))}
      </Box>

      {/* Pagination */}
      {totalPages > 1 && (
        <Box sx={{ display: 'flex', justifyContent: 'center', mt: 4 }}>
          <Pagination
            count={totalPages}
            page={currentPage}
            onChange={(_, page) => onPageChange?.(page)}
            color="primary"
            size="large"
          />
        </Box>
      )}

      {/* Post-processing Info */}
      {results.post_processed && (
        <Alert severity="info" sx={{ mt: 3 }}>
          <Typography variant="body2">
            Results include post-processing with clustering and drug-likeness filtering.
            {results.post_processed.filtered_out.length > 0 &&
              ` ${results.post_processed.filtered_out.length} compounds were filtered out.`
            }
          </Typography>
        </Alert>
      )}

      {/* Export Dialog */}
      <ExportDialog
        compounds={results.results}
        open={exportDialogOpen}
        onClose={() => setExportDialogOpen(false)}
      />
    </Box>
  );
};
