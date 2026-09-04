import { jest } from '@jest/globals';
import {
  loadSubstitutability,
  lookupGroups,
  suggestNames,
  topSavings,
  __resetSubstitutabilityCache,
} from '../services/api/substitutabilityApi';
import { switchPair } from '../components/substitutability/groups';

const member = (
  a: string, t: string, m: string, b: 0 | 1, p: number | null
) => ({ a, t, m, te: 'AB', b, p, u: p === null ? null : 'EA' });

const wire = {
  meta: {
    orange_book: 'products.txt', nadac_week: '2026-08-26',
    openfda_ndc: '2026-08-28', generated: '2026-08-29',
    price_basis: 'NADAC is what pharmacies pay to acquire a drug.',
    coverage: { groups: 3, with_savings: 2, members: 7 },
  },
  groups: [
    {
      i: 'ATORVASTATIN CALCIUM', df: 'TABLET', r: 'ORAL', s: 'EQ 40MG BASE',
      n: 3, sv: 99.8,
      mem: [
        member('ANDA090548', 'ATORVASTATIN CALCIUM', 'APOTEX', 0, 0.03704),
        member('ANDA090549', 'ATORVASTATIN CALCIUM', 'MYLAN', 0, 0.05),
        // Two brand-classified rows: the baseline must be the dearer one.
        member('NDA020702', 'LIPITOR', 'UPJOHN', 1, 19.11383),
      ],
    },
    {
      i: 'ATORVASTATIN CALCIUM', df: 'TABLET', r: 'ORAL', s: 'EQ 10MG BASE',
      n: 2, sv: 90.0,
      mem: [
        member('ANDA090550', 'ATORVASTATIN CALCIUM', 'APOTEX', 0, 1.0),
        member('NDA020702', 'LIPITOR', 'UPJOHN', 1, 10.0),
      ],
    },
    {
      i: 'METOPROLOL SUCCINATE', df: 'TABLET, EXTENDED RELEASE', r: 'ORAL', s: '50MG',
      n: 2, sv: null,
      mem: [
        member('ANDA000001', 'METOPROLOL SUCCINATE', 'X', 0, null),
        member('NDA000002', 'TOPROL-XL', 'Y', 1, null),
      ],
    },
  ],
  name_index: {
    'ATORVASTATIN CALCIUM': [0, 1], ATORVASTATIN: [0, 1], LIPITOR: [0, 1],
    'METOPROLOL SUCCINATE': [2], METOPROLOL: [2], 'TOPROL-XL': [2],
  },
};

beforeEach(() => {
  __resetSubstitutabilityCache();
  global.fetch = jest.fn(() =>
    Promise.resolve({ ok: true, json: () => Promise.resolve(wire) })
  ) as unknown as typeof fetch;
});

describe('lookupGroups', () => {
  it('finds a group by brand name — the name a patient actually holds', async () => {
    const data = await loadSubstitutability();
    const groups = lookupGroups(data, 'Lipitor');

    expect(groups).toHaveLength(2);
    expect(groups[0].ingredient).toBe('ATORVASTATIN CALCIUM');
  });

  it('finds the same group by ingredient and by salt-stripped moiety', async () => {
    const data = await loadSubstitutability();

    expect(lookupGroups(data, 'atorvastatin calcium')).toHaveLength(2);
    expect(lookupGroups(data, 'atorvastatin')).toHaveLength(2);
  });

  it('normalises case and internal whitespace', async () => {
    const data = await loadSubstitutability();
    expect(lookupGroups(data, '  atorvastatin   calcium ')).toHaveLength(2);
  });

  it('returns nothing for a name the Orange Book does not carry', async () => {
    const data = await loadSubstitutability();
    expect(lookupGroups(data, 'ibuprofen')).toHaveLength(0);
  });
});

describe('suggestNames', () => {
  it('ranks prefix matches above interior ones', async () => {
    const data = await loadSubstitutability();
    const names = suggestNames(data, 'metoprolol');

    expect(names[0]).toBe('METOPROLOL');
    expect(names).toContain('METOPROLOL SUCCINATE');
  });

  it('matches a partial the user is still typing', async () => {
    const data = await loadSubstitutability();
    expect(suggestNames(data, 'lipi')).toContain('LIPITOR');
  });

  it('stays quiet on a query too short to mean anything', async () => {
    const data = await loadSubstitutability();
    expect(suggestNames(data, 'a')).toEqual([]);
  });
});

describe('topSavings', () => {
  it('reports one row per ingredient, not one per strength', async () => {
    const data = await loadSubstitutability();
    const top = topSavings(data);

    expect(top).toHaveLength(1);
    expect(top[0].ingredient).toBe('ATORVASTATIN CALCIUM');
    // Of the two atorvastatin strengths, the larger saving wins.
    expect(top[0].savingPercent).toBe(99.8);
  });

  it('omits groups with no computable saving', async () => {
    const data = await loadSubstitutability();
    expect(topSavings(data).map(g => g.ingredient)).not.toContain('METOPROLOL SUCCINATE');
  });
});

describe('switchPair', () => {
  it('takes the dearest brand as the baseline, not the cheapest', async () => {
    const data = await loadSubstitutability();
    const pair = switchPair(data.groups[0])!;

    expect(pair.brand.tradeName).toBe('LIPITOR');
    expect(pair.brand.pricePerUnit).toBe(19.11383);
  });

  it('takes the cheapest generic', async () => {
    const data = await loadSubstitutability();
    expect(switchPair(data.groups[0])!.generic.pricePerUnit).toBe(0.03704);
  });

  it('returns null when the export computed no saving', async () => {
    const data = await loadSubstitutability();
    expect(switchPair(data.groups[2])).toBeNull();
  });

  /**
   * The export computes a saving inside one pricing unit and names it in
   * `savingPricingUnit`. A pair drawn from any other unit would put a $/ML
   * figure and a $/EA figure beside a percentage derived from neither.
   */
  it('still pairs a single-unit group from a payload with no saving unit', () => {
    // Every priced member shares EA, so there is nothing to disambiguate.
    const m = (t: string, isBrand: boolean, p: number) => ({
      applicationNumber: 'X', tradeName: t, applicant: 'M', teCode: 'AB',
      isBrand, pricePerUnit: p, acquisitionCost: p, pricingUnit: 'EA',
    });
    const group = {
      ingredient: 'OLD', dosageForm: 'TABLET', route: 'ORAL', strength: '1MG',
      memberCount: 2, savingPercent: 50, savingPricingUnit: null,
      members: [m('GEN', false, 1), m('BRAND', true, 2)],
    };
    expect(switchPair(group)!.brand.tradeName).toBe('BRAND');
  });

  it('draws both ends of the pair from the unit the saving was computed in', () => {
    const member = (
      tradeName: string, isBrand: boolean, price: number, unit: string,
    ) => ({
      applicationNumber: 'X', tradeName, applicant: 'M', teCode: 'AB',
      isBrand, pricePerUnit: price, acquisitionCost: price, pricingUnit: unit,
    });
    const group = {
      ingredient: 'SOMEDRUG', dosageForm: 'SOLUTION', route: 'ORAL',
      strength: '50MG/ML', memberCount: 3, savingPercent: 50, savingPricingUnit: 'EA',
      // Sorted ascending by price, as the export emits them. The dearest
      // brand overall sits in ML, so an unfiltered "last brand" picks it.
      members: [
        member('GENERIC-EA', false, 1.0, 'EA'),
        member('BRAND-EA', true, 2.0, 'EA'),
        member('BRAND-ML', true, 9.0, 'ML'),
      ],
    };

    const pair = switchPair(group)!;
    expect(pair.brand.pricingUnit).toBe('EA');
    expect(pair.generic.pricingUnit).toBe('EA');
    expect(pair.brand.tradeName).toBe('BRAND-EA');
  });
});
