import { useQuery } from '@tanstack/react-query';
import {
  loadSubstitutability,
  lookupGroups,
} from '../services/api/substitutabilityApi';
import type { Compound, SubstitutabilityResult } from '../types/api';

export const substitutabilityQueryKey = ['substitutability'] as const;

/**
 * Reasons a compound has no FDA equivalence data. Only 1,020 of the 5,000 demo
 * compounds match an Orange Book ingredient, so this is the common case rather
 * than an edge case, and the UI states it rather than rendering an empty panel.
 */
const noCoverageReason = (compound: Compound): string => {
  if (!compound.pref_name) {
    return 'This compound has no preferred name, so it cannot be matched to an FDA drug listing.';
  }
  return (
    `No FDA therapeutic-equivalence data for ${compound.pref_name}. It is not listed ` +
    'in the Orange Book — most often because it is a research compound rather than an ' +
    'approved drug, because it is a biologic (those are licensed through the Purple ' +
    'Book instead), or because it has no generic competition and so carries no ' +
    'equivalence rating.'
  );
};

export const useSubstitutability = (
  compound: Compound | null,
): SubstitutabilityResult => {
  const { data, isLoading, error } = useQuery({
    queryKey: substitutabilityQueryKey,
    queryFn: loadSubstitutability,
    staleTime: Infinity,
    enabled: Boolean(compound),
  });

  if (!compound) return { status: 'no-coverage', reason: 'No compound selected.' };
  if (isLoading) return { status: 'loading' };
  if (error) {
    return {
      status: 'error',
      message: error instanceof Error ? error.message : 'Unknown error',
    };
  }
  if (!data) return { status: 'loading' };

  const groups = lookupGroups(data, compound.pref_name);
  if (groups.length === 0) {
    return { status: 'no-coverage', reason: noCoverageReason(compound) };
  }
  return { status: 'found', groups, meta: data.meta };
};
