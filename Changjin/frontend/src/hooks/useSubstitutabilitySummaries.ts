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

const TIERS: Record<SubstitutabilityTier, { headline: string; detail: string }> = {
  pharmacy: {
    headline: 'A pharmacist can substitute',
    detail: 'FDA rates an equivalent product interchangeable',
  },
  prescriber: {
    headline: 'Needs prescriber approval',
    detail: 'A follow-on exists, but FDA has made no interchangeability finding',
  },
};

const summarise = (
  tier: SubstitutabilityTier,
  savingPercent: number | null
): SubstitutabilitySummary => ({ tier, ...TIERS[tier], savingPercent });

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
        summarise('pharmacy', savings.length ? Math.max(...savings) : null)
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
      summaries.set(
        compound.chembl_id,
        summarise(interchangeable ? 'pharmacy' : 'prescriber',
                  best ? best.savingPercent : null)
      );
    }
  }

  return summaries;
};
