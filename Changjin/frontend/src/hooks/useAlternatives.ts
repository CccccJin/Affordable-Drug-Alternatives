import { useQuery } from '@tanstack/react-query';
import {
  loadSubstitutability,
  lookupGroups,
  suggestNames,
  topSavings,
} from '../services/api/substitutabilityApi';
import type { AlternativesResult } from '../types/api';
import { substitutabilityQueryKey } from './useSubstitutability';

/**
 * Find the FDA-rated therapeutic equivalents of a drug, priced.
 *
 * This is the question the project exists to answer -- "I was prescribed X;
 * what may be substituted for it, and what does that cost?" -- and until now it
 * only had a Python entry point (`price_compare.compare`). The data is the same
 * precomputed export the compound dialog reads; what is new is reaching it by
 * the name a patient actually holds, which is a brand name.
 *
 * Shares one query key with `useSubstitutability`, so the 1.8 MB payload is
 * fetched once per session however the user arrives at it.
 */
export const useAlternatives = (query: string): AlternativesResult => {
  const { data, isLoading, error } = useQuery({
    queryKey: substitutabilityQueryKey,
    queryFn: loadSubstitutability,
    staleTime: Infinity,
  });

  if (isLoading) return { status: 'loading' };
  if (error) {
    return {
      status: 'error',
      message: error instanceof Error ? error.message : 'Unknown error',
    };
  }
  if (!data) return { status: 'loading' };

  const trimmed = query.trim();
  if (!trimmed) {
    return { status: 'idle', highlights: topSavings(data), meta: data.meta };
  }

  const groups = lookupGroups(data, trimmed);
  if (groups.length === 0) {
    return {
      status: 'no-match',
      query: trimmed,
      suggestions: suggestNames(data, trimmed),
    };
  }

  // Biggest saving first: the reason someone ran this search.
  const ranked = [...groups].sort(
    (a, b) => (b.savingPercent ?? -1) - (a.savingPercent ?? -1)
  );
  return { status: 'found', query: trimmed, groups: ranked, meta: data.meta };
};
