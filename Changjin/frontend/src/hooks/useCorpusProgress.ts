import { useEffect, useState } from 'react';
import { onCorpusProgress } from '../services/search/fingerprintStore';
import type { LoadProgress } from '../services/search/fingerprintStore';

/**
 * Download progress for the compound corpus, or null when nothing is loading.
 *
 * Resets to null once the download completes so the caller falls back to its
 * ordinary "searching" message: after the corpus is cached the wait really is
 * computation, and saying "downloading" then would be the same kind of
 * inaccuracy this exists to fix.
 */
export const useCorpusProgress = (): LoadProgress | null => {
  const [progress, setProgress] = useState<LoadProgress | null>(null);

  useEffect(() => onCorpusProgress(next => {
    setProgress(next.total > 0 && next.loaded >= next.total ? null : next);
  }), []);

  return progress;
};
