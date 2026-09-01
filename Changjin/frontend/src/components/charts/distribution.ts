import type { Compound } from '../../types/api';

/**
 * Histogram binning for the property charts.
 *
 * Extracted from the chart component because two bins were quietly losing
 * compounds and nothing could see it: the logic only ran inside a recharts
 * render, so there was nowhere to assert on it.
 *
 * Both bugs came from half-open intervals applied to the *last* bin as well as
 * the middle ones:
 *
 * - Similarity binned as `>= min && < max`, with a top bin of 0.8–1.0. A score
 *   of exactly 1.0 therefore matched no bin at all. Every name search returns
 *   the query compound itself at 1.0, so the compound the user searched for was
 *   always missing from its own histogram.
 * - Molecular weight's top bin was `{ min: 500, max: 1000 }` while its label
 *   read "500+". 1,956 of the 84,818 compounds in the corpus weigh 1000 or more
 *   — up to 8,848 — and every one of them vanished from a chart that claimed to
 *   include them.
 *
 * The last bin is closed at the top; every other bin stays half-open so nothing
 * is counted twice.
 */

export interface DistributionBin {
  range: string;
  count: number;
  avgSimilarity: number;
  [key: string]: string | number;
}

interface Range {
  min: number;
  max: number;
  label: string;
}

const bin = (
  compounds: Compound[],
  ranges: Range[],
  value: (compound: Compound) => number | null | undefined
): DistributionBin[] =>
  ranges
    .map((range, index) => {
      const isLast = index === ranges.length - 1;
      const members = compounds.filter(compound => {
        const v = value(compound);
        if (v == null || Number.isNaN(v)) return false;
        return v >= range.min && (isLast ? v <= range.max : v < range.max);
      });

      return {
        range: range.label,
        count: members.length,
        avgSimilarity: members.length
          ? members.reduce((sum, c) => sum + c.similarity, 0) / members.length
          : 0,
      };
    })
    .filter(d => d.count > 0);

const MW_RANGES: Range[] = [
  { min: 0, max: 100, label: '0-100' },
  { min: 100, max: 200, label: '100-200' },
  { min: 200, max: 300, label: '200-300' },
  { min: 300, max: 400, label: '300-400' },
  { min: 400, max: 500, label: '400-500' },
  // Open-ended, as the label has always claimed.
  { min: 500, max: Infinity, label: '500+' },
];

const SIMILARITY_RANGES: Range[] = [
  { min: 0, max: 0.2, label: '0.0-0.2' },
  { min: 0.2, max: 0.4, label: '0.2-0.4' },
  { min: 0.4, max: 0.6, label: '0.4-0.6' },
  { min: 0.6, max: 0.8, label: '0.6-0.8' },
  { min: 0.8, max: 1.0, label: '0.8-1.0' },
];

export const molecularWeightDistribution = (compounds: Compound[]): DistributionBin[] =>
  bin(compounds, MW_RANGES, c => c.molecular_weight);

export const similarityDistribution = (compounds: Compound[]): DistributionBin[] =>
  bin(compounds, SIMILARITY_RANGES, c => c.similarity);

/**
 * Compounds the weight histogram cannot place, so the chart can say so rather
 * than appearing to show every result. A missing weight is a gap in the data,
 * not a reason to pretend the compound does not exist.
 */
export const withoutMolecularWeight = (compounds: Compound[]): number =>
  compounds.filter(c => c.molecular_weight == null).length;
