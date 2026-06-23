import React, { useEffect, useState } from 'react';
import { Container, Box, Typography, Alert, Paper, Tabs, Tab } from '@mui/material';
import { useSearchParams } from 'react-router-dom';
import { useDispatch, useSelector } from 'react-redux';
import type { RootState } from '../../store/store';
import { setSelectedCompound } from '../../store/slices/resultsSlice';
import { ResultsList } from './ResultsList';
import { CompoundDetails } from './CompoundDetails';
import { AnalyticsDashboard } from '../charts/AnalyticsDashboard';
import { MockSearchApi } from '../../services/api/mockSearchApi';
import type { Compound, SearchResponse } from '../../types/api';

export const SearchResults: React.FC = () => {
  const [searchParams] = useSearchParams();
  const dispatch = useDispatch();
  const searchState = useSelector((state: RootState) => state.search);
  const selectedCompound = useSelector((state: RootState) => state.results.selectedCompound);

  // Get search parameters from URL or Redux state
  const query = searchParams.get('query') || searchState.query;
  const searchType = (searchParams.get('type') as 'smiles' | 'name') || searchState.searchType;
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
          const resolved = await MockSearchApi.resolveName({ name: query });
          searchQuery = resolved.smiles;
        }

        const response = useAI
          ? await MockSearchApi.searchAI({
              smiles: searchQuery,
              threshold: 0.7,
              max_results: 50,
              enable_post_processing: true,
              filters: searchState.filters,
            })
          : await MockSearchApi.search({
              smiles: searchQuery,
              threshold: 0.7,
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
      ? results.results.filter(compound =>
          compound.chembl_id.toLowerCase().includes(normalizedFilter)
          || (compound.pref_name || '').toLowerCase().includes(normalizedFilter)
          || compound.smiles.toLowerCase().includes(normalizedFilter)
        )
      : results.results;

    const sorted = [...filtered].sort((left, right) => {
      if (sortBy === 'name') {
        return (left.pref_name || left.chembl_id).localeCompare(right.pref_name || right.chembl_id);
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

  return (
    <Container maxWidth="xl">
      <Box sx={{ py: 4 }}>
        {/* Search Summary */}
        <Paper elevation={1} sx={{ p: 3, mb: 4 }}>
          <Typography variant="h4" gutterBottom>
            Search Results
          </Typography>

          <Box sx={{ display: 'flex', gap: 2, flexWrap: 'wrap', alignItems: 'center' }}>
            <Typography variant="body1">
              <strong>Query:</strong> {query}
            </Typography>
            <Typography variant="body1">
              <strong>Type:</strong> {searchType === 'smiles' ? 'SMILES String' : 'Compound Name'}
            </Typography>
            {useAI && (
              <Typography variant="body1" color="primary">
                <strong>Search Method:</strong> AI-Powered (ChemBERTa)
              </Typography>
            )}
          </Box>

          {Object.keys(searchState.filters).length > 0 && (
            <Box sx={{ mt: 2 }}>
              <Typography variant="body2" color="text.secondary">
                <strong>Active Filters:</strong>
                {Object.entries(searchState.filters).map(([key, value]) => (
                  <span key={key} style={{ marginLeft: 8 }}>
                    {key}: {value}
                  </span>
                ))}
              </Typography>
            </Box>
          )}
        </Paper>

        {/* Results Tabs */}
        <Paper elevation={1} sx={{ mb: 4 }}>
          <Tabs
            value={activeTab}
            onChange={(_event, newValue) => setActiveTab(newValue)}
            variant="fullWidth"
            sx={{ borderBottom: 1, borderColor: 'divider' }}
          >
            <Tab label={`Results (${visibleResults?.count || 0})`} />
            <Tab label="Analytics Dashboard" />
          </Tabs>
        </Paper>

        {/* Tab Content */}
        {activeTab === 0 ? (
          /* Results Tab */
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
          /* Analytics Tab */
          <AnalyticsDashboard compounds={visibleResults?.results || []} />
        )}

        {/* Compound Details Modal */}
        <CompoundDetails
          compound={selectedCompound}
          open={!!selectedCompound}
          onClose={handleCloseDetails}
        />

        <Alert severity="info" sx={{ mt: 4 }}>
          <Typography variant="body2">
            Results are loaded from static files in <strong>public/data</strong> for GitHub Pages deployment.
            Full-database dynamic similarity search still requires a backend API and database.
          </Typography>
        </Alert>
      </Box>
    </Container>
  );
};
