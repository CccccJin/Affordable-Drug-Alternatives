import { Suspense, lazy } from 'react';
import { Provider } from 'react-redux';
import { HashRouter as Router, Routes, Route } from 'react-router-dom';
import { Box, CircularProgress } from '@mui/material';
import { store } from './store/store';
import { QueryProvider } from './services/api/queryClient';
import { MainLayout } from './components/layout/MainLayout';
import { SearchForm } from './components/search/SearchForm';

/**
 * Every route but the landing one is split out.
 *
 * The build was a single 1,073 KB chunk, so a visitor who only ever searched
 * still downloaded the alternatives page, the history view and — through the
 * chart components — the whole of recharts. SearchForm stays eager because it
 * *is* the first paint; splitting it would only add a round trip before
 * anything appears.
 */
const SearchResults = lazy(() =>
  import('./components/results/SearchResults').then(m => ({ default: m.SearchResults })));
const CheaperAlternatives = lazy(() =>
  import('./components/alternatives/CheaperAlternatives').then(m => ({ default: m.CheaperAlternatives })));
const History = lazy(() =>
  import('./components/history/History').then(m => ({ default: m.History })));
const NotFound = lazy(() =>
  import('./components/layout/NotFound').then(m => ({ default: m.NotFound })));

/** Shown while a route chunk arrives. Sized to hold the fold steady. */
const RouteFallback = () => (
  <Box sx={{ display: 'flex', justifyContent: 'center', py: 12 }}>
    <CircularProgress size={28} />
  </Box>
);

function App() {
  return (
    <Provider store={store}>
      <QueryProvider>
        <Router>
          <MainLayout>
            <Suspense fallback={<RouteFallback />}>
              <Routes>
                <Route path="/" element={<SearchForm />} />
                <Route path="/search" element={<SearchForm />} />
                <Route path="/results" element={<SearchResults />} />
                <Route path="/alternatives" element={<CheaperAlternatives />} />
                <Route path="/history" element={<History />} />
                {/* /analysis, /settings and /help used to render a "coming
                    soon" placeholder. Nothing linked to them — the only links
                    lived in a Sidebar that was never mounted — so they were
                    three promises the app made to nobody. Removed along with
                    the sidebar; anything still pointing at them now lands here
                    and is told so. */}
                <Route path="*" element={<NotFound />} />
              </Routes>
            </Suspense>
          </MainLayout>
        </Router>
      </QueryProvider>
    </Provider>
  );
}

export default App;
