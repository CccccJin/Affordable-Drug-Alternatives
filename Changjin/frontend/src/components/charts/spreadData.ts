import type {
  Compound,
  EquivalenceGroup,
  SubstitutabilityData,
} from '../../types/api';
import { lookupGroups } from '../../services/api/substitutabilityApi';

/**
 * Turning FDA equivalence groups into one row per drawable price spread.
 *
 * The summary row above answers "can this be substituted, and what is the best
 * saving". It cannot answer "what does the price distribution inside a group
 * actually look like", and that is the question this feeds: every surveyed
 * product plotted on one shared logarithmic axis, so the claim is visible as
 * evidence rather than asserted as a percentage.
 *
 * Two rules decide what is drawable, and both matter:
 *
 * 1. **One pricing unit per row.** NADAC prices a tablet per EA and a solution
 *    per ML. Plotting both on one axis would compare quantities that are not
 *    comparable — the same mistake `subst_data/biologic_sanity.py` exists to
 *    catch on the Python side. Each group is reduced to the single unit that
 *    carries the most surveyed products.
 * 2. **A real spread.** If every surveyed product in a group reports the same
 *    NADAC price — which happens, because several Orange Book applications can
 *    map to one surveyed NDC — there is nothing to plot and the row is dropped
 *    rather than drawn as a dot with a ratio of 1.
 *
 * Of the 2,381 exported groups, 1,679 clear rule 1 and 567 clear rule 2. Just
 * under half of those hold fewer than five products, so `sparse` is not an edge
 * case to note in passing: it is the common condition and the view marks it.
 */

/** Below this many surveyed products, a spread is an anecdote, not a rate. */
export const SPARSE_BELOW = 5;

export interface SpreadRow {
  key: string;
  ingredient: string;
  strength: string;
  dosageForm: string;
  /** Every surveyed price in the chosen unit, ascending. */
  prices: number[];
  /** The dearest brand-classified product, or null if none is surveyed. */
  brandPrice: number | null;
  brandName: string | null;
  lowest: number;
  highest: number;
  /** highest / lowest. On a log axis this is also the bar's length. */
  ratio: number;
  unit: string;
  n: number;
  sparse: boolean;
}

/** The pricing unit carrying the most surveyed products in a group. */
const dominantUnit = (group: EquivalenceGroup): string | null => {
  const counts = new Map<string, number>();
  for (const member of group.members) {
    if (member.pricePerUnit == null || !member.pricingUnit) continue;
    counts.set(member.pricingUnit, (counts.get(member.pricingUnit) ?? 0) + 1);
  }
  let best: string | null = null;
  let bestCount = 0;
  for (const [unit, count] of counts) {
    // Ties break on the unit name so the choice is stable between renders.
    if (count > bestCount || (count === bestCount && best !== null && unit < best)) {
      best = unit;
      bestCount = count;
    }
  }
  return best;
};

export const toSpreadRow = (group: EquivalenceGroup): SpreadRow | null => {
  const unit = dominantUnit(group);
  if (!unit) return null;

  const priced = group.members.filter(
    m => m.pricePerUnit != null && m.pricingUnit === unit
  );
  if (priced.length < 2) return null;

  const prices = priced
    .map(m => m.pricePerUnit as number)
    .sort((a, b) => a - b);
  const lowest = prices[0];
  const highest = prices[prices.length - 1];
  if (!(highest > lowest)) return null;

  const brands = priced.filter(m => m.isBrand);
  const dearestBrand = brands.length
    ? brands.reduce((a, b) =>
        (b.pricePerUnit as number) > (a.pricePerUnit as number) ? b : a)
    : null;

  return {
    key: `${group.ingredient}|${group.dosageForm}|${group.strength}|${unit}`,
    ingredient: group.ingredient,
    strength: group.strength,
    dosageForm: group.dosageForm,
    prices,
    brandPrice: dearestBrand ? (dearestBrand.pricePerUnit as number) : null,
    brandName: dearestBrand ? dearestBrand.tradeName : null,
    lowest,
    highest,
    ratio: highest / lowest,
    unit,
    n: prices.length,
    sparse: prices.length < SPARSE_BELOW,
  };
};

/**
 * Drawable spreads for the compounds currently on screen, widest first.
 *
 * One compound can reach several groups (one per strength) and several
 * compounds can reach the same group, so rows are de-duplicated on the key
 * before sorting. Without that a search for "atorvastatin" — which returns both
 * the acid and the calcium salt — would draw each shared group twice.
 */
export const spreadRowsFor = (
  data: SubstitutabilityData,
  compounds: Compound[]
): SpreadRow[] => {
  const seen = new Map<string, SpreadRow>();
  for (const compound of compounds) {
    for (const group of lookupGroups(data, compound.pref_name)) {
      const row = toSpreadRow(group);
      if (row && !seen.has(row.key)) seen.set(row.key, row);
    }
  }
  return [...seen.values()].sort((a, b) => b.ratio - a.ratio);
};

/**
 * Price text for the plot, at a precision that tracks magnitude.
 *
 * Lives here rather than beside the component because generic unit prices run
 * to five decimal places — atorvastatin is surveyed at $0.03704 — and rounding
 * those to two would print $0.04 beside a brand at $19.11, hiding most of the
 * ratio the row exists to show.
 */
export const formatUnitPrice = (v: number): string =>
  v >= 100
    ? `$${v.toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`
    : v >= 1
      ? `$${v.toFixed(2)}`
      : `$${v.toFixed(5)}`;

/**
 * Vertical offsets so that products sharing a price are all visible.
 *
 * Real NADAC data ties hard. Atorvastatin 20 mg has 18 surveyed products and
 * 17 of them sit within a fraction of a cent of each other: plotted straight
 * onto a log axis they land on **two** distinct pixels, and a reader sees two
 * dots where there are eighteen products. The plot would be understating its
 * own evidence.
 *
 * Points are bucketed by pixel column and fanned symmetrically about the
 * centre line, nearest-first. The offsets are a pure function of position, so
 * the same data draws identically on every render — no jitter, nothing random.
 */
export const stackOffsets = (
  xs: number[],
  spacing: number,
  maxOffset: number
): number[] => {
  const buckets = new Map<number, number>();
  return xs.map(x => {
    const bucket = Math.round(x / spacing);
    const seen = buckets.get(bucket) ?? 0;
    buckets.set(bucket, seen + 1);
    // 0, +1, -1, +2, -2, ... in units of `spacing`.
    const rank = Math.ceil(seen / 2) * (seen % 2 === 0 ? 1 : -1);
    const offset = rank * spacing;
    // Past the band, stop growing rather than draw outside the row.
    return Math.max(-maxOffset, Math.min(maxOffset, offset));
  });
};
