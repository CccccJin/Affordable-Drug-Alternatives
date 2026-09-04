import type { RuleEntry } from '../../types/api';

/**
 * What rule C2 says, for when the payload cannot say it.
 *
 * `atc_classes.json` is an unhashed static asset, so a browser or CDN can
 * still hold a copy predating the catalogue. Gating the disclaimer on the
 * payload meant that copy rendered the priced member table with the two claims
 * that make it safe -- that this is a classification rather than an FDA
 * finding, and that only a prescriber may act on it -- silently absent.
 *
 * This is a second copy of those strings, which is the thing this panel was
 * changed to stop having. Duplication is prevented by a test that pins these
 * against the committed payload, not by deleting the fallback: a disclaimer
 * that depends on cache state is not a disclaimer.
 */
export const C2_FALLBACK: RuleEntry = {
  grade: 'C',
  action:
    'Moving between them is a decision only a prescriber can make: a '
    + 'therapeutic interchange, not a substitution.',
  meaning:
    'A different drug of the same chemical subgroup. This is a '
    + 'classification, not an FDA equivalence finding: members differ in '
    + 'potency and dosing and may not be substituted for one another.',
};
