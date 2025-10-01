import { createSlice, type PayloadAction } from '@reduxjs/toolkit';

export interface PropertyFilters {
  molWeightMin?: number;
  molWeightMax?: number;
  logpMin?: number;
  logpMax?: number;
  hBondDonors?: number;
  hBondAcceptors?: number;
}

export interface SearchHistory {
  id: string;
  query: string;
  timestamp: number;
  type: 'smiles' | 'name';
}

interface SearchState {
  query: string;
  searchType: 'smiles' | 'name';
  filters: PropertyFilters;
  isLoading: boolean;
  error: string | null;
  history: SearchHistory[];
}

const loadHistoryFromStorage = (): SearchHistory[] => {
  try {
    const stored = localStorage.getItem('chemical-search-history');
    return stored ? JSON.parse(stored) : [];
  } catch {
    return [];
  }
};

const saveHistoryToStorage = (history: SearchHistory[]) => {
  try {
    localStorage.setItem('chemical-search-history', JSON.stringify(history));
  } catch {
    // Ignore localStorage errors
  }
};

const initialState: SearchState = {
  query: '',
  searchType: 'smiles',
  filters: {},
  isLoading: false,
  error: null,
  history: loadHistoryFromStorage(),
};

export const searchSlice = createSlice({
  name: 'search',
  initialState,
  reducers: {
    setQuery: (state, action: PayloadAction<string>) => {
      state.query = action.payload;
    },
    setSearchType: (state, action: PayloadAction<'smiles' | 'name'>) => {
      state.searchType = action.payload;
    },
    setFilters: (state, action: PayloadAction<PropertyFilters>) => {
      state.filters = action.payload;
    },
    updateFilter: (state, action: PayloadAction<{ key: keyof PropertyFilters; value?: number }>) => {
      const { key, value } = action.payload;
      if (value === undefined) {
        delete state.filters[key];
      } else {
        (state.filters as Record<string, number>)[key] = value;
      }
    },
    setLoading: (state, action: PayloadAction<boolean>) => {
      state.isLoading = action.payload;
    },
    setError: (state, action: PayloadAction<string | null>) => {
      state.error = action.payload;
    },
    addToHistory: (state, action: PayloadAction<Omit<SearchHistory, 'id' | 'timestamp'>>) => {
      const newEntry: SearchHistory = {
        ...action.payload,
        id: Date.now().toString(),
        timestamp: Date.now(),
      };
      state.history.unshift(newEntry);
      // Keep only last 10 searches
      if (state.history.length > 10) {
        state.history = state.history.slice(0, 10);
      }
      // Persist to localStorage
      saveHistoryToStorage(state.history);
    },
    clearSearch: (state) => {
      state.query = '';
      state.filters = {};
      state.isLoading = false;
      state.error = null;
    },
    clearHistory: (state) => {
      state.history = [];
      // Clear from localStorage
      saveHistoryToStorage([]);
    },
    resetSearch: () => initialState,
  },
});

export const {
  setQuery,
  setSearchType,
  setFilters,
  updateFilter,
  setLoading,
  setError,
  addToHistory,
  clearHistory,
  clearSearch,
  resetSearch,
} = searchSlice.actions;
