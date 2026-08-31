import { jest } from '@jest/globals';
import {
  biologicHighlights,
  loadBiologics,
  lookupBiologics,
  __resetBiologicsCache,
} from '../services/api/biologicsApi';

const member = (
  bla: string, t: string, lt: string, g: 'reference' | 'A' | 'B',
  p: number | null, u: string | null, ref: string | null
) => ({
  b: bla, a: `BLA${bla}`, t, m: 'APPLICANT', lt, g,
  r: 'SUBCUTANEOUS', df: 'INJECTION', s: '40MG/0.8ML', p, u, ref,
});

const wire = {
  meta: {
    purple_book: 'purplebook.csv',
    generated: '2026-08-31',
    coverage: { families: 2, members: 5, with_savings: 1 },
  },
  groups: [
    {
      i: 'ADALIMUMAB', n: 3,
      sav: [{ u: 'EA', from: 'Humira', fp: 3366.12, to: 'Simlandi', tp: 478.65, g: 'A' as const, sv: 85.8 }],
      mem: [
        member('125057', 'Humira', '351(a)', 'reference', 3366.12, 'EA', null),
        member('761024', 'Simlandi', '351(k) Interchangeable', 'A', 478.65, 'EA', 'Humira'),
        member('761058', 'Idacio', '351(k) Biosimilar', 'B', 872.80, 'EA', 'Humira'),
      ],
    },
    {
      i: 'RITUXIMAB', n: 2, sav: [],
      mem: [
        member('103705', 'Rituxan', '351(a)', 'reference', null, null, null),
        member('761088', 'Ruxience', '351(k) Biosimilar', 'B', null, null, 'Rituxan'),
      ],
    },
  ],
  name_index: {
    ADALIMUMAB: [0], HUMIRA: [0], SIMLANDI: [0], IDACIO: [0],
    RITUXIMAB: [1], RITUXAN: [1], RUXIENCE: [1],
  },
};

beforeEach(() => {
  __resetBiologicsCache();
  global.fetch = jest.fn(() =>
    Promise.resolve({ ok: true, json: () => Promise.resolve(wire) })
  ) as unknown as typeof fetch;
});

describe('loadBiologics', () => {
  it('expands the short wire keys into readable fields', async () => {
    const data = await loadBiologics();
    const simlandi = data.families[0].members[1];

    expect(simlandi.tradeName).toBe('Simlandi');
    expect(simlandi.licenseType).toBe('351(k) Interchangeable');
    expect(simlandi.referenceProduct).toBe('Humira');
    expect(data.meta.coverage.withSavings).toBe(1);
  });

  it('downloads once however many callers ask', async () => {
    await Promise.all([loadBiologics(), loadBiologics()]);
    await loadBiologics();
    expect(global.fetch).toHaveBeenCalledTimes(1);
  });

  it('reports the status code when the file is missing', async () => {
    global.fetch = jest.fn(() =>
      Promise.resolve({ ok: false, status: 404 })
    ) as unknown as typeof fetch;
    await expect(loadBiologics()).rejects.toThrow(/404/);
  });
});

describe('grade within a family', () => {
  it('keeps interchangeable and biosimilar members distinct', async () => {
    const data = await loadBiologics();
    const byName = Object.fromEntries(
      data.families[0].members.map(m => [m.tradeName, m])
    );

    // The whole point of a per-member grade: one family, three statuses.
    expect(byName.Humira.grade).toBe('reference');
    expect(byName.Simlandi.grade).toBe('A');
    expect(byName.Idacio.grade).toBe('B');
  });

  it('records whether the cheapest follow-on is substitutable', async () => {
    const data = await loadBiologics();
    expect(data.families[0].savings[0].grade).toBe('A');
  });
});

describe('lookupBiologics', () => {
  it('finds a family by its reference brand', async () => {
    const data = await loadBiologics();
    expect(lookupBiologics(data, 'Humira')[0].molecule).toBe('ADALIMUMAB');
  });

  it('finds the same family by a follow-on brand', async () => {
    const data = await loadBiologics();
    expect(lookupBiologics(data, 'simlandi')[0].molecule).toBe('ADALIMUMAB');
  });

  it('finds it by the molecule', async () => {
    const data = await loadBiologics();
    expect(lookupBiologics(data, 'adalimumab')[0].molecule).toBe('ADALIMUMAB');
  });

  it('returns nothing for a name the Purple Book does not carry', async () => {
    const data = await loadBiologics();
    expect(lookupBiologics(data, 'atorvastatin')).toHaveLength(0);
  });
});

describe('biologicHighlights', () => {
  it('lists only families with a computable switch', async () => {
    const data = await loadBiologics();
    const highlights = biologicHighlights(data);

    expect(highlights).toHaveLength(1);
    expect(highlights[0].molecule).toBe('ADALIMUMAB');
    // Rituximab has members but no NADAC price on either side.
    expect(highlights.map(f => f.molecule)).not.toContain('RITUXIMAB');
  });
});
