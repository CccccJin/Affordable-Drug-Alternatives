import React, { useEffect, useState } from 'react';
import {
  Box,
  Typography,
  Alert,
  Chip,
  Stack,
  Tabs,
  Tab,
  useTheme,
  alpha,
} from '@mui/material';
import { AutoAwesome as SparkleIcon } from '@mui/icons-material';
import { useSearchParams } from 'react-router-dom';
import { useDispatch, useSelector } from 'react-redux';
import type { RootState } from '../../store/store';
import { setSelectedCompound } from '../../store/slices/resultsSlice';
import { ResultsList } from './ResultsList';
import { CompoundDetails } from './CompoundDetails';
import { AnalyticsDashboard } from '../charts/AnalyticsDashboard';
import {
  DEFAULT_SIMILARITY_THRESHOLD,
  StaticSearchApi,
} from '../../services/api/staticSearchApi';
import type { Compound, SearchResponse } from '../../types/api';
import { monoStack } from '../../styles/theme';

export const SearchResults: React.FC = () => {
  const theme = useTheme();
  const [searchParams] = useSearchParams();
  const dispatch = useDispatch();
  const searchState = useSelector((state: RootState) => state.search);
  const selectedCompound = useSelector(
    (state: RootState) => state.results.selectedCompound
  );

  // Get search parameters from URL or Redux state
  const query = searchParams.get('query') || searchState.query;
  const searchType =
    (searchParams.get('type') as 'smiles' | 'name') || searchState.searchType;
  const useAI = searchParams.get('ai') === 'true';

  const [currentPage, setCurrentPage] = useState(1);
  const [sortBy, setSortBy] = useState('similarity');
  const [filterQuery, setFilterQuery] = useState('');
  const [activeTab, setActiveTab] = useState(0);
  const [results, setResults] = useState<SearchResponse | null>(null);
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState<Error | null>(null);

  const handleViewDetails = (compound: Compound) => {
    dispatch(setSelectedCompound(compound));
  };

  const handleCloseDetails = () => {
    dispatch(setSelectedCompound(null));
  };

  const handlePageChange = (page: number) => {
    setCurrentPage(page);
    // TODO: Implement pagination
  };

  const handleSortChange = (newSortBy: string) => {
    setSortBy(newSortBy);
  };

  useEffect(() => {
    const runSearch = async () => {
      if (!query) {
        setResults(null);
        return;
      }

      setIsLoading(true);
      setError(null);

      try {
        let searchQuery = query;
        if (searchType === 'name') {
          const resolved = await StaticSearchApi.resolveName({ name: query });
          searchQuery = resolved.smiles;
        }

        const response = useAI
          ? await StaticSearchApi.searchAI()
          : await StaticSearchApi.search({
              smiles: searchQuery,
              threshold: DEFAULT_SIMILARITY_THRESHOLD,
              max_results: 50,
              enable_post_processing: true,
              filters: searchState.filters,
            });

        setResults(response);
      } catch (searchError) {
        setError(searchError instanceof Error ? searchError : new Error('Search failed'));
      } finally {
        setIsLoading(false);
      }
    };

    runSearch();
  }, [query, searchType, useAI, searchState.filters]);

  const visibleResults = React.useMemo(() => {
    if (!results) {
      return null;
    }

    const normalizedFilter = filterQuery.trim().toLowerCase();
    const filtered = normalizedFilter
      ? results.results.filter(
          (compound) =>
            compound.chembl_id.toLowerCase().includes(normalizedFilter) ||
            (compound.pref_name || '').toLowerCase().includes(normalizedFilter) ||
            compound.smiles.toLowerCase().includes(normalizedFilter)
        )
      : results.results;

    const sorted = [...filtered].sort((left, right) => {
      if (sortBy === 'name') {
        return (left.pref_name || left.chembl_id).localeCompare(
          right.pref_name || right.chembl_id
        );
      }

      if (sortBy === 'molecular_weight') {
        return (left.molecular_weight || 0) - (right.molecular_weight || 0);
      }

      return right.similarity - left.similarity;
    });

    return {
      ...results,
      count: sorted.length,
      results: sorted,
    };
  }, [filterQuery, results, sortBy]);

  const activeFilterEntries = Object.entries(searchState.filters);

  return (
    <Box>
      {/* Search summary */}
      <Box className="anim-fade-up" sx={{ mb: 4 }}>
        <Typography variant="overline" sx={{ color: 'primary.main', display: 'block', mb: 0.5 }}>
          Results
        </Typography>
        <Typography variant="h2" component="h1" sx={{ mb: 2 }}>
          Similar compounds
        </Typography>

        <Stack direction="row" spacing={1} useFlexGap flexWrap="wrap" alignItems="center">
          <Chip
            label={query}
            sx={{
              fontFamily: searchType === 'smiles' ? monoStack : 'inherit',
              fontWeight: 600,
              maxWidth: 420,
              backgroundColor: alpha(theme.palette.primary.main, 0.08),
              color: 'primary.dark',
            }}
          />
          <Chip
            label={searchType === 'smiles' ? 'SMILES' : 'Name'}
            size="small"
            variant="outlined"
          />
          {useAI && (
            <Chip
              icon={<SparkleIcon sx={{ fontSize: 15 }} />}
              label="AI (ChemBERTa) — backend only"
              size="small"
              color="primary"
              variant="outlined"
            />
          )}
          {activeFilterEntries.map(([key, value]) => (
            <Chip
              key={key}
              label={`${key}: ${value}`}
              size="small"
              variant="outlined"
              sx={{ color: 'text.secondary' }}
            />
          ))}
        </Stack>
      </Box>

      {/* Tabs */}
      <Box
        className="anim-fade-up anim-delay-1"
        sx={{ borderBottom: `1px solid ${theme.palette.divider}`, mb: 4 }}
      >
        <Tabs
          value={activeTab}
          onChange={(_event, newValue) => setActiveTab(newValue)}
          aria-label="Result views"
        >
          <Tab label={`Compounds (${visibleResults?.count || 0})`} />
          <Tab label="Analytics" />
        </Tabs>
      </Box>

      {/* Tab content */}
      <Box className="anim-fade-up anim-delay-2">
        {activeTab === 0 ? (
          <ResultsList
            results={visibleResults}
            isLoading={isLoading}
            error={error}
            onViewDetails={handleViewDetails}
            currentPage={currentPage}
            totalPages={Math.ceil((visibleResults?.count || 0) / 20)}
            onPageChange={handlePageChange}
            onSortChange={handleSortChange}
            sortBy={sortBy}
            searchQuery={filterQuery}
            onSearchQueryChange={setFilterQuery}
          />
        ) : (
          <AnalyticsDashboard compounds={visibleResults?.results || []} />
        )}
      </Box>

      {/* Compound Details Modal */}
      <CompoundDetails
        compound={selectedCompound}
        open={!!selectedCompound}
        onClose={handleCloseDetails}
      />

      <Alert severity="info" sx={{ mt: 5 }}>
        <Typography variant="body2">
          Similarity is a real Morgan/Tanimoto computation (ECFP4, radius 2,
          1024 bits) run in your browser against <strong>public/data</strong>, so
          scores match what the FastAPI <code>/search</code> endpoint returns.
          What the static build limits is <em>coverage</em>: 5,000 compounds
          rather than the full ChEMBL 35 export.
        </Typography>
      </Alert>
    </Box>
  );
};
