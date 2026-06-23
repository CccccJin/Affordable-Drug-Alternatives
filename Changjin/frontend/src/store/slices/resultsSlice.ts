import { createSlice, type PayloadAction } from '@reduxjs/toolkit';
import type { Compound, PostProcessingResult } from '../../types/api';

interface ResultsState {
  compounds: Compound[];
  totalCount: number;
  selectedCompound: Compound | null;
  postProcessed: PostProcessingResult | null;
  clusters: Record<string, unknown>[];
  currentPage: number;
  pageSize: number;
}

const initialState: ResultsState = {
  compounds: [],
  totalCount: 0,
  selectedCompound: null,
  postProcessed: null,
  clusters: [],
  currentPage: 1,
  pageSize: 20,
};

export const resultsSlice = createSlice({
  name: 'results',
  initialState,
  reducers: {
    setCompounds: (state, action: PayloadAction<{ compounds: Compound[]; totalCount: number }>) => {
      state.compounds = action.payload.compounds;
      state.totalCount = action.payload.totalCount;
    },
    setSelectedCompound: (state, action: PayloadAction<Compound | null>) => {
      state.selectedCompound = action.payload;
    },
    setPostProcessed: (state, action: PayloadAction<PostProcessingResult | null>) => {
      state.postProcessed = action.payload;
    },
    setClusters: (state, action: PayloadAction<Record<string, unknown>[]>) => {
      state.clusters = action.payload;
    },
    setPage: (state, action: PayloadAction<number>) => {
      state.currentPage = action.payload;
    },
    setPageSize: (state, action: PayloadAction<number>) => {
      state.pageSize = action.payload;
      state.currentPage = 1; // Reset to first page when changing page size
    },
    clearResults: () => initialState,
  },
});

export const {
  setCompounds,
  setSelectedCompound,
  setPostProcessed,
  setClusters,
  setPage,
  setPageSize,
  clearResults,
} = resultsSlice.actions;
