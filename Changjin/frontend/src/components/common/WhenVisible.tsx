import React, { useEffect, useRef, useState } from 'react';
import { Box } from '@mui/material';

interface WhenVisibleProps {
  children: React.ReactNode;
  /** Height held while the content is absent, so the page does not jump. */
  minHeight?: number;
  /** How far ahead of the viewport to start loading. */
  rootMargin?: string;
}

/**
 * Mount children only once they scroll near the viewport.
 *
 * `React.lazy` defers a chunk until its component *renders*, not until it is
 * *seen* — so a lazy component sitting unconditionally in the tree still
 * downloads immediately. That is what happened to the research charts on the
 * landing page: they are below the fold, they were split into their own chunk,
 * and recharts arrived on first paint anyway.
 *
 * Without IntersectionObserver the children mount immediately, which is the
 * right way to fail: showing the content late is a bug, showing it early is
 * only a missed optimisation.
 */
export const WhenVisible: React.FC<WhenVisibleProps> = ({
  children,
  minHeight = 320,
  rootMargin = '200px',
}) => {
  const ref = useRef<HTMLDivElement | null>(null);
  const [visible, setVisible] = useState(
    () => typeof IntersectionObserver === 'undefined'
  );

  useEffect(() => {
    if (visible || !ref.current) return;

    const observer = new IntersectionObserver(
      entries => {
        if (entries.some(e => e.isIntersecting)) {
          setVisible(true);
          observer.disconnect();
        }
      },
      { rootMargin }
    );
    observer.observe(ref.current);
    return () => observer.disconnect();
  }, [visible, rootMargin]);

  return (
    <Box ref={ref} sx={{ minHeight: visible ? 0 : minHeight }}>
      {visible ? children : null}
    </Box>
  );
};
