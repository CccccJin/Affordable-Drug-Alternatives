import React, { useState } from 'react';
import {
  TextField,
  Button,
  Box,
  Typography,
  Alert,
  Switch,
  FormControlLabel,
  Paper,
  Stack,
  useTheme,
  alpha,
} from '@mui/material';
import {
  Search as SearchIcon,
  AutoAwesome as SparkleIcon,
  HubOutlined as StructureIcon,
  BoltOutlined as BoltIcon,
  TuneOutlined as TuneIcon,
} from '@mui/icons-material';
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
import { ResearchResults } from '../research/ResearchResults';
import { brand, serifStack } from '../../styles/theme';

const FEATURES = [
  {
    icon: <StructureIcon fontSize="small" />,
    title: 'Structure-aware',
    text: 'SMILES strings give precise structural searches; compound names are auto-converted.',
  },
  {
    icon: <SparkleIcon fontSize="small" />,
    title: 'AI similarity',
    text: 'ChemBERTa embeddings surface intelligent matches beyond fingerprint overlap.',
  },
  {
    icon: <TuneIcon fontSize="small" />,
    title: 'Property filters',
    text: 'Refine by molecular weight, LogP, hydrogen bonding, and structural flexibility.',
  },
];

export const SearchForm: React.FC = () => {
  const theme = useTheme();
  const dispatch = useDispatch();
  const navigate = useNavigate();
  const searchState = useSelector((state: RootState) => state.search);

  const [localQuery, setLocalQuery] = useState(searchState.query);
  const [localSearchType, setLocalSearchType] = useState(searchState.searchType);
  const [useAI, setUseAI] = useState(false);
  const [localFilters, setLocalFilters] = useState<Record<string, number | undefined>>(
    searchState.filters as Record<string, number | undefined>
  );

  const { searchBySMILES, searchByName, isLoading } = useCompoundSearch();

  const handleSearch = async () => {
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
            Powered by ChEMBL 35 &amp; ChemBERTa
          </Typography>
        </Box>

        <Typography variant="h1" component="h1" sx={{ mb: 2.5 }}>
          Find{' '}
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
            affordable
          </Box>{' '}
          drug alternatives
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
          Search millions of compounds by structure or name and discover
          chemically similar molecules in seconds.
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

          {/* AI toggle */}
          <FormControlLabel
            control={
              <Switch
                checked={useAI}
                onChange={(e) => setUseAI(e.target.checked)}
                color="primary"
              />
            }
            label={
              <Box sx={{ display: 'flex', alignItems: 'center', gap: 0.75 }}>
                <SparkleIcon
                  sx={{
                    fontSize: 18,
                    color: useAI ? brand.indigo : 'text.disabled',
                    transition: 'color 0.2s ease',
                  }}
                />
                <Typography variant="body2" sx={{ fontWeight: 600 }}>
                  AI-powered search
                </Typography>
              </Box>
            }
            sx={{ mr: 0 }}
          />
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

      {/* Feature cards */}
      <Box
        className="anim-fade-up anim-delay-2"
        sx={{
          display: 'grid',
          gridTemplateColumns: { xs: '1fr', sm: 'repeat(3, 1fr)' },
          gap: 2,
          mb: 3,
        }}
      >
        {FEATURES.map((feature) => (
          <Paper
            key={feature.title}
            elevation={0}
            sx={{
              p: 2.5,
              borderRadius: 4,
              border: `1px solid ${theme.palette.divider}`,
              backgroundColor: alpha(theme.palette.background.paper, 0.6),
              transition: 'transform 0.25s cubic-bezier(0.22,1,0.36,1), box-shadow 0.25s ease',
              '&:hover': {
                transform: 'translateY(-3px)',
                boxShadow: '0 12px 32px rgba(16,16,24,0.08)',
              },
            }}
          >
            <Box
              sx={{
                width: 34,
                height: 34,
                borderRadius: '10px',
                mb: 1.5,
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'center',
                background: brand.gradientSoft,
                color: brand.indigo,
              }}
            >
              {feature.icon}
            </Box>
            <Typography variant="subtitle2" sx={{ mb: 0.5 }}>
              {feature.title}
            </Typography>
            <Typography variant="body2" color="text.secondary">
              {feature.text}
            </Typography>
          </Paper>
        ))}
      </Box>

      {/* Advanced Property Filters */}
      <Box className="anim-fade-up anim-delay-3">
        <AdvancedPropertyFilters
          filters={localFilters}
          onFiltersChange={handleFiltersChange}
        />
      </Box>
    </Box>

    {/* Research Results — directly below the property filter, wider column for charts */}
    <Box sx={{ maxWidth: 1040, mx: 'auto' }}>
      <ResearchResults />
    </Box>
    </>
  );
};
