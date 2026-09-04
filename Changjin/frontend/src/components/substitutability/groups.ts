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
 *
 * That pair lives inside one pricing unit -- $/EA and $/ML do not compare, so
 * the export picks a unit and names it in `savingPricingUnit`. Members priced
 * in any other unit are not candidates: taking the dearest brand across all of
 * them can return a brand from one unit and a generic from another, and the
 * caller renders their difference beside a percentage derived from neither.
 */
export const switchPair = (group: EquivalenceGroup) => {
  const allPriced = group.members.filter(m => m.pricePerUnit !== null);
  const units = new Set(allPriced.map(m => m.pricingUnit));
  // A payload predating `savingPricingUnit` -- a cached one, during the
  // rollout -- cannot say which unit answered. Where every priced member
  // shares a unit there is nothing to disambiguate and the old behaviour is
  // already correct; where they do not, the pair is unknowable and saying so
  // beats guessing.
  const priced = group.savingPricingUnit === null
      || group.savingPricingUnit === undefined
    ? (units.size <= 1 ? allPriced : [])
    : allPriced.filter(m => m.pricingUnit === group.savingPricingUnit);
  const brands = priced.filter(m => m.isBrand);
  const generics = priced.filter(m => !m.isBrand);
  const brand = brands.length ? brands[brands.length - 1] : null;
  const generic = generics.length ? generics[0] : null;
  return group.savingPercent !== null && brand && generic ? { brand, generic } : null;
};

/** Stable React key: the four fields the export groups on. */
export const groupKey = (group: EquivalenceGroup): string =>
  `${group.ingredient}|${group.dosageForm}|${group.route}|${group.strength}`;
