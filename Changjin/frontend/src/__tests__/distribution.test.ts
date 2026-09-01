/**
 * The two bins that were losing compounds.
 *
 * Both are boundary bugs on the last bin, and both were invisible: the chart
 * simply drew a shorter bar. The counts here are asserted against the input
 * length, so any future bin that drops a compound fails rather than shrinking.
 */
import {
  molecularWeightDistribution,
  similarityDistribution,
  withoutMolecularWeight,
} from '../components/charts/distribution';
import type { Compound } from '../types/api';

const compound = (
  similarity: number,
  molecularWeight: number | null = 300
): Compound => ({
  chembl_id: `CHEMBL${Math.random()}`,
  pref_name: 'X',
  smiles: 'CC',
  similarity,
  ...(molecularWeight === null ? {} : { molecular_weight: molecularWeight }),
});

const total = (bins: { count: number }[]) =>
  bins.reduce((sum, b) => sum + b.count, 0);

describe('similarity distribution', () => {
  it('keeps an exact match', () => {
    // The bug: the top bin was `>= 0.8 && < 1.0`, so 1.0 fell through it.
    // A name search always returns the query compound at 1.0, which made this
    // the single most common case.
    const bins = similarityDistribution([compound(1.0)]);
    expect(total(bins)).toBe(1);
    expect(bins.find(b => b.range === '0.8-1.0')?.count).toBe(1);
  });

  it('places every compound in exactly one bin', () => {
    const compounds = [0, 0.19, 0.2, 0.4, 0.6, 0.79, 0.8, 0.999, 1.0].map(s => compound(s));
    expect(total(similarityDistribution(compounds))).toBe(compounds.length);
  });

  it('does not double-count a value on an interior boundary', () => {
    const bins = similarityDistribution([compound(0.4)]);
    expect(total(bins)).toBe(1);
    expect(bins.find(b => b.range === '0.4-0.6')?.count).toBe(1);
    expect(bins.find(b => b.range === '0.2-0.4')).toBeUndefined();
  });

  it('averages similarity within a bin', () => {
    const bins = similarityDistribution([compound(0.85), compound(0.95)]);
    expect(bins[0].avgSimilarity).toBeCloseTo(0.9, 10);
  });
});

describe('molecular weight distribution', () => {
  it('keeps a compound heavier than the last labelled bound', () => {
    // "500+" used to mean 500–1000. The corpus holds 1,956 compounds at or
    // above 1000, the heaviest 8,848, and every one was dropped.
    const bins = molecularWeightDistribution([compound(0.5, 8848.4)]);
    expect(total(bins)).toBe(1);
    expect(bins.find(b => b.range === '500+')?.count).toBe(1);
  });

  it('places every weighed compound in exactly one bin', () => {
    const weights = [0, 99, 100, 250, 400, 500, 999, 1000, 5000];
    const compounds = weights.map(w => compound(0.5, w));
    expect(total(molecularWeightDistribution(compounds))).toBe(compounds.length);
  });

  it('leaves out a compound with no recorded weight, and counts it separately', () => {
    const compounds = [compound(0.5, 300), compound(0.5, null)];
    expect(total(molecularWeightDistribution(compounds))).toBe(1);
    expect(withoutMolecularWeight(compounds)).toBe(1);
  });

  it('is not fooled by NaN', () => {
    expect(total(molecularWeightDistribution([compound(0.5, NaN)]))).toBe(0);
  });
});
