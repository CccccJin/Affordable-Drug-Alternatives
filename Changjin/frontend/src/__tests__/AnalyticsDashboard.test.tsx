/**
 * The summary row, and the class of bug that made half of it invisible.
 *
 * Two defects lived here. Four cards asked for `bgcolor: 'primary.50'` and
 * friends, but this theme's semantic palette entries hold only
 * main/light/dark/contrastText — the shade resolved to `undefined`, so the
 * cards rendered with no background at all and nothing errored. And the fourth
 * card, "Structure Types", displayed the size of a set of at most two strings,
 * so it read 1 or 2 regardless of the results.
 */
import { jest } from '@jest/globals';
import { render, screen, waitFor } from '@testing-library/react';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { readFileSync } from 'fs';
import { join } from 'path';
import { createAppTheme } from '../styles/theme';
import { __resetSubstitutabilityCache } from '../services/api/substitutabilityApi';
import { __resetBiologicsCache } from '../services/api/biologicsApi';
import type { Compound } from '../types/api';

// The charts pull in recharts and RDKit; neither is what this file is about.
// ESM does not hoist `jest.mock`, so the mocks are registered first and the
// component imported afterwards, with top-level await.
jest.unstable_mockModule('../components/charts/PropertyDistributionChart', () => ({
  PropertyDistributionChart: () => null,
}));
jest.unstable_mockModule('../components/charts/ClusteringVisualization', () => ({
  ClusteringVisualization: () => null,
}));

const { AnalyticsDashboard } = await import('../components/charts/AnalyticsDashboard');

describe('every palette shade the charts ask for must exist', () => {
  /**
   * The general form of the bug: MUI resolves an unknown shade to `undefined`
   * and paints nothing, so a typo in a palette path is invisible until someone
   * looks at the page and wonders why it is plain. `grey` is a full colour
   * object and does carry 50; the semantic entries do not.
   */
  // ESM: no __dirname. Jest runs from rootDir, which is `frontend/`.
  const CHART_DIR = join(process.cwd(), 'src', 'components', 'charts');
  const FILES = ['AnalyticsDashboard.tsx', 'ClusteringVisualization.tsx',
                 'PropertyDistributionChart.tsx'];

  it('resolves', () => {
    const theme = createAppTheme('light');
    const palette = theme.palette as unknown as Record<string, Record<string, unknown>>;
    const broken: string[] = [];

    for (const file of FILES) {
      const source = readFileSync(join(CHART_DIR, file), 'utf8');
      for (const match of source.matchAll(/'([a-z]+)\.([A-Za-z0-9]+)'/g)) {
        const [, group, shade] = match;
        if (!(group in palette)) continue;
        if (palette[group][shade] === undefined) {
          broken.push(`${file}: ${group}.${shade}`);
        }
      }
    }
    expect(broken).toEqual([]);
  });

  it('would have caught the shade that was actually broken', () => {
    const palette = createAppTheme('light').palette as unknown as
      Record<string, Record<string, unknown>>;
    expect(palette.primary['50']).toBeUndefined();
    expect(palette.grey['50']).toBeDefined();
  });
});

// --- the cards -------------------------------------------------------------
const substitutabilityWire = {
  meta: {
    orange_book: 'products.txt', nadac_week: '2026-08-26',
    openfda_ndc: '2026-08-28', generated: '2026-08-29',
    price_basis: 'NADAC is what pharmacies pay to acquire a drug.',
    coverage: { groups: 1, with_savings: 1, members: 2 },
  },
  groups: [{
    i: 'ATORVASTATIN CALCIUM', df: 'TABLET', r: 'ORAL', s: 'EQ 40MG BASE',
    n: 2, sv: 99.8,
    mem: [
      { a: 'ANDA090548', t: 'ATORVASTATIN CALCIUM', m: 'APOTEX', te: 'AB', b: 0, p: 0.03704, u: 'EA' },
      { a: 'NDA020702', t: 'LIPITOR', m: 'UPJOHN', te: 'AB', b: 1, p: 19.11383, u: 'EA' },
    ],
  }],
  name_index: { ATORVASTATIN: [0], 'ATORVASTATIN CALCIUM': [0] },
};

const biologicsWire = {
  meta: {
    purple_book: 'purplebook.csv', generated: '2026-08-29',
    coverage: { families: 0, members: 0, with_savings: 0 },
  },
  groups: [],
  name_index: {},
};

const compound = (id: string, prefName: string | null, similarity: number): Compound => ({
  chembl_id: id, pref_name: prefName, smiles: 'CC(=O)Oc1ccccc1C(=O)O', similarity,
});

const renderDashboard = (compounds: Compound[]) => {
  const client = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  return render(
    <QueryClientProvider client={client}>
      <AnalyticsDashboard compounds={compounds} />
    </QueryClientProvider>,
  );
};

beforeEach(() => {
  __resetSubstitutabilityCache();
  __resetBiologicsCache();
  global.fetch = jest.fn((url: unknown) =>
    Promise.resolve({
      ok: true,
      json: () => Promise.resolve(
        String(url).includes('biologics') ? biologicsWire : substitutabilityWire),
    }),
  ) as unknown as typeof fetch;
});

describe('AnalyticsDashboard summary cards', () => {
  const COMPOUNDS = [
    compound('CHEMBL1487', 'ATORVASTATIN', 1.0),   // in the Orange Book fixture
    compound('CHEMBL25', 'ASPIRIN', 0.92),         // not in it
    compound('CHEMBL999', 'SOMETHING', 0.31),      // not in it, low similarity
  ];

  it('counts every result', async () => {
    renderDashboard(COMPOUNDS);
    expect(await screen.findByText('Total Compounds')).toBeInTheDocument();
    expect(screen.getByText('3')).toBeInTheDocument();
  });

  it('counts only the results a pharmacist could substitute', async () => {
    renderDashboard(COMPOUNDS);
    const label = await screen.findByText('A pharmacist can substitute');
    // One of the three is in the AB-rated fixture group. The label renders
    // before the FDA payload arrives, so the count has to be awaited.
    await waitFor(() => expect(label.parentElement).toHaveTextContent('1'));
  });

  it('shows the largest saving across the results', async () => {
    renderDashboard(COMPOUNDS);
    const label = await screen.findByText('Largest saving available');
    // The fixture's saving is 99.8%. Asserting the decimal pins the rounding:
    // to whole percent this read "100%", i.e. free.
    await waitFor(() => expect(label.parentElement).toHaveTextContent('99.8%'));
  });

  it('shows a dash rather than a zero when nothing is priced', async () => {
    renderDashboard([compound('CHEMBL25', 'ASPIRIN', 0.9)]);
    const label = await screen.findByText('Largest saving available');
    await waitFor(() => expect(label.parentElement).toHaveTextContent('—'));
  });

  it('no longer reports the fabricated "Structure Types" metric', async () => {
    renderDashboard(COMPOUNDS);
    await screen.findByText('Total Compounds');
    expect(screen.queryByText('Structure Types')).not.toBeInTheDocument();
  });

  it('puts substitutability above the structural charts', async () => {
    /* Not cosmetics. The two structural charts run to roughly 880px together,
       so with them first every FDA-derived figure on this tab started past the
       fold: opening Analytics showed only structural similarity, which is the
       number the caveat tells the reader not to act on. Asserting on document
       order is the only way to hold this — jsdom has no layout, so a height
       assertion would pass no matter where the sections sit. */
    renderDashboard(COMPOUNDS);
    const cards = await screen.findByText('Total Compounds');
    const structural = await screen.findByText('Structural analysis');
    expect(cards.compareDocumentPosition(structural))
      .toBe(Node.DOCUMENT_POSITION_FOLLOWING);
  });

  it('says the similarity figure is the one not tied to an FDA rating', async () => {
    renderDashboard(COMPOUNDS);
    expect(await screen.findByText(/High Structural Similarity/)).toBeInTheDocument();
    expect(screen.getByText(/Structural similarity is not substitutability/))
      .toBeInTheDocument();
  });
});
