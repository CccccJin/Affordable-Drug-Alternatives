import type { EquivalenceGroup } from '../../types/api';

/**
 * The brand-to-generic switch a group represents, or null when it has none.
 *
 * The brand baseline is the *dearest* brand-classified product, matching the
 * export's own choice (`export_frontend.py`): taking the cheapest would
 * understate what a switch is worth. The cheapest generic is the first
 * non-brand member, which the export already sorted to the front.
 *
 * Returns null unless the export also computed a saving, so the UI can never
 * present a percentage this function derived from a different pair than the
 * one the Python layer priced.
 */
export const switchPair = (group: EquivalenceGroup) => {
  const priced = group.members.filter(m => m.pricePerUnit !== null);
  const brands = priced.filter(m => m.isBrand);
  const generics = priced.filter(m => !m.isBrand);
  const brand = brands.length ? brands[brands.length - 1] : null;
  const generic = generics.length ? generics[0] : null;
  return group.savingPercent !== null && brand && generic ? { brand, generic } : null;
};

/** Stable React key: the four fields the export groups on. */
export const groupKey = (group: EquivalenceGroup): string =>
  `${group.ingredient}|${group.dosageForm}|${group.route}|${group.strength}`;
