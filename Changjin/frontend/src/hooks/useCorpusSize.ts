import { useEffect, useState } from 'react';

/**
 * How many compounds the deployed corpus actually holds.
 *
 * Hard-coded "5,000" appeared in three places and all three went stale the day
 * the corpus grew to 84,818 — the kind of claim that is wrong precisely when
 * someone has just improved the thing it describes. Read from metadata.json,
 * which `select_demo_compounds.py` writes, so it cannot drift again.
 */
const baseUrl = (): string => import.meta.env?.BASE_URL ?? '/';

let cached: number | null = null;

export const useCorpusSize = (): number | null => {
  const [size, setSize] = useState<number | null>(cached);

  useEffect(() => {
    if (cached !== null) return;
    let cancelled = false;
    fetch(`${baseUrl()}data/metadata.json`)
      .then(r => (r.ok ? r.json() : null))
      .then(meta => {
        const records = meta?.records ?? meta?.fingerprints?.records ?? null;
        if (!cancelled && typeof records === 'number') {
          cached = records;
          setSize(records);
        }
      })
      .catch(() => undefined);   // the copy simply omits the number
    return () => { cancelled = true; };
  }, []);

  return size;
};
