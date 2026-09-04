import { useQuery } from '@tanstack/react-query';
import { loadAtcClasses, lookupAtcClasses } from '../services/api/atcApi';
import type { AtcClass, RuleEntry } from '../types/api';

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
/**
 * The classes, plus the rule they all report and what the payload says it
 * means. The panel needs the rule as much as the members: without it the
 * component has to restate the finding in its own words, which is how the
 * same sentence came to live in three files.
 */
export interface AtcClasses {
  classes: AtcClass[];
  rule: string;
  rules: Record<string, RuleEntry>;
}

export const useAtcClasses = (ingredients: string[]): AtcClasses => {
  const { data } = useQuery({
    queryKey: atcQueryKey,
    queryFn: loadAtcClasses,
    staleTime: Infinity,
    enabled: ingredients.length > 0,
  });
  if (!data) return { classes: [], rule: '', rules: {} };

  const seen = new Map<string, AtcClass>();
  for (const ingredient of ingredients) {
    for (const atc of lookupAtcClasses(data, ingredient)) {
      if (!seen.has(atc.code)) seen.set(atc.code, atc);
    }
  }
  return {
    classes: [...seen.values()],
    // A payload predating the catalogue has neither field.
    rule: data.meta.rule ?? '',
    rules: data.meta.rules ?? {},
  };
};
