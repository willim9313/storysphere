import { useTranslation } from 'react-i18next';

import { Tooltip } from '@/components/ui/Tooltip';
import { useElementWidth } from '@/hooks/useElementWidth';
import { densityStep, typeStyle } from './tokens';
import {
  OUTSIDE_CELL_FLEX,
  hasDistinctPeak,
  type ChapterAxis,
  type ChapterAxisSlot,
} from './chapterAxis';
import { barHeight } from './interpretationModel';
import { distributionSummary, segmentLabel } from './symbolPhrases';
import type { SymbolSignals } from './symbolSignals';

/** Tallest a bar can draw, in px. */
const MAX_BAR_H = 72;
/** An occupied chapter is never invisible, however small its share. */
const MIN_BAR_H = 3;
/** Matches `gap` on `.sym-dist-plot` / `.sym-dist-labels`. */
const COL_GAP = 3;
/** Width one digit of an 11px tabular chapter number needs, plus breathing room. */
const DIGIT_W = 7;
const LABEL_PAD = 4;
/** Below this, a front/back column shows 「前／後」 rather than 「目次」「後記」. */
const OUTSIDE_LABEL_MIN_W = 36;

interface Props {
  signals: SymbolSignals;
  axis: ChapterAxis;
  /** Count a full-height bar represents. Must come from `barScale`. */
  scale: number;
  /**
   * A second symbol drawn beneath, for comparison. Null when nothing is pinned or
   * when the pinned symbol is the one already shown.
   */
  pinned: SymbolSignals | null;
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
export function ChapterDistChart({ signals, axis, scale, pinned }: Readonly<Props>) {
  const { t } = useTranslation('analysis');
  const distribution = signals.item.chapter_distribution ?? {};
  // No markers when nothing stands out — see `hasDistinctPeak`.
  const peaks = hasDistinctPeak(signals.distribution)
    ? new Set(signals.distribution.peakBodyChapters)
    : new Set<number>();

  // The chart fills whatever the card gives it. At 720px that is ~306px, so every
  // column still draws and only the axis numbers thin out — see `visibleBodyLabels`.
  const [plotRef, plotW] = useElementWidth<HTMLDivElement>();
  const bodyChapters = axis.slots.filter((s) => s.segment === 'body').map((s) => s.chapter);
  const outsideCount = axis.slots.length - bodyChapters.length;
  const colW =
    plotW > 0
      ? (plotW - COL_GAP * (axis.slots.length - 1)) /
        (bodyChapters.length + OUTSIDE_CELL_FLEX * outsideCount)
      : Infinity;
  const shownLabels = visibleBodyLabels(bodyChapters, peaks, colW);
  const compactOutside = colW * OUTSIDE_CELL_FLEX < OUTSIDE_LABEL_MIN_W;

  return (
    <div className="sym-dist" ref={plotRef}>
      {/* The bars are an image; their numbers live in hover tooltips only, so the
          plot carries them as its accessible name. */}
      <div
        className="sym-dist-plot"
        role="img"
        aria-label={t('symbol.chartLabel', {
          term: signals.term,
          counts: distributionSummary(t, distribution, axis),
        })}
      >
        {axis.slots.map((slot) => {
          const count = distribution[String(slot.chapter)] ?? 0;
          const isBody = slot.segment === 'body';
          const isPeak = isBody && count > 0 && peaks.has(slot.chapter);
          return (
            <div
              key={slot.chapter}
              className="sym-dist-colwrap"
              style={{ flex: isBody ? 1 : OUTSIDE_CELL_FLEX }}
            >
              <Tooltip label={slotTitle(t, slot, count)}>
                <div className="sym-dist-col">
                  <span className="sym-dist-peak">{isPeak ? '▲' : ''}</span>
                  <span
                    className="sym-dist-bar"
                    style={{
                      // Zero is a 1px baseline, not a hole that reads as missing data.
                      height: `${barHeight(count, scale, MAX_BAR_H, MIN_BAR_H)}px`,
                      background: count > 0 ? densityStep(count) : 'var(--border)',
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
              </Tooltip>
            </div>
          );
        })}
      </div>

      {pinned !== null && (
        <div className="sym-dist-pin">
          <div
            className="sym-dist-plot is-pin"
            role="img"
            aria-label={t('symbol.chartLabel', {
              term: pinned.term,
              counts: distributionSummary(t, pinned.item.chapter_distribution ?? {}, axis),
            })}
          >
            {axis.slots.map((slot) => {
              const count = (pinned.item.chapter_distribution ?? {})[String(slot.chapter)] ?? 0;
              const isBody = slot.segment === 'body';
              return (
                <div
                  key={slot.chapter}
                  className="sym-dist-colwrap"
                  style={{ flex: isBody ? 1 : OUTSIDE_CELL_FLEX }}
                >
                  <Tooltip label={slotTitle(t, slot, count)}>
                    <div className="sym-dist-col">
                      <span
                        className="sym-dist-bar"
                        style={{
                          // Same scale and same px ceiling as the row above, so the
                          // two rows can be compared by height.
                          height: `${barHeight(count, scale, MAX_BAR_H, MIN_BAR_H)}px`,
                          // The pinned row is drawn in its own type colour rather than
                          // the shared density scale: two rows of the same browns would
                          // read as one chart with a gap in it.
                          background:
                            count > 0 ? typeStyle(pinned.imageryType).dot : 'var(--border)',
                          opacity: isBody ? undefined : 0.45,
                        }}
                      />
                    </div>
                  </Tooltip>
                </div>
              );
            })}
          </div>
        </div>
      )}

      <div className="sym-dist-labels">
        {axis.slots.map((slot) => {
          const isBody = slot.segment === 'body';
          return (
            <span
              key={slot.chapter}
              className={'sym-dist-label' + (isBody ? '' : ' is-outside')}
              style={{ flex: isBody ? 1 : OUTSIDE_CELL_FLEX }}
            >
              {isBody
                ? shownLabels.has(slot.chapter) && slot.chapter
                : compactOutside
                  ? t(`symbol.dist.label.${slot.segment}`)
                  : segmentLabel(t, slot)}
            </span>
          );
        })}
      </div>
    </div>
  );
}

/**
 * Which body chapter numbers fit under their columns without colliding.
 *
 * Every chapter draws a column at any width; only the numbers thin out. The first
 * and last chapter and the peaks are placed first, then every k-th chapter where
 * k columns are wide enough for one number, skipping any that would land within k
 * columns of a number already placed.
 */
function visibleBodyLabels(
  chapters: readonly number[],
  peaks: ReadonlySet<number>,
  colW: number,
): Set<number> {
  if (chapters.length === 0) return new Set();
  const digits = String(chapters[chapters.length - 1]).length;
  const stride = Math.max(1, Math.ceil((digits * DIGIT_W + LABEL_PAD) / colW));
  if (stride === 1) return new Set(chapters);

  const last = chapters.length - 1;
  const candidates = [0, last];
  chapters.forEach((ch, i) => {
    if (peaks.has(ch)) candidates.push(i);
  });
  for (let i = 0; i <= last; i += stride) candidates.push(i);

  const placed: number[] = [];
  for (const i of candidates) {
    if (placed.every((p) => Math.abs(p - i) >= stride)) placed.push(i);
  }
  return new Set(placed.map((i) => chapters[i]));
}

type T = ReturnType<typeof useTranslation<'analysis'>>['t'];

/** Hover text naming the slot in the reader's terms, not the raw chapter number. */
function slotTitle(t: T, slot: ChapterAxisSlot, count: number): string {
  const where =
    slot.segment === 'body' ? t('symbol.chapterN', { n: slot.chapter }) : segmentLabel(t, slot);
  return `${where} · ${t('symbol.chapterOccurrences', { count })}`;
}
