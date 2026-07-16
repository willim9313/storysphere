import { useLayoutEffect, useRef } from 'react';

interface BezierConnectorsProps {
  /** Scrollable element containing the column-2 chapter cards (`[data-chapter-card]`). */
  col2ScrollRef: React.RefObject<HTMLDivElement | null>;
  /** Scrollable element containing the column-3 chunk cards (`[data-chunk-id]`). */
  col3ScrollRef: React.RefObject<HTMLDivElement | null>;
  /** Index of the selected chapter card within col2ScrollRef's `[data-chapter-card]` list. */
  selectedChapterIdx: number | null;
  /** Current chapter id — a change here means the curve count must be re-rendered. */
  viewingChapterId: string | null;
  chunkCount: number;
  /** Col2 collapsed or no chapter selected hides the whole connector column. */
  visible: boolean;
  /** Bump after column collapse/expand transitions finish, to force a re-measure once layout settles. */
  colRevision: number;
}

/**
 * One cubic-bezier curve per chunk, fanning out from the selected chapter
 * card (col2) to that chunk's on-screen position (col3). Geometry is
 * measured with getBoundingClientRect — which already reflects any ancestor
 * scroll offset — against this component's own 34px-wide container, so the
 * container's height doubles as the 0-100 coordinate space of the SVG
 * viewBox.
 *
 * Perf: recalculation on scroll/resize writes path attributes directly to
 * the SVG DOM via refs (no setState), rAF-throttled. The curve *count*
 * (`pathCount`) is derived straight from props at render time — no state
 * needed — so a re-render only happens when React would already re-render
 * this component anyway (chapter switch / chunks loaded / visibility change).
 */
export function BezierConnectors({
  col2ScrollRef,
  col3ScrollRef,
  selectedChapterIdx,
  viewingChapterId,
  chunkCount,
  visible,
  colRevision,
}: BezierConnectorsProps) {
  const containerRef = useRef<HTMLDivElement>(null);
  const pathRefs = useRef<(SVGPathElement | null)[]>([]);
  const rafRef = useRef<number | null>(null);
  const pathCount = visible ? chunkCount : 0;

  // Measure + attach listeners. useLayoutEffect so freshly-mounted <path>
  // placeholders get their "d" written before paint (no empty-line flash).
  useLayoutEffect(() => {
    if (!visible) return;
    const container = containerRef.current;
    const col2El = col2ScrollRef.current;
    const col3El = col3ScrollRef.current;
    if (!container || !col2El || !col3El) return;

    const recalc = () => {
      const containerRect = container.getBoundingClientRect();
      const h = containerRect.height || 1;

      let originY = 40;
      if (selectedChapterIdx != null && selectedChapterIdx >= 0) {
        const cards = col2El.querySelectorAll('[data-chapter-card]');
        const card = cards[selectedChapterIdx];
        if (card) {
          const r = card.getBoundingClientRect();
          originY = ((r.top + r.height / 2 - containerRect.top) / h) * 100;
        }
      }
      originY = Math.max(2, Math.min(98, originY));
      const originStr = originY.toFixed(1);

      const chunkEls = col3El.querySelectorAll('[data-chunk-id]');
      chunkEls.forEach((el, i) => {
        const path = pathRefs.current[i];
        if (!path) return;
        const r = el.getBoundingClientRect();
        const y = ((r.top + r.height / 2 - containerRect.top) / h) * 100;
        const cy = Math.max(-4, Math.min(104, y));
        const active = y >= 28 && y <= 72;
        path.setAttribute(
          'd',
          `M0 ${originStr} C 18 ${originStr}, 16 ${cy.toFixed(1)}, 34 ${cy.toFixed(1)}`
        );
        path.setAttribute('stroke-width', active ? '1.5' : '0.8');
        path.setAttribute('opacity', active ? '0.75' : '0.3');
      });
    };

    recalc();

    const scheduleRecalc = () => {
      if (rafRef.current != null) return;
      rafRef.current = requestAnimationFrame(() => {
        rafRef.current = null;
        recalc();
      });
    };

    col2El.addEventListener('scroll', scheduleRecalc, { passive: true });
    col3El.addEventListener('scroll', scheduleRecalc, { passive: true });
    window.addEventListener('resize', scheduleRecalc);

    return () => {
      col2El.removeEventListener('scroll', scheduleRecalc);
      col3El.removeEventListener('scroll', scheduleRecalc);
      window.removeEventListener('resize', scheduleRecalc);
      if (rafRef.current != null) {
        cancelAnimationFrame(rafRef.current);
        rafRef.current = null;
      }
    };
  }, [visible, selectedChapterIdx, viewingChapterId, pathCount, colRevision, col2ScrollRef, col3ScrollRef]);

  if (!visible) return null;

  return (
    <div ref={containerRef} className="flex-shrink-0" style={{ width: 34, height: '100%' }}>
      <svg
        width={34}
        height="100%"
        viewBox="0 0 34 100"
        preserveAspectRatio="none"
        style={{ display: 'block', overflow: 'visible' }}
      >
        {Array.from({ length: pathCount }).map((_, i) => (
          <path
            key={i}
            ref={(el) => {
              pathRefs.current[i] = el;
            }}
            d=""
            fill="none"
            stroke="var(--accent)"
            strokeLinecap="round"
          />
        ))}
      </svg>
    </div>
  );
}
