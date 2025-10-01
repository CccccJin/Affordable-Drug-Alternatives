import React, { useState, useEffect } from 'react';
import {
  Card,
  CardContent,
  Typography,
  Box,
  Slider,
  TextField,
  Button,
  Divider,
  Collapse,
  IconButton,
  Paper,
  Chip,
} from '@mui/material';
import {
  ExpandMore as ExpandMoreIcon,
  Clear as ClearIcon,
  Science as ScienceIcon,
} from '@mui/icons-material';

export interface PropertyFilters {
  molWeightMin?: number;
  molWeightMax?: number;
  logpMin?: number;
  logpMax?: number;
  hbdMin?: number;
  hbdMax?: number;
  hbaMin?: number;
  hbaMax?: number;
  psaMin?: number;
  psaMax?: number;
  rtbMin?: number;
  rtbMax?: number;
}

interface AdvancedPropertyFiltersProps {
  filters: Record<string, number | undefined>;
  onFiltersChange: (filters: Record<string, number | undefined>) => void;
  className?: string;
}

interface FilterRange {
  min: number;
  max: number;
  step: number;
  label: string;
  unit: string;
}

// Keep the original filter ranges for backward compatibility with helper functions
const FILTER_RANGES: Record<string, FilterRange> = {
  molWeightMin: { min: 0, max: 1000, step: 10, label: 'Molecular Weight', unit: 'g/mol' },
  molWeightMax: { min: 0, max: 1000, step: 10, label: 'Molecular Weight', unit: 'g/mol' },
  logpMin: { min: -10, max: 10, step: 0.5, label: 'LogP', unit: '' },
  logpMax: { min: -10, max: 10, step: 0.5, label: 'LogP', unit: '' },
  hbdMin: { min: 0, max: 20, step: 1, label: 'H-Bond Donors', unit: '' },
  hbdMax: { min: 0, max: 20, step: 1, label: 'H-Bond Donors', unit: '' },
  hbaMin: { min: 0, max: 50, step: 1, label: 'H-Bond Acceptors', unit: '' },
  hbaMax: { min: 0, max: 50, step: 1, label: 'H-Bond Acceptors', unit: '' },
  psaMin: { min: 0, max: 500, step: 5, label: 'Polar Surface Area', unit: 'Å²' },
  psaMax: { min: 0, max: 500, step: 5, label: 'Polar Surface Area', unit: 'Å²' },
  rtbMin: { min: 0, max: 50, step: 1, label: 'Rotatable Bonds', unit: '' },
  rtbMax: { min: 0, max: 50, step: 1, label: 'Rotatable Bonds', unit: '' },
};

// Group related filters for better organization
const FILTER_CATEGORIES = [
  {
    title: 'Basic Properties',
    icon: '⚖️',
    properties: ['molWeight', 'logp'],
    description: 'Molecular weight & lipophilicity',
  },
  {
    title: 'Hydrogen Bonding',
    icon: '🔗',
    properties: ['hbd', 'hba'],
    description: 'H-bond donors & acceptors',
  },
  {
    title: 'Structural Properties',
    icon: '🔬',
    properties: ['psa', 'rtb'],
    description: 'Surface area & flexibility',
  },
];

export const AdvancedPropertyFilters: React.FC<AdvancedPropertyFiltersProps> = ({
  filters,
  onFiltersChange,
  className,
}) => {
  const [expanded, setExpanded] = useState(false);
  const [localFilters, setLocalFilters] = useState<Record<string, number | undefined>>(filters);
  const [hasActiveFilters, setHasActiveFilters] = useState(false);

  // Update local filters when props change
  useEffect(() => {
    setLocalFilters(filters);
  }, [filters]);

  // Check if any filters are active
  useEffect(() => {
    const active = Object.values(localFilters).some(value => value !== undefined);
    setHasActiveFilters(active);
  }, [localFilters]);

  const handleFilterChange = (key: string, value: number | undefined) => {
    const newFilters = { ...localFilters };
    if (value === undefined) {
      delete newFilters[key];
    } else {
      newFilters[key] = value;
    }
    setLocalFilters(newFilters);
    onFiltersChange(newFilters);
  };

  const handleSliderChange = (key: string, value: number[]) => {
    const [min, max] = value;
    // Ensure we use the correct key format for the filters object
    const baseKey = key.replace(/Min|Max$/, '');
    handleFilterChange(`${baseKey}Min`, min);
    handleFilterChange(`${baseKey}Max`, max);
  };

  const clearAllFilters = () => {
    const clearedFilters: Record<string, number | undefined> = {};
    setLocalFilters(clearedFilters);
    onFiltersChange(clearedFilters);
  };

  const getFilterValue = (key: string): number[] => {
    // First try the exact key (for Min/Max keys)
    let range = FILTER_RANGES[key];

    // If not found, try to find the base key (for base property names)
    if (!range) {
      const baseKey = key.replace(/Min|Max/, '');
      const minKey = `${baseKey}Min`;
      const maxKey = `${baseKey}Max`;
      range = FILTER_RANGES[minKey] || FILTER_RANGES[maxKey];
    }

    if (!range) {
      console.error(`Filter range not found for key: ${key}`);
      // Return default range to prevent crash
      return [0, 100];
    }

    const minKey = key.includes('Min') ? key : `${key}Min`;
    const maxKey = key.includes('Max') ? key : `${key}Max`;

    const minValue = localFilters[minKey] ?? range.min;
    const maxValue = localFilters[maxKey] ?? range.max;

    return [minValue, maxValue];
  };

  const renderCompactFilterCard = (category: typeof FILTER_CATEGORIES[0]) => {
    const activeFiltersInCategory = category.properties.some(prop =>
      Object.keys(localFilters).some(key => key.startsWith(prop))
    );

    return (
      <Box
        key={category.title}
        sx={{
          mb: 2,
        }}
      >
        <Paper
          elevation={activeFiltersInCategory ? 3 : 1}
          sx={{
            p: 2,
            height: '100%',
            border: activeFiltersInCategory ? '2px solid' : '1px solid',
            borderColor: activeFiltersInCategory ? 'primary.main' : 'divider',
            borderRadius: 2,
            transition: 'all 0.2s ease-in-out',
            '&:hover': {
              elevation: 2,
              borderColor: 'primary.light',
            },
          }}
        >
          <Box sx={{ display: 'flex', alignItems: 'center', mb: 2 }}>
            <Typography variant="body2" sx={{ mr: 1 }}>
              {category.icon}
            </Typography>
            <Typography variant="subtitle2" sx={{ fontWeight: 600 }}>
              {category.title}
            </Typography>
            {activeFiltersInCategory && (
              <Chip
                label="Active"
                size="small"
                color="primary"
                sx={{ ml: 'auto', height: 20 }}
              />
            )}
          </Box>

          <Typography variant="caption" color="text.secondary" sx={{ mb: 2, display: 'block' }}>
            {category.description}
          </Typography>

          {category.properties.map(property => renderCompactSlider(property))}
        </Paper>
      </Box>
    );
  };

  const renderCompactSlider = (property: string) => {
    const range = FILTER_RANGES[`${property}Min`] || FILTER_RANGES[`${property}Max`];
    if (!range) return null;

    const value = getFilterValue(property);

    return (
      <Box key={property} sx={{ mb: 2 }}>
        <Box sx={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', mb: 1 }}>
          <Typography variant="caption" sx={{ fontSize: '0.75rem', fontWeight: 500 }}>
            {range.label}
          </Typography>
          <Typography variant="caption" color="text.secondary">
            {value[0]} - {value[1]} {range.unit}
          </Typography>
        </Box>

        <Slider
          value={value}
          onChange={(_, newValue) => handleSliderChange(property, newValue as number[])}
          valueLabelDisplay="auto"
          min={range.min}
          max={range.max}
          step={range.step}
          size="small"
          sx={{
            '& .MuiSlider-thumb': {
              bgcolor: 'primary.main',
              width: 14,
              height: 14,
            },
            '& .MuiSlider-track': {
              bgcolor: 'primary.main',
              height: 3,
            },
            '& .MuiSlider-rail': {
              bgcolor: 'grey.300',
              height: 3,
            },
            '& .MuiSlider-valueLabel': {
              fontSize: '0.75rem',
              bgcolor: 'primary.main',
            },
          }}
        />

        <Box sx={{ display: 'flex', gap: 1, mt: 1 }}>
          <TextField
            size="small"
            type="number"
            value={value[0]}
            onChange={(e) => handleFilterChange(`${property}Min`, e.target.value ? Number(e.target.value) : undefined)}
            inputProps={{
              min: range.min,
              max: range.max,
              step: range.step,
              style: { fontSize: '0.75rem', padding: '4px 8px' }
            }}
            sx={{
              width: 60,
              '& .MuiInputBase-input': { fontSize: '0.75rem', padding: '4px 8px' }
            }}
          />
          <TextField
            size="small"
            type="number"
            value={value[1]}
            onChange={(e) => handleFilterChange(`${property}Max`, e.target.value ? Number(e.target.value) : undefined)}
            inputProps={{
              min: range.min,
              max: range.max,
              step: range.step,
              style: { fontSize: '0.75rem', padding: '4px 8px' }
            }}
            sx={{
              width: 60,
              '& .MuiInputBase-input': { fontSize: '0.75rem', padding: '4px 8px' }
            }}
          />
        </Box>
      </Box>
    );
  };

  return (
    <Card className={className} elevation={1}>
      <CardContent>
        <Box sx={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', mb: 2 }}>
          <Box sx={{ display: 'flex', alignItems: 'center', gap: 1 }}>
            <ScienceIcon color={hasActiveFilters ? 'primary' : 'disabled'} />
            <Typography variant="h6">
              Property Filters
            </Typography>
            {hasActiveFilters && (
              <Chip
                label={`${Object.values(localFilters).filter(v => v !== undefined).length} active`}
                size="small"
                color="primary"
                variant="outlined"
              />
            )}
          </Box>

          <Box sx={{ display: 'flex', alignItems: 'center', gap: 1 }}>
            {hasActiveFilters && (
              <Button
                size="small"
                startIcon={<ClearIcon />}
                onClick={clearAllFilters}
                color="secondary"
                variant="outlined"
              >
                Clear All
              </Button>
            )}
            <IconButton
              size="small"
              onClick={() => setExpanded(!expanded)}
              sx={{
                transform: expanded ? 'rotate(180deg)' : 'rotate(0deg)',
                transition: 'transform 0.2s',
              }}
            >
              <ExpandMoreIcon />
            </IconButton>
          </Box>
        </Box>

        <Collapse in={expanded}>
          <Divider sx={{ mb: 3 }} />

          <Box
            sx={{
              display: 'grid',
              gridTemplateColumns: {
                xs: '1fr',
                sm: '1fr 1fr',
                md: '1fr 1fr 1fr',
              },
              gap: 2,
            }}
          >
            {FILTER_CATEGORIES.map(category => renderCompactFilterCard(category))}
          </Box>

          <Box sx={{ mt: 3, p: 2, bgcolor: 'grey.50', borderRadius: 1 }}>
            <Typography variant="body2" color="text.secondary">
              💡 <strong>Tip:</strong> Use the range sliders above to filter compounds by molecular properties.
              Active filters are highlighted with colored borders.
            </Typography>
          </Box>
        </Collapse>

        {!expanded && !hasActiveFilters && (
          <Box sx={{ mt: 2 }}>
            <Typography variant="body2" color="text.secondary">
              Click to expand and filter compounds by molecular properties, hydrogen bonding,
              lipophilicity, and structural characteristics.
            </Typography>
          </Box>
        )}
      </CardContent>
    </Card>
  );
};
