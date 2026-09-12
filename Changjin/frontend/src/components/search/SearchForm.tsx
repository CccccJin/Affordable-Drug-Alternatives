import React, { Suspense, lazy, useState } from 'react';
import {
  Link as MuiLink,
  TextField,
  Button,
  Box,
  Typography,
  Alert,
  Paper,
  Stack,
  useTheme,
  alpha,
} from '@mui/material';
import {
  Search as SearchIcon,
  BoltOutlined as BoltIcon,
} from '@mui/icons-material';
import { useDispatch, useSelector } from 'react-redux';
import { useNavigate, Link as RouterLink } from 'react-router-dom';
import type { RootState } from '../../store/store';
import {
  setFilters,
  addToHistory,
  setLoading,
  setError,
} from '../../store/slices/searchSlice';
import { useCompoundSearch } from '../../hooks/useSearch';
import { AdvancedPropertyFilters } from '../filters/AdvancedPropertyFilters';
/**
 * Below the fold and the only thing on this page that pulls in recharts, so it
 * is fetched after the search box is usable rather than before it appears.
 */
const ResearchResults = lazy(() =>
  import('../research/ResearchResults').then(m => ({ default: m.ResearchResults })));
import { brand, serifStack } from '../../styles/theme';
import { useCorpusSize } from '../../hooks/useCorpusSize';
import { WhenVisible } from '../common/WhenVisible';

export const SearchForm: React.FC = () => {
  const theme = useTheme();
  const dispatch = useDispatch();
  const navigate = useNavigate();
  const searchState = useSelector((state: RootState) => state.search);

  const [localQuery, setLocalQuery] = useState(searchState.query);
  const [localSearchType, setLocalSearchType] = useState(searchState.searchType);
  const useAI = false;
  const [showResearch, setShowResearch] = useState(false);
  const [localFilters, setLocalFilters] = useState<Record<string, number | undefined>>(
    searchState.filters as Record<string, number | undefined>
  );

  const { searchBySMILES, searchByName, isLoading } = useCompoundSearch();
  const corpusSize = useCorpusSize();

  const handleSearch = async () => {
    if (isLoading || searchState.isLoading) return;
    if (!localQuery.trim()) {
      dispatch(setError('Please enter a search term'));
      return;
    }

    dispatch(setLoading(true));
    dispatch(setError(null));

    try {
      if (localSearchType === 'smiles') {
        await searchBySMILES(localQuery, useAI, localFilters);
      } else {
        await searchByName(localQuery, useAI, localFilters);
      }

      dispatch(
        addToHistory({
          query: localQuery,
          type: localSearchType,
        })
      );

      const params = new URLSearchParams({
        query: localQuery,
        type: localSearchType,
        ai: useAI.toString(),
      });

      navigate(`/results?${params.toString()}`);
    } catch (searchError) {
      dispatch(
        setError(searchError instanceof Error ? searchError.message : 'Search failed')
      );
    } finally {
      dispatch(setLoading(false));
    }
  };

  const handleFiltersChange = (filters: Record<string, number | undefined>) => {
    setLocalFilters(filters);
    dispatch(setFilters(filters));
  };

  const segmentSx = (selected: boolean) => ({
    flex: 1,
    borderRadius: '9px',
    px: 2,
    py: 0.9,
    fontSize: '0.85rem',
    fontWeight: 600,
    textTransform: 'none' as const,
    color: selected ? 'text.primary' : 'text.secondary',
    backgroundColor: selected ? 'background.paper' : 'transparent',
    boxShadow: selected ? '0 1px 3px rgba(16,16,24,0.12)' : 'none',
    '&:hover': {
      backgroundColor: selected
        ? 'background.paper'
        : alpha(theme.palette.text.primary, 0.04),
    },
  });

  return (
    <>
    <Box sx={{ maxWidth: 880, mx: 'auto' }}>
      {/* Hero */}
      <Box className="anim-fade-up" sx={{ textAlign: 'center', mb: { xs: 4, md: 6 }, pt: { xs: 2, md: 5 } }}>
        <Box
          sx={{
            display: 'inline-flex',
            alignItems: 'center',
            gap: 0.75,
            px: 1.75,
            py: 0.6,
            mb: 3,
            borderRadius: 999,
            border: `1px solid ${theme.palette.divider}`,
            backgroundColor: alpha(theme.palette.background.paper, 0.7),
            backdropFilter: 'blur(8px)',
          }}
        >
          <BoltIcon sx={{ fontSize: 14, color: brand.indigo }} />
          <Typography variant="caption" sx={{ fontWeight: 600, color: 'text.secondary' }}>
            Powered by ChEMBL 35 &amp; RDKit
          </Typography>
        </Box>

        {/* "Find affordable drug alternatives" promised a consumer price
            comparison. This is a cheminformatics tool: it scores structural
            similarity and looks up what FDA has published, and the results page
            says in as many words that similarity is not substitutability. A
            headline that promises the other thing sets a visitor up to read
            every number on the site as advice about their own medication. */}
        <Typography variant="h1" component="h1" sx={{ mb: 2.5 }}>
          Search{' '}
          <Box
            component="em"
            sx={{
              fontFamily: serifStack,
              fontStyle: 'italic',
              fontWeight: 400,
              background: brand.gradient,
              backgroundClip: 'text',
              WebkitBackgroundClip: 'text',
              WebkitTextFillColor: 'transparent',
              pr: '0.06em',
            }}
          >
            chemical
          </Box>{' '}
          similarity
        </Typography>

        <Typography
          variant="subtitle1"
          sx={{
            color: 'text.secondary',
            fontWeight: 400,
            maxWidth: 560,
            mx: 'auto',
          }}
        >
          Find structurally similar molecules across {corpusSize ? corpusSize.toLocaleString() : 'the'} ChEMBL compounds.

        </Typography>
      </Box>

      {/* Search panel */}
      <Paper
        component="section"
        aria-label="Compound search"
        className="anim-fade-up anim-delay-1"
        elevation={0}
        sx={{
          p: { xs: 2.5, sm: 4 },
          mb: 3,
          borderRadius: 5,
          border: `1px solid ${theme.palette.divider}`,
          backgroundColor: alpha(theme.palette.background.paper, 0.85),
          backdropFilter: 'blur(12px)',
          boxShadow: '0 1px 2px rgba(16,16,24,0.04), 0 12px 32px rgba(16,16,24,0.07)',
        }}
      >
        {searchState.error && (
          <Alert severity="error" sx={{ mb: 3 }} onClose={() => dispatch(setError(null))}>
            {searchState.error}
          </Alert>
        )}

        <Stack
          direction={{ xs: 'column', sm: 'row' }}
          spacing={2}
          alignItems={{ xs: 'stretch', sm: 'center' }}
          justifyContent="space-between"
          sx={{ mb: 2.5 }}
        >
          {/* Segmented search-type control */}
          <Box
            role="group"
            aria-label="Search by"
            sx={{
              display: 'flex',
              p: 0.5,
              borderRadius: '12px',
              backgroundColor: alpha(theme.palette.text.primary, 0.05),
              width: { xs: '100%', sm: 320 },
            }}
          >
            <Button
              onClick={() => setLocalSearchType('smiles')}
              aria-pressed={localSearchType === 'smiles'}
              sx={segmentSx(localSearchType === 'smiles')}
            >
              SMILES string
            </Button>
            <Button
              onClick={() => setLocalSearchType('name')}
              aria-pressed={localSearchType === 'name'}
              sx={segmentSx(localSearchType === 'name')}
            >
              Compound name
            </Button>
          </Box>


        </Stack>

        <TextField
          fullWidth
          label={localSearchType === 'smiles' ? 'SMILES string' : 'Compound name'}
          value={localQuery}
          onChange={(e) => setLocalQuery(e.target.value)}
          placeholder={
            localSearchType === 'smiles'
              ? 'e.g. CC(=O)OC1=CC=CC=C1C(=O)O'
              : 'e.g. Aspirin'
          }
          sx={{
            mb: 2.5,
            '& .MuiOutlinedInput-input': {
              fontFamily:
                localSearchType === 'smiles'
                  ? '"SF Mono", ui-monospace, Menlo, monospace'
                  : 'inherit',
              fontSize: '1.05rem',
              py: 1.9,
            },
          }}
          onKeyDown={(e) => {
            if (e.key === 'Enter') {
              handleSearch();
            }
          }}
        />

        <Button
          variant="contained"
          size="large"
          startIcon={<SearchIcon />}
          onClick={handleSearch}
          disabled={isLoading || !localQuery.trim()}
          fullWidth
          sx={{ py: 1.6, fontSize: '1.02rem' }}
        >
          {isLoading ? 'Searching…' : 'Search compounds'}
        </Button>
      </Paper>

      <Stack direction="row" spacing={1} useFlexGap flexWrap="wrap" sx={{ mb: 3 }}>
        <Typography variant="body2" sx={{ alignSelf: 'center' }}>Try:</Typography>
        {['Aspirin', 'Ibuprofen', 'Atorvastatin'].map(name => (
          <Button key={name} size="small" variant="outlined" onClick={() => {
            setLocalSearchType('name');
            setLocalQuery(name);
            dispatch(setError(null));
          }}>{name}</Button>
        ))}
      </Stack>
      <Typography variant="body2" color="text.secondary" sx={{ mb: 3 }}>
        Looking for FDA-rated equivalents? Open the{' '}
        <MuiLink component={RouterLink} to="/alternatives">therapeutic equivalence lookup</MuiLink>.
      </Typography>
      {/* Advanced Property Filters */}
      <Box className="anim-fade-up anim-delay-3">
        <AdvancedPropertyFilters
          filters={localFilters}
          onFiltersChange={handleFiltersChange}
        />
      </Box>
    </Box>

    <Box sx={{ maxWidth: 1040, mx: 'auto', mt: 3 }}>
      <Box component="details" sx={{ color: 'text.secondary', mb: 2 }}>
        <Box component="summary" sx={{ cursor: 'pointer', py: 1 }}>How search works</Box>
        <Typography variant="body2">Morgan/Tanimoto structural similarity runs in your browser. Coverage is a named ChEMBL subset. Similarity does not establish therapeutic equivalence. This is not medical advice.</Typography>
      </Box>
      <Button onClick={() => setShowResearch(v => !v)} aria-expanded={showResearch} aria-controls="research-results">
        {showResearch ? 'Hide research overview' : 'Explore the research'}
      </Button>
      {showResearch && <Box id="research-results"><WhenVisible minHeight={400}>
        <Suspense fallback={<Box sx={{ py: 8 }} />}><ResearchResults /></Suspense>
      </WhenVisible></Box>}
    </Box>
    </>
  );
};
