import React, { useState } from 'react';
import { Container, Box, Typography, Alert, Paper, Tabs, Tab } from '@mui/material';
import { useSearchParams } from 'react-router-dom';
import { useDispatch, useSelector } from 'react-redux';
import type { RootState } from '../../store/store';
import { setSelectedCompound } from '../../store/slices/resultsSlice';
import { ResultsList } from './ResultsList';
import { CompoundDetails } from './CompoundDetails';
import { AnalyticsDashboard } from '../charts/AnalyticsDashboard';
import type { Compound } from '../../types/api';

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

  // Mock results for demonstration
  const mockResults = {
    count: 10,
    results: [
      { chembl_id: 'CHEMBL25', smiles: 'CC(=O)OC1=CC=CC=C1C(=O)O', similarity: 0.95 },
      { chembl_id: 'CHEMBL50', smiles: 'CCOC(=O)C1=CC=CC=C1C(=O)O', similarity: 0.87 },
      { chembl_id: 'CHEMBL100', smiles: 'CN1C(=O)CC2=CC=CC=C21', similarity: 0.82 },
      { chembl_id: 'CHEMBL200', smiles: 'O=C(O)C1=CC=CC=C1O', similarity: 0.78 },
      { chembl_id: 'CHEMBL300', smiles: 'CC(=O)NC1=CC=CC=C1C(=O)O', similarity: 0.75 },
      { chembl_id: 'CHEMBL400', smiles: 'OC(=O)C1=CC=CC=C1C(=O)O', similarity: 0.71 },
      { chembl_id: 'CHEMBL500', smiles: 'CC1=CC=C(C=C1)S(=O)(=O)NC2=CC=CC=C2', similarity: 0.68 },
      { chembl_id: 'CHEMBL600', smiles: 'CN(C)CCCN1C2=CC=CC=C2CCC3=CC=CC=C13', similarity: 0.65 },
      { chembl_id: 'CHEMBL700', smiles: 'CC(=O)OC1=CC=C(C=C1)C(=O)O', similarity: 0.62 },
      { chembl_id: 'CHEMBL800', smiles: 'O=C(NC1=CC=CC=C1)C2=CC=CC=C2', similarity: 0.59 },
    ],
    post_processed: {
      ranked_candidates: [],
      filtered_out: [],
      clusters: [],
      recommendations: [],
    },
  };

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
            <Tab label={`Results (${mockResults.count})`} />
            <Tab label="Analytics Dashboard" />
          </Tabs>
        </Paper>

        {/* Tab Content */}
        {activeTab === 0 ? (
          /* Results Tab */
          <ResultsList
            results={mockResults}
            isLoading={false}
            error={null}
            onViewDetails={handleViewDetails}
            currentPage={currentPage}
            totalPages={Math.ceil(mockResults.count / 20)}
            onPageChange={handlePageChange}
            onSortChange={handleSortChange}
            sortBy={sortBy}
            searchQuery={filterQuery}
            onSearchQueryChange={setFilterQuery}
          />
        ) : (
          /* Analytics Tab */
          <AnalyticsDashboard compounds={mockResults.results} />
        )}

        {/* Compound Details Modal */}
        <CompoundDetails
          compound={selectedCompound}
          open={!!selectedCompound}
          onClose={handleCloseDetails}
        />

        {/* Development Note */}
        {process.env.NODE_ENV === 'development' && (
          <Alert severity="info" sx={{ mt: 4 }}>
            <Typography variant="body2">
              <strong>Development Mode:</strong> Currently displaying mock data that matches the real API structure.
              When the backend is available, simply replace the MockSearchApi with SearchApi in the hooks.
            </Typography>
          </Alert>
        )}
      </Box>
    </Container>
  );
};
