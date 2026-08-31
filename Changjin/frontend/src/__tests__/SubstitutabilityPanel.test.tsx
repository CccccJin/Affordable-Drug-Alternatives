import { jest } from '@jest/globals';
import { render, screen, waitFor } from '@testing-library/react';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { SubstitutabilityPanel } from '../components/results/SubstitutabilityPanel';
import { __resetSubstitutabilityCache } from '../services/api/substitutabilityApi';
import type { Compound } from '../types/api';

const wire = {
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

const compound = (prefName: string | null): Compound => ({
  chembl_id: 'CHEMBL1487', pref_name: prefName, smiles: 'CC', similarity: 1,
});

const renderPanel = (prefName: string | null) => {
  const client = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  return render(
    <QueryClientProvider client={client}>
      <SubstitutabilityPanel compound={compound(prefName)} />
    </QueryClientProvider>,
  );
};

beforeEach(() => {
  __resetSubstitutabilityCache();
  global.fetch = jest.fn(() =>
    Promise.resolve({ ok: true, json: () => Promise.resolve(wire) }),
  ) as unknown as typeof fetch;
});

describe('SubstitutabilityPanel', () => {
  it('shows the group, its prices and the saving', async () => {
    renderPanel('ATORVASTATIN');
    // The brand name appears twice by design: once in the table, once in the
    // saving sentence. Assert on all matches rather than a unique one.
    expect(await screen.findAllByText('LIPITOR')).not.toHaveLength(0);
    // Precision tracks magnitude: three decimals at $19, five at sub-cent —
    // a generic priced 0.03704 must not round to 0.04.
    expect(screen.getAllByText('19.114').length).toBeGreaterThan(0);
    expect(screen.getAllByText('0.03704').length).toBeGreaterThan(0);
    expect(screen.getByText(/99\.8%/)).toBeInTheDocument();
    expect(screen.getByText('Grade A')).toBeInTheDocument();
  });

  it('always renders the acquisition-cost disclaimer alongside a price', async () => {
    // Mirrors test_price_compare.py: a price must never read as a patient cost.
    renderPanel('ATORVASTATIN');
    await screen.findAllByText('LIPITOR');
    expect(
      screen.getByText(/not a copay, not a\s+cash price, and not a reimbursement rate/i),
    ).toBeInTheDocument();
  });

  it('always renders the not-medical-advice disclaimer alongside a price', async () => {
    // The clinical counterpart to the NADAC test above: a large saving figure
    // must never read as a recommendation to switch.
    renderPanel('ATORVASTATIN');
    await screen.findAllByText('LIPITOR');
    expect(screen.getByText(/Reference information . not medical advice/i)).toBeInTheDocument();
    expect(
      screen.getByText(/Do not start, stop, or change a medication based on this page/i),
    ).toBeInTheDocument();
  });

  it('does not tell the reader a pharmacist may substitute without the prescriber', async () => {
    // The earlier phrasing read as permission granted to whoever was looking at
    // the page. The rating is a finding about products, not an instruction.
    renderPanel('ATORVASTATIN');
    await screen.findAllByText('LIPITOR');
    expect(
      screen.queryByText(/may substitute between them without contacting the prescriber/i),
    ).not.toBeInTheDocument();
    expect(
      screen.getByText(/is a decision for a pharmacist or\s+prescriber/i),
    ).toBeInTheDocument();
  });

  it('cites the Orange Book record behind every claim', async () => {
    renderPanel('ATORVASTATIN');
    await screen.findAllByText('LIPITOR');
    expect(screen.getByText(/products\.txt : NDA020702 . TE_Code = AB/)).toBeInTheDocument();
    expect(screen.getByText(/products\.txt : ANDA090548 . TE_Code = AB/)).toBeInTheDocument();
  });

  it('explains why there is no data instead of rendering an empty panel', async () => {
    renderPanel('SOME RESEARCH COMPOUND');
    await waitFor(() =>
      expect(screen.getByText(/No FDA therapeutic-equivalence data/i)).toBeInTheDocument(),
    );
    expect(screen.getByText(/Purple\s+Book/i)).toBeInTheDocument();
    expect(screen.queryAllByText('LIPITOR')).toHaveLength(0);
  });
});

describe('formatPrice', () => {
  it('keeps sub-cent precision where generics live', async () => {
    const { formatPrice } = await import('../components/substitutability/format');
    expect(formatPrice(0.03704)).toBe('0.03704');
    expect(formatPrice(0.00001)).toBe('0.00001');
  });

  it('drops noise digits on a biologic and separates thousands', async () => {
    const { formatPrice } = await import('../components/substitutability/format');
    // "$3366.12300" is five digits of noise after the only two that matter.
    expect(formatPrice(3366.123)).toBe('3,366.12');
    expect(formatPrice(29792.78571)).toBe('29,792.79');
  });

  it('renders an absent price as a dash, not a zero', async () => {
    const { formatPrice } = await import('../components/substitutability/format');
    expect(formatPrice(null)).toBe('—');
  });
});
