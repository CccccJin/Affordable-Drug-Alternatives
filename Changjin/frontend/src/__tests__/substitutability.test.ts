import { jest } from '@jest/globals';
import {
  lookupGroups,
  loadSubstitutability,
  __resetSubstitutabilityCache,
} from '../services/api/substitutabilityApi';
import type { SubstitutabilityData } from '../types/api';

const wire = {
  meta: {
    orange_book: 'products.txt', nadac_week: '2026-08-26',
    openfda_ndc: '2026-08-28', generated: '2026-08-29',
    price_basis: 'NADAC is what pharmacies pay to acquire a drug.',
    coverage: { groups: 2, with_savings: 1, members: 3 },
  },
  groups: [
    {
      i: 'ATORVASTATIN CALCIUM', df: 'TABLET', r: 'ORAL', s: 'EQ 40MG BASE',
      n: 2, sv: 99.8,
      mem: [
        { a: 'ANDA090548', t: 'ATORVASTATIN CALCIUM', m: 'APOTEX', te: 'AB', b: 0, p: 0.03704, u: 'EA' },
        { a: 'NDA020702', t: 'LIPITOR', m: 'UPJOHN', te: 'AB', b: 1, p: 19.11383, u: 'EA' },
      ],
    },
    {
      i: 'METOPROLOL SUCCINATE', df: 'TABLET, EXTENDED RELEASE', r: 'ORAL', s: '50MG',
      n: 1, sv: null,
      mem: [{ a: 'ANDA000001', t: 'METOPROLOL', m: 'X', te: 'AB', b: 0, p: null, u: null }],
    },
  ],
  // The export indexes both the Orange Book name and the salt-stripped moiety.
  name_index: {
    'ATORVASTATIN CALCIUM': [0], ATORVASTATIN: [0],
    'METOPROLOL SUCCINATE': [1], METOPROLOL: [1],
  },
};

describe('substitutabilityApi', () => {
  beforeEach(() => {
    __resetSubstitutabilityCache();
    global.fetch = jest.fn(() =>
      Promise.resolve({ ok: true, json: () => Promise.resolve(wire) }),
    ) as unknown as typeof fetch;
  });

  it('expands the short wire keys into readable fields', async () => {
    const data = await loadSubstitutability();
    const member = data.groups[0].members[1];
    expect(member.tradeName).toBe('LIPITOR');
    expect(member.applicationNumber).toBe('NDA020702');
    expect(member.isBrand).toBe(true);
    expect(member.pricePerUnit).toBe(19.11383);
    expect(data.groups[0].savingPercent).toBe(99.8);
  });

  it('carries the acquisition-cost disclaimer through to the parsed meta', async () => {
    const data = await loadSubstitutability();
    expect(data.meta.priceBasis).toMatch(/acquire/i);
  });

  it('caches, so several mounted cards share one request', async () => {
    await loadSubstitutability();
    await loadSubstitutability();
    expect((global.fetch as jest.Mock).mock.calls).toHaveLength(1);
  });

  it('throws with the status when the export is missing', async () => {
    global.fetch = jest.fn(() =>
      Promise.resolve({ ok: false, status: 404 }),
    ) as unknown as typeof fetch;
    await expect(loadSubstitutability()).rejects.toThrow(/404/);
  });
});

describe('lookupGroups', () => {
  let data: SubstitutabilityData;
  beforeEach(async () => {
    __resetSubstitutabilityCache();
    global.fetch = jest.fn(() =>
      Promise.resolve({ ok: true, json: () => Promise.resolve(wire) }),
    ) as unknown as typeof fetch;
    data = await loadSubstitutability();
  });

  it('finds a group through the salt-stripped name', () => {
    // A ChEMBL pref_name is "ATORVASTATIN"; the Orange Book says
    // "ATORVASTATIN CALCIUM". Both must reach the same group.
    const groups = lookupGroups(data, 'ATORVASTATIN');
    expect(groups).toHaveLength(1);
    expect(groups[0].ingredient).toBe('ATORVASTATIN CALCIUM');
  });

  it('finds a group through the full Orange Book name', () => {
    expect(lookupGroups(data, 'ATORVASTATIN CALCIUM')[0].ingredient)
      .toBe('ATORVASTATIN CALCIUM');
  });

  it('is case- and whitespace-insensitive', () => {
    expect(lookupGroups(data, '  atorvastatin  ')).toHaveLength(1);
  });

  it('returns nothing for a compound with no Orange Book entry', () => {
    expect(lookupGroups(data, 'CHEMBL-RESEARCH-COMPOUND')).toEqual([]);
    expect(lookupGroups(data, null)).toEqual([]);
    expect(lookupGroups(data, undefined)).toEqual([]);
  });
});
