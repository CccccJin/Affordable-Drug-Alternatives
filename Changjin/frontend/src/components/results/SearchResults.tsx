import React, { useEffect, useState } from 'react';
import { Container, Box, Typography, Alert, Paper, Tabs, Tab } from '@mui/material';
import { useSearchParams } from 'react-router-dom';
import { useDispatch, useSelector } from 'react-redux';
import type { RootState } from '../../store/store';
import { setSelectedCompound } from '../../store/slices/resultsSlice';
import { ResultsList } from './ResultsList';
import { CompoundDetails } from './CompoundDetails';
import { AnalyticsDashboard } from '../charts/AnalyticsDashboard';
import type { Compound, SearchResponse, SearchRequest } from '../../types/api';
import { SearchApi } from '../../services/api/searchApi';

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

  const [data, setData] = useState<SearchResponse | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

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
    // TODO: Implement sorting
  };

  // Always fetch fresh results when query/type/ai change
  useEffect(() => {
    setError(null);
    const fetchData = async () => {
      if (!query) {
        setData({ count: 0, results: [] });
        return;
      }
      setLoading(true);
      try {
        const request: SearchRequest = {
          smiles: query,
          threshold: 0.7,
          max_results: 50,
          enable_post_processing: true,
        };
        let result: SearchResponse;
        if (searchType === 'name') {
          const resolved = await SearchApi.resolveName({ name: query });
          request.smiles = resolved.smiles;
        }
        result = useAI ? await SearchApi.searchAI(request) : await SearchApi.search(request);
        setData(result);
      } catch (e: any) {
        setError(e?.message || 'Failed to load search results');
      } finally {
        setLoading(false);
      }
    };
    fetchData();
  }, [query, searchType, useAI]);

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
            <Tab label={`Results (${data?.count ?? 0})`} />
            <Tab label="Analytics Dashboard" />
          </Tabs>
        </Paper>

        {/* Tab Content */}
        {activeTab === 0 ? (
          /* Results Tab */
          <ResultsList
            results={data || { count: 0, results: [] }}
            isLoading={loading}
            error={error}
            onViewDetails={handleViewDetails}
            currentPage={currentPage}
            totalPages={Math.ceil((data?.count ?? 0) / 20) || 1}
            onPageChange={handlePageChange}
            onSortChange={handleSortChange}
            sortBy={sortBy}
            searchQuery={filterQuery}
            onSearchQueryChange={setFilterQuery}
          />
        ) : (
          /* Analytics Tab */
          <AnalyticsDashboard compounds={data?.results || []} />
        )}

        {/* Compound Details Modal */}
        <CompoundDetails
          compound={selectedCompound}
          open={!!selectedCompound}
          onClose={handleCloseDetails}
        />

        {process.env.NODE_ENV === 'development' && (
          <Alert severity="info" sx={{ mt: 4 }}>
            <Typography variant="body2">
              <strong>Development Mode:</strong> Results are now loaded from the backend. If you still see mock data,
              please reload the page.
            </Typography>
          </Alert>
        )}
      </Box>
    </Container>
  );
};
