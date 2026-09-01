import { useQuery } from '@tanstack/react-query';
import { loadAtcClasses, lookupAtcClasses } from '../services/api/atcApi';
import type { AtcClass } from '../types/api';

export const atcQueryKey = ['atc-classes'] as const;

/**
 * WHO ATC level-4 classes for a drug name, or none.
 *
 * Its own query key and its own 40 KB payload: most visitors never open the
 * class panel, and the FDA answers above must not wait on it.
 */
export const useAtcClasses = (name: string): AtcClass[] => {
  const { data } = useQuery({
    queryKey: atcQueryKey,
    queryFn: loadAtcClasses,
    staleTime: Infinity,
    enabled: Boolean(name.trim()),
  });
  return data ? lookupAtcClasses(data, name) : [];
};
