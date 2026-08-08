import { useTranslation } from 'react-i18next';

import { densityStep } from './tokens';
import { hasDistinctPeak, type ChapterAxis, type ChapterAxisSlot } from './chapterAxis';
import { segmentLabel } from './symbolPhrases';
import type { SymbolSignals } from './symbolSignals';

/** Front and back matter read as narrower columns than the story itself. */
const OUTSIDE_CELL_FLEX = 0.7;

/** Tallest a bar can draw, in px. */
const MAX_BAR_H = 72;
/** An occupied chapter is never invisible, however small its share. */
const MIN_BAR_H = 3;

interface Props {
  signals: SymbolSignals;
  axis: ChapterAxis;
  /** Count a full-height bar represents. Must come from `barScale`. */
  scale: number;
}

/**
 * One bar per axis slot, across front matter, the body, and back matter.
 *
 * The chart used to draw chapters 1..N only. Front matter had no slot at all, so
 * 5 of 海's 13 occurrences were disclosed as a footnote count and the shape of
 * the bars silently disagreed with the total printed above them.
 *
 * Height is scaled against the same cross-symbol maximum the overview heatmap
 * uses, widened if this symbol's own front or back matter exceeds it — 海 has 3
 * occurrences in the colophon and at most 2 in any chapter, and a bar taller than
 * the box is worse than a short one. Scaling to the symbol's own maximum instead
 * would draw a full-height bar for a lone occurrence, which is the per-row
 * normalisation PR #27 removed from the heatmap for making the book's dominant
 * image the palest thing on screen.
 */
export function ChapterDistChart({ signals, axis, scale }: Readonly<Props>) {
  const { t } = useTranslation('analysis');
  const distribution = signals.item.chapter_distribution ?? {};
  // No markers when nothing stands out — see `hasDistinctPeak`.
  const peaks = hasDistinctPeak(signals.distribution)
    ? new Set(signals.distribution.peakBodyChapters)
    : new Set<number>();

  return (
    <div className="sym-dist">
      <div className="sym-dist-plot">
        {axis.slots.map((slot) => {
          const count = distribution[String(slot.chapter)] ?? 0;
          const isBody = slot.segment === 'body';
          const isPeak = isBody && count > 0 && peaks.has(slot.chapter);
          return (
            <div
              key={slot.chapter}
              className="sym-dist-col"
              style={{ flex: isBody ? 1 : OUTSIDE_CELL_FLEX }}
              title={slotTitle(t, slot, count)}
            >
              <span className="sym-dist-peak">{isPeak ? '▲' : ''}</span>
              <span
                className="sym-dist-bar"
                style={{
                  height:
                    count > 0
                      ? `${Math.max(MIN_BAR_H, (count / scale) * MAX_BAR_H)}px`
                      : '2px',
                  background: count > 0 ? densityStep(count) : 'var(--bg-tertiary)',
                  // A dashed edge marks a bar that sits outside the story: kept
                  // visible, but excluded from shape and first appearance.
                  border: count > 0 && !isBody ? '1px dashed var(--fg-muted)' : undefined,
                  // Held back rather than shortened. 海's colophon holds more
                  // occurrences than any chapter does, so at full contrast the
                  // tallest, darkest bar on the chart is the noise — the eye
                  // reaches it before the note explaining it should be ignored.
                  opacity: isBody ? undefined : 0.45,
                }}
              />
            </div>
          );
        })}
      </div>

      <div className="sym-dist-labels">
        {axis.slots.map((slot) => {
          const isBody = slot.segment === 'body';
          return (
            <span
              key={slot.chapter}
              className={'sym-dist-label' + (isBody ? '' : ' is-outside')}
              style={{ flex: isBody ? 1 : OUTSIDE_CELL_FLEX }}
            >
              {isBody ? slot.chapter : segmentLabel(t, slot)}
            </span>
          );
        })}
      </div>
    </div>
  );
}

type T = ReturnType<typeof useTranslation<'analysis'>>['t'];

/** Hover text naming the slot in the reader's terms, not the raw chapter number. */
function slotTitle(t: T, slot: ChapterAxisSlot, count: number): string {
  const where =
    slot.segment === 'body' ? t('symbol.chapterN', { n: slot.chapter }) : segmentLabel(t, slot);
  return `${where} · ${t('symbol.chapterOccurrences', { count })}`;
}
