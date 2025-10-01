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
} from '@mui/material';
import {
  ExpandMore as ExpandMoreIcon,
  FilterList as FilterIcon,
  Clear as ClearIcon,
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

  const renderFilterSlider = (key: string) => {
    const range = FILTER_RANGES[key] || FILTER_RANGES[`${key}Min`] || FILTER_RANGES[`${key}Max`];

    if (!range) {
      console.error(`Filter range not found for key: ${key}`);
      return null;
    }

    const value = getFilterValue(key);

    return (
      <Box key={key} sx={{ mb: 3 }}>
        <Typography variant="body2" gutterBottom sx={{ fontWeight: 600 }}>
          {range.label} ({range.unit})
        </Typography>

        <Box sx={{ px: 1 }}>
          <Slider
            value={value}
            onChange={(_, newValue) => handleSliderChange(key.replace(/Min|Max/, ''), newValue as number[])}
            valueLabelDisplay="auto"
            min={range.min}
            max={range.max}
            step={range.step}
            marks={[
              { value: range.min, label: range.min.toString() },
              { value: range.max, label: range.max.toString() },
            ]}
            sx={{
              '& .MuiSlider-thumb': {
                bgcolor: 'primary.main',
              },
              '& .MuiSlider-track': {
                bgcolor: 'primary.main',
              },
              '& .MuiSlider-rail': {
                bgcolor: 'grey.300',
              },
            }}
          />
        </Box>

        <Box sx={{ display: 'flex', gap: 1, mt: 1 }}>
          <TextField
            size="small"
            label="Min"
            type="number"
            value={value[0]}
            onChange={(e) => handleFilterChange(`${key.replace(/Min|Max/, '')}Min`, e.target.value ? Number(e.target.value) : undefined)}
            sx={{ width: 80 }}
            inputProps={{ min: range.min, max: range.max, step: range.step }}
          />
          <TextField
            size="small"
            label="Max"
            type="number"
            value={value[1]}
            onChange={(e) => handleFilterChange(`${key.replace(/Min|Max/, '')}Max`, e.target.value ? Number(e.target.value) : undefined)}
            sx={{ width: 80 }}
            inputProps={{ min: range.min, max: range.max, step: range.step }}
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
            <FilterIcon color={hasActiveFilters ? 'primary' : 'disabled'} />
            <Typography variant="h6">
              Advanced Filters
            </Typography>
            {hasActiveFilters && (
              <Typography variant="caption" color="primary">
                ({Object.values(localFilters).filter(v => v !== undefined).length} active)
              </Typography>
            )}
          </Box>

          <Box sx={{ display: 'flex', alignItems: 'center', gap: 1 }}>
            {hasActiveFilters && (
              <Button
                size="small"
                startIcon={<ClearIcon />}
                onClick={clearAllFilters}
                color="secondary"
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

          {/* Molecular Weight Filter */}
          {renderFilterSlider('molWeight')}

          {/* LogP Filter */}
          {renderFilterSlider('logp')}

          {/* H-Bond Donors Filter */}
          {renderFilterSlider('hbd')}

          {/* H-Bond Acceptors Filter */}
          {renderFilterSlider('hba')}

          {/* Polar Surface Area Filter */}
          {renderFilterSlider('psa')}

          {/* Rotatable Bonds Filter */}
          {renderFilterSlider('rtb')}

          <Box sx={{ mt: 3, pt: 2, borderTop: '1px solid', borderColor: 'divider' }}>
            <Typography variant="body2" color="text.secondary">
              💡 Tip: Use the sliders above to filter compounds by their molecular properties.
              Drag the handles or use the number inputs for precise control.
            </Typography>
          </Box>
        </Collapse>

        {!expanded && hasActiveFilters && (
          <Box sx={{ mt: 2 }}>
            <Typography variant="body2" color="primary">
              Active filters applied. Click to expand and modify.
            </Typography>
          </Box>
        )}
      </CardContent>
    </Card>
  );
};
