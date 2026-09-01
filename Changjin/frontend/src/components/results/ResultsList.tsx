import React, { useState } from 'react';
import {
  Typography,
  Box,
  Alert,
  Pagination,
  FormControl,
  InputLabel,
  Select,
  MenuItem,
  TextField,
  InputAdornment,
  Button,
  Card,
  Skeleton,
  useTheme,
  alpha,
} from '@mui/material';
import {
  Search as SearchIcon,
  FileDownloadOutlined as DownloadIcon,
  ScienceOutlined as ScienceIcon,
} from '@mui/icons-material';
import type { SearchResponse, Compound } from '../../types/api';
import { CompoundCard } from './CompoundCard';
import { useSubstitutabilitySummaries } from '../../hooks/useSubstitutabilitySummaries';
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

const RESULTS_GRID_SX = {
  display: 'grid',
  gridTemplateColumns: {
    xs: '1fr',
    sm: 'repeat(2, 1fr)',
    md: 'repeat(3, 1fr)',
  },
  gap: 3,
} as const;

const SkeletonCard: React.FC = () => (
  <Card elevation={0} sx={{ p: 2.5 }}>
    <Box sx={{ display: 'flex', justifyContent: 'space-between', mb: 2 }}>
      <Skeleton variant="text" width="55%" height={26} />
      <Skeleton variant="rounded" width={56} height={22} sx={{ borderRadius: 999 }} />
    </Box>
    <Skeleton variant="rounded" height={130} sx={{ mb: 2, borderRadius: 3 }} />
    <Skeleton variant="text" width="90%" />
    <Skeleton variant="text" width="65%" />
  </Card>
);

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
  const theme = useTheme();
  const [exportDialogOpen, setExportDialogOpen] = useState(false);
  // null means "export everything on screen"; a compound means just that one.
  const [exportSubject, setExportSubject] = useState<Compound | null>(null);
  const [onlySubstitutable, setOnlySubstitutable] = useState(false);

  const shown = results?.results ?? [];
  const summaries = useSubstitutabilitySummaries(shown);
  const withData = shown.filter(c => summaries.has(c.chembl_id));
  const visible = onlySubstitutable ? withData : shown;

  const handleSearchQueryChange = (event: React.ChangeEvent<HTMLInputElement>) => {
    onSearchQueryChange?.(event.target.value);
  };

  // Loading state — skeleton grid keeps layout stable
  if (isLoading) {
    return (
      <Box aria-busy="true" aria-live="polite">
        <Typography variant="body2" color="text.secondary" sx={{ mb: 3 }}>
          Searching compounds… this may take a few moments.
        </Typography>
        <Box sx={RESULTS_GRID_SX}>
          {Array.from({ length: 6 }).map((_, index) => (
            <SkeletonCard key={index} />
          ))}
        </Box>
      </Box>
    );
  }

  // Error state
  if (error) {
    return (
      <Alert severity="error" sx={{ mb: 3 }}>
        <Typography variant="subtitle2" gutterBottom>
          Search failed
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
          py: 10,
          textAlign: 'center',
        }}
      >
        <Box
          sx={{
            width: 72,
            height: 72,
            borderRadius: '22px',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            mb: 3,
            backgroundColor: alpha(theme.palette.primary.main, 0.07),
            color: 'primary.main',
          }}
        >
          <ScienceIcon sx={{ fontSize: 34 }} />
        </Box>
        <Typography variant="h5" gutterBottom>
          No compounds found
        </Typography>
        <Typography variant="body2" color="text.secondary" sx={{ maxWidth: 420 }}>
          {results?.best_similarity != null && results.threshold != null ? (
            <>
              Nothing in the demo corpus reaches the{' '}
              {results.threshold.toFixed(2)} Tanimoto threshold. The closest is{' '}
              <strong>{results.best_similarity.toFixed(3)}</strong> — the query is
              genuinely unlike anything in the subset, rather than mismatched.
            </>
          ) : (
            'Try adjusting your search criteria, relaxing the property filters, or lowering the similarity threshold.'
          )}
        </Typography>
      </Box>
    );
  }

  return (
    <Box>
      {/* Toolbar */}
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
        <Typography variant="body2" color="text.secondary">
          <Box component="strong" sx={{ color: 'text.primary', fontWeight: 700 }}>
            {results.count}
          </Box>{' '}
          {results.count === 1 ? 'compound' : 'compounds'} found
        </Typography>

        <Box sx={{ display: 'flex', gap: 1.5, alignItems: 'center', flexWrap: 'wrap' }}>
          <TextField
            size="small"
            placeholder="Filter results…"
            aria-label="Filter these results by name, ChEMBL id or SMILES"
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

          <FormControl size="small" sx={{ minWidth: 170 }}>
            <InputLabel>Sort by</InputLabel>
            <Select
              value={sortBy}
              label="Sort by"
              onChange={(event) => onSortChange?.(event.target.value)}
            >
              <MenuItem value="similarity">Similarity (high to low)</MenuItem>
              <MenuItem value="name">Compound name</MenuItem>
              <MenuItem value="molecular_weight">Molecular weight</MenuItem>
            </Select>
          </FormControl>

          <Button
            variant="outlined"
            startIcon={<DownloadIcon />}
            onClick={() => {
              setExportSubject(null);
              setExportDialogOpen(true);
            }}
            size="medium"
          >
            Export
          </Button>
        </Box>
      </Box>

      {/* Answers "which of these can I actually swap?" before the reader has to
          open anything. Hidden when none of the results carry FDA data, where a
          banner reading "0 of 40" is noise rather than an offer. */}
      {withData.length > 0 && (
        <Alert
          severity="success"
          variant="outlined"
          sx={{ mb: 3 }}
          action={
            <Button
              size="small"
              onClick={() => setOnlySubstitutable(v => !v)}
              sx={{ whiteSpace: 'nowrap' }}
            >
              {onlySubstitutable ? 'Show all results' : 'Show only these'}
            </Button>
          }
        >
          <Typography variant="body2">
            <strong>{withData.length}</strong> of {shown.length} result
            {shown.length === 1 ? '' : 's'} {withData.length === 1 ? 'has' : 'have'} an
            FDA-rated equivalent — the cards below say what a pharmacist may do and
            what it saves.
          </Typography>
        </Alert>
      )}

      {/* Results Grid */}
      <Box sx={RESULTS_GRID_SX}>
        {visible.map((compound, index) => (
          <Box
            key={compound.chembl_id}
            className="anim-fade-up"
            sx={{ animationDelay: `${Math.min(index, 8) * 0.05}s`, display: 'flex' }}
          >
            <CompoundCard
              compound={compound}
              substitutability={summaries.get(compound.chembl_id)}
              onViewDetails={onViewDetails}
              onExport={(subject) => {
                setExportSubject(subject);
                setExportDialogOpen(true);
              }}
              showProperties={true}
            />
          </Box>
        ))}
      </Box>

      {/* Pagination */}
      {totalPages > 1 && (
        <Box sx={{ display: 'flex', justifyContent: 'center', mt: 5 }}>
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
        <Alert severity="info" sx={{ mt: 4 }}>
          <Typography variant="body2">
            {results.post_processed.clusters.length > 0 && (
              <>
                These results fall into{' '}
                <strong>{results.post_processed.clusters.length}</strong> structural
                cluster{results.post_processed.clusters.length === 1 ? '' : 's'}{' '}
                (Taylor&ndash;Butina, Tanimoto &ge;{' '}
                {results.post_processed.clusters[0].similarity_threshold}).{' '}
              </>
            )}
            {results.post_processed.filtered_out.length > 0
              ? `${results.post_processed.filtered_out.length} compound${
                  results.post_processed.filtered_out.length === 1 ? '' : 's'
                } matched structurally but were removed by the property filters — ` +
                `for example ${results.post_processed.filtered_out[0].chembl_id}: ` +
                `${results.post_processed.filtered_out[0].reason}.`
              : 'No compound was removed by the property filters.'}
          </Typography>
        </Alert>
      )}

      {/* Export Dialog */}
      <ExportDialog
        compounds={exportSubject ? [exportSubject] : results.results}
        open={exportDialogOpen}
        onClose={() => setExportDialogOpen(false)}
      />
    </Box>
  );
};
