import { useQuery } from '@tanstack/react-query';
import { loadAtcClasses, lookupAtcClasses } from '../services/api/atcApi';
import type { AtcClass } from '../types/api';

export const atcQueryKey = ['atc-classes'] as const;

/**
 * WHO ATC level-4 classes for a set of ingredient names, or none.
 *
 * Takes ingredients rather than the raw query on purpose. The Alternatives
 * page is searched by brand — "LIPITOR" — while the ATC index is keyed on the
 * Orange Book ingredient, "ATORVASTATIN CALCIUM". Passing the query straight
 * through found nothing for every brand-name search, which is most of them.
 * The caller already holds the ingredients: FDA resolution produced them.
 *
 * Its own query key and its own 40 KB payload, so the FDA answers above never
 * wait on a file most visitors never open.
 */
export const useAtcClasses = (ingredients: string[]): AtcClass[] => {
  const { data } = useQuery({
    queryKey: atcQueryKey,
    queryFn: loadAtcClasses,
    staleTime: Infinity,
    enabled: ingredients.length > 0,
  });
  if (!data) return [];

  const seen = new Map<string, AtcClass>();
  for (const ingredient of ingredients) {
    for (const atc of lookupAtcClasses(data, ingredient)) {
      if (!seen.has(atc.code)) seen.set(atc.code, atc);
    }
  }
  return [...seen.values()];
};
