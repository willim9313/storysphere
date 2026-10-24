import { useEffect, useState } from 'react';

/**
 * Content-box width of an element, kept current with a ResizeObserver.
 *
 * Returns a callback ref (so it also works for an element that mounts later,
 * e.g. after a loading branch) and the width in px — 0 until first measured.
 * SVG charts use it to set their viewBox to the real pixel width, so text keeps
 * its CSS font size instead of scaling with the chart.
 */
export function useElementWidth<T extends HTMLElement>(): [(el: T | null) => void, number] {
  const [el, setEl] = useState<T | null>(null);
  const [width, setWidth] = useState(0);

  useEffect(() => {
    if (!el || typeof ResizeObserver === 'undefined') return;
    const ro = new ResizeObserver(([entry]) => setWidth(Math.round(entry.contentRect.width)));
    ro.observe(el);
    return () => ro.disconnect();
  }, [el]);

  return [setEl, width];
}
