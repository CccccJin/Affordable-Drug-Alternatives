import { jest } from '@jest/globals';
import { render, screen, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import type { Compound } from '../types/api';

jest.unstable_mockModule('../components/results/CompoundCard', () => ({
  CompoundCard: ({ compound }: { compound: Compound }) => <div>{compound.chembl_id}</div>,
}));
jest.unstable_mockModule('../hooks/useSubstitutabilitySummaries', () => ({ useSubstitutabilitySummaries: () => new Map() }));
jest.unstable_mockModule('../hooks/useCorpusProgress', () => ({ useCorpusProgress: () => null }));
jest.unstable_mockModule('../components/export/ExportDialog', () => ({ ExportDialog: () => null }));
global.ResizeObserver = class { observe() {} unobserve() {} disconnect() {} };
const { ResultsList } = await import('../components/results/ResultsList');
const { PropertyDistributionChart } = await import('../components/charts/PropertyDistributionChart');

const compounds: Compound[] = Array.from({ length: 45 }, (_, i) => ({
  chembl_id: `CHEMBL${i + 1}`, smiles: 'CC', similarity: i === 0 ? 1 : 0.5,
  ...(i === 0 ? { molecular_weight: 150 } : {}),
}));

it('renders only the requested page and clamps pages after filtering', () => {
  const props = { results: { results: compounds, count: 45 }, isLoading: false, error: null };
  const view = render(<ResultsList {...props} currentPage={2} />);
  expect(screen.queryByText('CHEMBL1')).not.toBeInTheDocument();
  expect(screen.getByText('CHEMBL21')).toBeInTheDocument();
  expect(screen.getByText('CHEMBL40')).toBeInTheDocument();
  expect(screen.queryByText('CHEMBL41')).not.toBeInTheDocument();
  view.rerender(<ResultsList {...props} currentPage={3} results={{ count: 1, results: [compounds[0]] }} />);
  expect(screen.getByText('CHEMBL1')).toBeInTheDocument();
  expect(screen.queryByRole('navigation')).not.toBeInTheDocument();
});

it('switches the plotted property and exposes exact counts and missing values', async () => {
  const user = userEvent.setup();
  render(<PropertyDistributionChart compounds={compounds} />);
  await user.click(screen.getByText('View chart data'));
  const similarity = screen.getByRole('table', { name: 'Similarity to query distribution data' });
  expect(within(similarity).getByText('44')).toBeInTheDocument();
  await user.click(screen.getByRole('button', { name: /^Weight$/ }));
  expect(screen.getByText('44 results have no recorded weight and are excluded.')).toBeInTheDocument();
  const weights = screen.getByRole('table', { name: 'Molecular weight (g/mol) distribution data' });
  expect(within(weights).getByText('100.0%')).toBeInTheDocument();
});

it('lets users recover when a result filter matches nothing', async () => {
  const clear = jest.fn();
  render(<ResultsList results={{ count: 0, results: [] }} isLoading={false} error={null} searchQuery="no-match" onSearchQueryChange={clear} />);
  await userEvent.click(screen.getByRole('button', { name: 'Clear result filter' }));
  expect(clear).toHaveBeenCalledWith('');
});
