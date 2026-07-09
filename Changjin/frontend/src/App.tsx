import { Provider } from 'react-redux';
import { HashRouter as Router, Routes, Route } from 'react-router-dom';
import { store } from './store/store';
import { QueryProvider } from './services/api/queryClient';
import { MainLayout } from './components/layout/MainLayout';
import { SearchForm } from './components/search/SearchForm';
import { SearchResults } from './components/results/SearchResults';
import { History } from './components/history/History';
import { ComingSoon } from './components/layout/ComingSoon';

function App() {
  return (
    <Provider store={store}>
      <QueryProvider>
        <Router>
          <MainLayout>
            <Routes>
              <Route path="/" element={<SearchForm />} />
              <Route path="/search" element={<SearchForm />} />
              <Route path="/results" element={<SearchResults />} />
              <Route path="/history" element={<History />} />
              <Route path="/analysis" element={<ComingSoon title="Analysis" />} />
              <Route path="/settings" element={<ComingSoon title="Settings" />} />
              <Route path="/help" element={<ComingSoon title="Help" />} />
            </Routes>
          </MainLayout>
        </Router>
      </QueryProvider>
    </Provider>
  );
}

export default App;
