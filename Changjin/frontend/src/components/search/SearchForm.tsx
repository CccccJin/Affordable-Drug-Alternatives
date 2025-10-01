import React, { useState } from 'react';
import {
  Card,
  CardContent,
  TextField,
  Button,
  FormControl,
  FormLabel,
  RadioGroup,
  FormControlLabel,
  Radio,
  Box,
  Typography,
  Alert,
  Switch,
  FormControlLabel as SwitchLabel,
} from '@mui/material';
import { Search as SearchIcon, Science as ScienceIcon, SmartToy as AIIcon } from '@mui/icons-material';
import { useDispatch, useSelector } from 'react-redux';
import { useNavigate } from 'react-router-dom';
import type { RootState } from '../../store/store';
import {
  setFilters,
  addToHistory,
  setLoading,
  setError,
} from '../../store/slices/searchSlice';
import { useCompoundSearch } from '../../hooks/useSearch';
import { AdvancedPropertyFilters } from '../filters/AdvancedPropertyFilters';

export const SearchForm: React.FC = () => {
  const dispatch = useDispatch();
  const navigate = useNavigate();
  const searchState = useSelector((state: RootState) => state.search);

  const [localQuery, setLocalQuery] = useState(searchState.query);
  const [localSearchType, setLocalSearchType] = useState(searchState.searchType);
  const [useAI, setUseAI] = useState(false);
  const [localFilters, setLocalFilters] = useState<Record<string, number | undefined>>(searchState.filters as Record<string, number | undefined>);

  const { searchBySMILES, searchByName, isLoading } = useCompoundSearch();

  const handleSearch = async () => {
    if (!localQuery.trim()) {
      dispatch(setError('Please enter a search term'));
      return;
    }

    dispatch(setLoading(true));
    dispatch(setError(null));

    try {
      let results;
      
      if (localSearchType === 'smiles') {
        results = await searchBySMILES(localQuery, useAI);
      } else {
        results = await searchByName(localQuery, useAI);
      }

      // Update Redux state with results
      console.log('Search successful:', results);

      // Add to search history
      dispatch(
        addToHistory({
          query: localQuery,
          type: localSearchType,
        })
      );

      // Navigate to results page with query parameters
      const params = new URLSearchParams({
        query: localQuery,
        type: localSearchType,
        ai: useAI.toString(),
      });
      
      navigate(`/results?${params.toString()}`);

    } catch (searchError) {
      dispatch(setError(searchError instanceof Error ? searchError.message : 'Search failed'));
    } finally {
      dispatch(setLoading(false));
    }
  };

  const handleFiltersChange = (filters: Record<string, number | undefined>) => {
    setLocalFilters(filters);
    dispatch(setFilters(filters));
  };

  return (
    <Box>
      <Card elevation={2} sx={{ mb: 3 }}>
        <CardContent>
          <Box sx={{ display: 'flex', alignItems: 'center', mb: 3 }}>
            <ScienceIcon sx={{ mr: 2, color: 'primary.main' }} />
            <Typography variant="h5" component="h2">
              Chemical Similarity Search
            </Typography>
          </Box>

          {searchState.error && (
            <Alert severity="error" sx={{ mb: 3 }}>
              {searchState.error}
            </Alert>
          )}

          {/* Search Type Selection */}
          <FormControl component="fieldset" sx={{ mb: 3 }}>
            <FormLabel component="legend">Search By</FormLabel>
            <RadioGroup
              row
              value={localSearchType}
              onChange={(e) => setLocalSearchType(e.target.value as 'smiles' | 'name')}
            >
              <FormControlLabel value="smiles" control={<Radio />} label="SMILES String" />
              <FormControlLabel value="name" control={<Radio />} label="Compound Name" />
            </RadioGroup>
          </FormControl>

          {/* AI Search Toggle */}
          <Box sx={{ mb: 3 }}>
            <SwitchLabel
              control={
                <Switch
                  checked={useAI}
                  onChange={(e) => setUseAI(e.target.checked)}
                  color="primary"
                />
              }
              label={
                <Box sx={{ display: 'flex', alignItems: 'center', gap: 1 }}>
                  <AIIcon color={useAI ? 'primary' : 'disabled'} />
                  <Typography variant="body2">
                    Use AI-Powered Search (ChemBERTa)
                  </Typography>
                </Box>
              }
            />
          </Box>

          {/* Search Input */}
          <TextField
            fullWidth
            label={localSearchType === 'smiles' ? 'Enter SMILES string' : 'Enter compound name'}
            value={localQuery}
            onChange={(e) => setLocalQuery(e.target.value)}
            placeholder={
              localSearchType === 'smiles'
                ? 'e.g., CC(=O)OC1=CC=CC=C1C(=O)O'
                : 'e.g., Aspirin'
            }
            sx={{ mb: 3 }}
            onKeyPress={(e) => {
              if (e.key === 'Enter') {
                handleSearch();
              }
            }}
          />

          {/* Search Button */}
          <Button
            variant="contained"
            size="large"
            startIcon={<SearchIcon />}
            onClick={handleSearch}
            disabled={isLoading || !localQuery.trim()}
            fullWidth
            sx={{
              mb: 3,
              py: 1.5,
              fontSize: '1.1rem',
            }}
          >
            {isLoading ? 'Searching...' : 'Search Compounds'}
          </Button>

          {/* Search Tips */}
          <Alert severity="info" sx={{ textAlign: 'left' }}>
            <Typography variant="body2" sx={{ lineHeight: 1.6 }}>
              <strong>Search Tips:</strong>
              <Box component="ul" sx={{ mt: 1, mb: 0, pl: 2 }}>
                <li>Use SMILES strings for precise structural searches</li>
                <li>Use compound names for convenience (auto-converted to SMILES)</li>
                <li>AI search provides more intelligent similarity matching</li>
                <li>Advanced property filters are available below</li>
              </Box>
            </Typography>
          </Alert>
        </CardContent>
      </Card>

      {/* Advanced Property Filters */}
      <AdvancedPropertyFilters
        filters={localFilters}
        onFiltersChange={handleFiltersChange}
      />
    </Box>
  );
};
