import { configureStore } from '@reduxjs/toolkit';
import { searchSlice } from './slices/searchSlice';
import { resultsSlice } from './slices/resultsSlice';
import { uiSlice } from './slices/uiSlice';

export const store = configureStore({
  reducer: {
    search: searchSlice.reducer,
    results: resultsSlice.reducer,
    ui: uiSlice.reducer,
  },
  middleware: (getDefaultMiddleware) =>
    getDefaultMiddleware({
      serializableCheck: {
        ignoredActions: ['persist/PERSIST', 'persist/REHYDRATE'],
      },
    }),
});

export type RootState = ReturnType<typeof store.getState>;
export type AppDispatch = typeof store.dispatch;
