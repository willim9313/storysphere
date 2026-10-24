import { useTranslation } from 'react-i18next';
import type { TFunction } from 'i18next';

import { Tooltip } from '@/components/ui/Tooltip';
import { OUTSIDE_CELL_FLEX, type ChapterAxis, type ChapterSegment } from './chapterAxis';
import { segmentLabel } from './symbolPhrases';
import { densityStep } from './tokens';

/**
 * The chapter axis, as a header of three labelled runs.
 *
 * Shared with the cluster view so the two grids cannot end up labelling the same
 * columns differently — they draw the same axis for the same book.
 */
export function AxisHeader({ axis }: Readonly<{ axis: ChapterAxis }>) {
  const { t } = useTranslation('analysis');
  return (
    <>
      {axisRuns(axis).map((run) => (
        <span
          key={run.segment + run.slots[0]}
          className={'sym-heat-axis-run' + (run.segment === 'body' ? ' is-body' : '')}
          style={{ flex: run.flex }}
        >
          {axisRunLabel(t, axis, run)}
        </span>
      ))}
    </>
  );
}

/**
 * One symbol's row of cells against the axis.
 *
 * Shading is absolute — 「once」 and 「twice or more」 — and therefore comparable
 * down a column. Normalising each row against its own maximum made the book's
 * dominant image the palest thing on screen and every single-occurrence word the
 * darkest; PR #27 removed that and it must not come back through a second copy of
 * this markup.
 *
 * Unlike the detail view's bar chart, non-body cells are not dimmed here, and that
 * difference is deliberate rather than an oversight to reconcile. There, height is
 * the primary channel, so 海's colophon — three occurrences against a chapter
 * maximum of two — draws the tallest, darkest bar on the chart and has to be held
 * back. Here every cell is the same size, so colour alone cannot dominate.
 *
 * Every cell outside the body is dashed-edged, occupied or not: the edge is what
 * says "outside the story" (evidence kept, but excluded from shape and first
 * appearance), and it has to survive Ink, where hue is gone. Each cell is a DS
 * Tooltip rather than a native title — 144 of them on a 12×12 map, each only a
 * span until it is hovered.
 */
export function ChapterCells({
  distribution,
  axis,
}: Readonly<{ distribution: Record<string, number>; axis: ChapterAxis }>) {
  const { t } = useTranslation('analysis');
  return (
    <>
      {axis.slots.map((slot) => {
        const count = distribution[String(slot.chapter)] ?? 0;
        const isBody = slot.segment === 'body';
        return (
          <span
            key={slot.chapter}
            className="sym-heat-cellwrap"
            style={{ flex: isBody ? 1 : OUTSIDE_CELL_FLEX }}
          >
            <Tooltip
              label={`${
                isBody ? t('symbol.chapterN', { n: slot.chapter }) : segmentLabel(t, slot)
              } · ${t('symbol.chapterOccurrences', { count })}`}
            >
              <span
                className={'sym-heat-cell' + (isBody ? '' : ' is-outside')}
                style={count > 0 ? { background: densityStep(count) } : undefined}
              />
            </Tooltip>
          </span>
        );
      })}
    </>
  );
}

interface AxisRun {
  segment: ChapterSegment;
  slots: number[];
  flex: number;
}

/** Consecutive slots of the same segment, so the axis can be labelled in parts. */
function axisRuns(axis: ChapterAxis): AxisRun[] {
  const runs: AxisRun[] = [];
  for (const slot of axis.slots) {
    const last = runs.at(-1);
    const flex = slot.segment === 'body' ? 1 : OUTSIDE_CELL_FLEX;
    if (last?.segment === slot.segment) {
      last.slots.push(slot.chapter);
      last.flex += flex;
    } else {
      runs.push({ segment: slot.segment, slots: [slot.chapter], flex });
    }
  }
  return runs;
}

function axisRunLabel(t: TFunction<'analysis'>, axis: ChapterAxis, run: AxisRun): string {
  if (run.segment === 'body') {
    return t('symbol.overview.heat.axisBody', {
      first: run.slots[0],
      last: run.slots.at(-1),
    });
  }
  // A run can cover a colophon and a contents page at once, so it is named by its
  // first slot's declared role rather than by the segment alone.
  const slot = axis.slots.find((s) => s.chapter === run.slots[0]);
  return slot ? segmentLabel(t, slot) : run.segment;
}
