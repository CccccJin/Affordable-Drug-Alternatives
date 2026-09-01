/**
 * The rules that decide what may be plotted.
 *
 * Both exist because breaking them produces a chart that looks fine and says
 * something false: mixing pricing units compares a tablet against a millilitre,
 * and a "spread" between two identical surveyed prices is a ratio of 1 drawn as
 * though it were a finding.
 */
import {
  toSpreadRow,
  spreadRowsFor,
  formatUnitPrice,
  stackOffsets,
  SPARSE_BELOW,
} from '../components/charts/spreadData';
import type {
  Compound,
  EquivalenceGroup,
  PricedMember,
  SubstitutabilityData,
} from '../types/api';

const member = (
  price: number | null,
  unit: string | null = 'EA',
  isBrand = false,
  tradeName = 'GENERIC'
): PricedMember => ({
  applicationNumber: `ANDA${Math.floor(Math.random() * 1e6)}`,
  tradeName,
  applicant: 'ACME',
  teCode: 'AB',
  isBrand,
  pricePerUnit: price,
  pricingUnit: unit,
});

const group = (members: PricedMember[]): EquivalenceGroup => ({
  ingredient: 'ATORVASTATIN CALCIUM',
  dosageForm: 'TABLET',
  route: 'ORAL',
  strength: 'EQ 40MG BASE',
  memberCount: members.length,
  savingPercent: null,
  members,
});

describe('choosing what to plot', () => {
  it('keeps a group with two or more surveyed prices in one unit', () => {
    const row = toSpreadRow(group([member(0.037), member(19.11, 'EA', true, 'LIPITOR')]));
    expect(row).not.toBeNull();
    expect(row!.lowest).toBeCloseTo(0.037, 6);
    expect(row!.highest).toBeCloseTo(19.11, 6);
    expect(row!.ratio).toBeCloseTo(19.11 / 0.037, 4);
    expect(row!.brandName).toBe('LIPITOR');
  });

  it('never mixes pricing units on one axis', () => {
    // Three per EA, one per ML. Plotting all four would put a millilitre price
    // on the same scale as a tablet price.
    const row = toSpreadRow(group([
      member(0.04), member(0.09), member(1.20),
      member(880.0, 'ML'),
    ]));
    expect(row!.unit).toBe('EA');
    expect(row!.n).toBe(3);
    expect(row!.prices).not.toContain(880.0);
  });

  it('drops a group whose surveyed prices are all identical', () => {
    // Real case: several Orange Book applications map to one surveyed NDC, so
    // four members report exactly the same NADAC figure.
    expect(toSpreadRow(group([
      member(0.38635), member(0.38635), member(0.38635), member(0.38635),
    ]))).toBeNull();
  });

  it('drops a group with only one surveyed price', () => {
    expect(toSpreadRow(group([member(0.037), member(null)]))).toBeNull();
  });

  it('drops a group with no surveyed price at all', () => {
    expect(toSpreadRow(group([member(null), member(null)]))).toBeNull();
  });

  it('ignores a price that carries no unit', () => {
    expect(toSpreadRow(group([member(0.037), member(19.11, null)]))).toBeNull();
  });

  it('reports no brand when none of the priced products is one', () => {
    const row = toSpreadRow(group([member(0.037), member(1.10)]));
    expect(row!.brandPrice).toBeNull();
    expect(row!.brandName).toBeNull();
  });

  it('takes the dearest brand when several are surveyed', () => {
    const row = toSpreadRow(group([
      member(0.037), member(8.10, 'EA', true, 'CHEAPER BRAND'),
      member(19.11, 'EA', true, 'LIPITOR'),
    ]));
    expect(row!.brandName).toBe('LIPITOR');
  });
});

describe('marking a small sample', () => {
  it(`flags a group holding fewer than ${SPARSE_BELOW} surveyed products`, () => {
    const row = toSpreadRow(group([member(0.04), member(2.10)]));
    expect(row!.n).toBe(2);
    expect(row!.sparse).toBe(true);
  });

  it(`does not flag a group at exactly ${SPARSE_BELOW}`, () => {
    const row = toSpreadRow(group(
      [0.04, 0.06, 0.11, 0.44, 2.10].map(p => member(p))
    ));
    expect(row!.n).toBe(SPARSE_BELOW);
    expect(row!.sparse).toBe(false);
  });
});

describe('collecting rows for the compounds on screen', () => {
  const data = (): SubstitutabilityData => ({
    meta: {
      orangeBook: 'products.txt', nadacWeek: '2026-08-26', openFdaNdc: '2026-08-28',
      generated: '2026-08-31', priceBasis: 'acquisition cost',
      coverage: { groups: 1, withSavings: 1, members: 2 },
    },
    groups: [group([member(0.037), member(19.11, 'EA', true, 'LIPITOR')])],
    nameIndex: { ATORVASTATIN: [0], 'ATORVASTATIN CALCIUM': [0] },
  });

  const compound = (prefName: string): Compound => ({
    chembl_id: `CHEMBL${prefName.length}`, pref_name: prefName,
    smiles: 'CC', similarity: 1,
  });

  it('draws one group once even when several compounds reach it', () => {
    // A name search for atorvastatin returns the acid and the calcium salt,
    // and both resolve to the same equivalence group.
    const rows = spreadRowsFor(data(), [
      compound('ATORVASTATIN'), compound('ATORVASTATIN CALCIUM'),
    ]);
    expect(rows).toHaveLength(1);
  });

  it('orders the widest spread first', () => {
    const d = data();
    d.groups.push({
      ...group([member(1.00), member(2.00)]),
      ingredient: 'NARROW', strength: '10MG',
    });
    d.nameIndex.NARROW = [1];
    const rows = spreadRowsFor(d, [compound('ATORVASTATIN'), compound('NARROW')]);
    expect(rows.map(r => r.ingredient)).toEqual(['ATORVASTATIN CALCIUM', 'NARROW']);
  });

  it('returns nothing for a compound with no FDA record', () => {
    expect(spreadRowsFor(data(), [compound('SOMETHING UNKNOWN')])).toEqual([]);
  });
});

describe('price text', () => {
  it('keeps five decimals on a generic unit price', () => {
    // $0.04 next to a brand at $19.11 would hide most of the 516x ratio the
    // row exists to show.
    expect(formatUnitPrice(0.03704)).toBe('$0.03704');
  });

  it('uses two decimals once a price is above a dollar', () => {
    expect(formatUnitPrice(19.11383)).toBe('$19.11');
  });

  it('groups thousands', () => {
    expect(formatUnitPrice(3914.22)).toBe('$3,914.22');
  });
});

describe('stacking tied prices', () => {
  it('leaves an isolated point on the centre line', () => {
    expect(stackOffsets([10, 100, 200], 6, 20)).toEqual([0, 0, 0]);
  });

  it('fans points that share a pixel column', () => {
    // The case from the real data: 17 atorvastatin products within a fraction
    // of a cent, which without this land on one pixel and read as one product.
    const offsets = stackOffsets([50, 50, 50, 50, 50], 6, 40);
    expect(offsets).toEqual([0, -6, 6, -12, 12]);
    expect(new Set(offsets).size).toBe(5);
  });

  it('is deterministic — the same input draws identically', () => {
    const xs = [10, 10, 10, 90, 90];
    expect(stackOffsets(xs, 6, 40)).toEqual(stackOffsets(xs, 6, 40));
  });

  it('never draws outside the band', () => {
    const many = Array.from({ length: 40 }, () => 50);
    for (const dy of stackOffsets(many, 6, 12)) {
      expect(Math.abs(dy)).toBeLessThanOrEqual(12);
    }
  });

  it('buckets by column, so nearby but distinct prices still separate', () => {
    const offsets = stackOffsets([10, 40], 6, 40);
    expect(offsets).toEqual([0, 0]);
  });
});
