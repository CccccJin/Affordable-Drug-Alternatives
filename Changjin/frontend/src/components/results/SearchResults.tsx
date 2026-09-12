import React, { Suspense, lazy, useEffect, useState } from 'react';
import {
  Box,
  Typography,
  Button,
  Alert,
  Chip,
  Stack,
  Tabs,
  Tab,
  CircularProgress,
  useTheme,
  alpha,
} from '@mui/material';
import { AutoAwesome as SparkleIcon } from '@mui/icons-material';
import { Link as RouterLink, useSearchParams } from 'react-router-dom';
import { useDispatch, useSelector } from 'react-redux';
import type { RootState } from '../../store/store';
import { setSelectedCompound } from '../../store/slices/resultsSlice';
import { ResultsList } from './ResultsList';
import { SimilarityCaveat } from './SimilarityCaveat';
import { CompoundDetails } from './CompoundDetails';
/** Behind the Analytics tab, and the rest of this page's recharts weight. */
const AnalyticsDashboard = lazy(() =>
  import('../charts/AnalyticsDashboard').then(m => ({ default: m.AnalyticsDashboard })));
import {
  DEFAULT_SIMILARITY_THRESHOLD,
  StaticSearchApi,
  withLoadedDescriptors,
} from '../../services/api/staticSearchApi';
import type { Compound, SearchResponse } from '../../types/api';
import { useDescriptors } from '../../hooks/useDescriptors';
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
  const descriptors = useDescriptors(sortBy === 'molecular_weight');
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

  };

  const handleSortChange = (newSortBy: string) => {
    setSortBy(newSortBy);
    setCurrentPage(1);
  };

  useEffect(() => {
    let cancelled = false;
    setCurrentPage(1);
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

        if (!cancelled) setResults(response);
      } catch (searchError) {
        if (!cancelled) setError(searchError instanceof Error ? searchError : new Error('Search failed'));
      } finally {
        if (!cancelled) setIsLoading(false);
      }
    };

    runSearch();
    return () => { cancelled = true; };
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

    const hydrated = descriptors.ready ? withLoadedDescriptors(filtered) : filtered;
    const sorted = [...hydrated].sort((left, right) => {
      if (sortBy === 'name') {
        return (left.pref_name || left.chembl_id).localeCompare(
          right.pref_name || right.chembl_id
        );
      }

      if (sortBy === 'molecular_weight') {
        return (left.molecular_weight ?? Infinity) - (right.molecular_weight ?? Infinity);
      }

      return right.similarity - left.similarity;
    });

    return {
      ...results,
      count: sorted.length,
      results: sorted,
    };
  }, [filterQuery, results, sortBy, descriptors.ready]);

  const activeFilterEntries = Object.entries(searchState.filters);

  return (
    <Box>
      <Button component={RouterLink} to="/search" sx={{ mb: 2 }}>← New search</Button>
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

      <SimilarityCaveat />

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
            onSearchQueryChange={value => { setFilterQuery(value); setCurrentPage(1); }}
          />
        ) : (
          <Suspense fallback={<Box sx={{ display: 'flex', justifyContent: 'center', py: 8 }}><CircularProgress size={24} /></Box>}>
            {isLoading ? <Box role="status" sx={{ py: 6 }}>Loading search results…</Box> : error ? <Alert severity="error">{error.message}</Alert> : <AnalyticsDashboard compounds={visibleResults?.results || []} />}
          </Suspense>
        )}
      </Box>

      {/* Compound Details Modal */}
      <CompoundDetails
        compound={selectedCompound}
        open={!!selectedCompound}
        onClose={handleCloseDetails}
      />

      <Box component="details" sx={{ mt: 3, color: 'text.secondary' }}>
        <Box component="summary" sx={{ cursor: 'pointer', py: 1 }}>Search method and coverage</Box>
        <Typography variant="body2">Morgan/Tanimoto (ECFP4, radius 2, 1024 bits) over the named ChEMBL subset. Analytics reflect the current filtered results, up to 50 matches.</Typography>
      </Box>
    </Box>
  );
};
