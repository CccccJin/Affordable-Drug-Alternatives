import { useEffect, useState } from 'react';
import { loadDescriptors, hasDescriptors } from '../services/api/staticSearchApi';

/**
 * Ensure the RDKit descriptors are in memory, and report when they are.
 *
 * They are 1.0 MB gzipped and no search path reads one, so they are not part
 * of a first search. Anything that shows a molecular weight, a LogP or a
 * property histogram asks for them here.
 *
 * The distinction matters more than it looks: a descriptor that has not loaded
 * is `null`, which is the same value a compound with no recorded weight
 * carries. A chart that cannot tell those apart reports "3 of 9 results have
 * no recorded molecular weight" about data that is merely still downloading.
 */
export const useDescriptors = (
  /**
   * Whether this caller needs them yet.
   *
   * `CompoundDetails` stays mounted with `open={false}` behind every results
   * page, so an unconditional request from it pulled the file on every search
   * and cancelled the deferral entirely — measured on the deployed site, where
   * descriptors.json appeared in the search path it had just been moved out of.
   */
  enabled = true
): { ready: boolean; error: string | null } => {
  const [ready, setReady] = useState(hasDescriptors);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (!enabled || ready) return;
    let cancelled = false;
    loadDescriptors()
      .then(() => { if (!cancelled) setReady(true); })
      .catch(e => { if (!cancelled) setError(e instanceof Error ? e.message : String(e)); });
    return () => { cancelled = true; };
  }, [enabled, ready]);

  return { ready, error };
};
