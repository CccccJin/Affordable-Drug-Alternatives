import { useQuery } from '@tanstack/react-query';
import {
  loadSubstitutability,
  lookupGroups,
} from '../services/api/substitutabilityApi';
import { loadBiologics, lookupBiologics } from '../services/api/biologicsApi';
import type { Compound } from '../types/api';
import { substitutabilityQueryKey } from './useSubstitutability';
import { biologicsQueryKey } from './useAlternatives';

/**
 * One-line substitutability verdict per compound, for the results list.
 *
 * The page had this exactly backwards. It showed structural similarity
 * prominently — the number the caveat above it says you must *not* act on —
 * while whether a drug can actually be substituted, and for how much less, sat
 * two clicks away inside a dialog. This puts the actionable answer on the card.
 *
 * The verdict leads with what to do rather than with a letter. `grade.py`'s
 * A/B/C/D are the vocabulary of a pairwise API and of the evaluation report;
 * a visitor should not have to learn them to find out whether a pharmacist can
 * hand them something cheaper. The letter stays in the details dialog, where it
 * belongs with the evidence chain it cites.
 */
export type SubstitutabilityTier = 'pharmacy' | 'prescriber';

export interface SubstitutabilitySummary {
  tier: SubstitutabilityTier;
  /** What the reader can do, in words, not in code. */
  headline: string;
  /** Why they may do it — one clause, not a paragraph. */
  detail: string;
  /** Largest computable saving across matching groups, or null. */
  savingPercent: number | null;
}

const summarise = (
  tier: SubstitutabilityTier,
  savingPercent: number | null,
  detail: string
): SubstitutabilitySummary => ({
  tier,
  headline: tier === 'pharmacy'
    ? 'A pharmacist can substitute'
    : 'Needs prescriber approval',
  detail,
  savingPercent,
});

/**
 * Verdicts keyed by ChEMBL id. Absent from the map means no FDA data, which is
 * the common case — 971 of 84,818 compounds — and the card shows nothing rather
 * than a badge saying so on nine cards in ten.
 */
export const useSubstitutabilitySummaries = (
  compounds: Compound[]
): Map<string, SubstitutabilitySummary> => {
  const substitutability = useQuery({
    queryKey: substitutabilityQueryKey,
    queryFn: loadSubstitutability,
    staleTime: Infinity,
  });
  const biologics = useQuery({
    queryKey: biologicsQueryKey,
    queryFn: loadBiologics,
    staleTime: Infinity,
  });

  const summaries = new Map<string, SubstitutabilitySummary>();
  if (!substitutability.data || !biologics.data) return summaries;

  for (const compound of compounds) {
    // Orange Book: every exported group is AB-rated, so the tier is fixed and
    // only the saving varies. Take the best across matching strengths.
    const groups = lookupGroups(substitutability.data, compound.pref_name);
    if (groups.length > 0) {
      const savings = groups
        .map(g => g.savingPercent)
        .filter((s): s is number => s !== null);
      summaries.set(
        compound.chembl_id,
        summarise(
          'pharmacy',
          savings.length ? Math.max(...savings) : null,
          'FDA rates these products therapeutically equivalent'
        )
      );
      continue;
    }

    // Purple Book: the tier depends on whether a follow-on is interchangeable
    // or merely biosimilar, so it is read off the cheapest switch on offer.
    const families = lookupBiologics(biologics.data, compound.pref_name);
    if (families.length > 0) {
      const switches = families.flatMap(f => f.savings);
      const best = switches.length
        ? switches.reduce((a, b) => (b.savingPercent > a.savingPercent ? b : a))
        : null;
      const interchangeable = best
        ? best.grade === 'A'
        : families.some(f => f.members.some(m => m.grade === 'A'));
      // A biologic rating always points at one product, so the card names it.
      // "A pharmacist can substitute" with nothing after it would read as a
      // claim about every product in the family, which rule B5 denies.
      const reference = families[0].referenceProduct;
      summaries.set(
        compound.chembl_id,
        summarise(
          interchangeable ? 'pharmacy' : 'prescriber',
          best ? best.savingPercent : null,
          interchangeable
            ? `FDA rates a follow-on interchangeable with ${reference ?? 'the reference product'}`
            : `A biosimilar to ${reference ?? 'the reference product'} exists, with no interchangeability finding`
        )
      );
    }
  }

  return summaries;
};
