/**
 * 雙軌譜 (stave) — the 章節順序 view's primary visual.
 *
 * Each row plots narrative order along X and `deviation` along Y, so the
 * dashed midline reads as "the author told it in the order it happened".
 * A book that barely reorders anything renders as a near-flat line — which
 * is a *result*, not an empty state, and is why the headline states it.
 *
 * Rendered as SVG rather than the design prototype's rotated `div`s: the
 * geometry layer hands over endpoints, so a `<line>` needs no rotation math
 * and survives resize without recomputation.
 */

import { useTranslation } from 'react-i18next';
import {
  STAVE_MID,
  STAVE_ROW_HEIGHT,
  STAVE_UNRANKED_BAND,
  type StaveRow,
  type TimelineDatum,
} from '@/lib/timelineGeometry';

interface TimelineStaveProps {
  rows: StaveRow[];
  selectedChapter: number;
  selectedEventId: string | null;
  /** Ids excluded by the filter in *dim* mode (they are still drawn). */
  dimmedIds: Set<string>;
  onSelectChapter: (chapter: number) => void;
  onSelectEvent: (d: TimelineDatum) => void;
}

export function TimelineStave({
  rows,
  selectedChapter,
  selectedEventId,
  dimmedIds,
  onSelectChapter,
  onSelectEvent,
}: TimelineStaveProps) {
  const { t } = useTranslation('analysis');

  return (
    <div className="tl-stave">
      {rows.map((row, i) => (
        <div
          className="tl-stave-row"
          key={i}
          style={{ height: STAVE_ROW_HEIGHT + (row.hasUnranked ? STAVE_UNRANKED_BAND : 0) }}
        >
          {/* Chapter bands sit behind everything and are the click target
              for changing chapter. They cover filtered-out chapters too, so
              a chapter never disappears from the navigation. */}
          {row.bands.map((band) => (
            <button
              type="button"
              key={`${band.chapter}-${band.x1Pct}`}
              className={`tl-stave-band${band.chapter === selectedChapter ? ' active' : ''}`}
              style={{
                left: `${band.x1Pct}%`,
                width: `${band.x2Pct - band.x1Pct}%`,
                bottom: row.hasUnranked ? STAVE_UNRANKED_BAND : 0,
              }}
              onClick={() => onSelectChapter(band.chapter)}
              aria-label={t('timeline.gotoChapter', { n: band.chapter })}
            >
              <span className="tl-stave-band-label">Ch.{band.chapter}</span>
            </button>
          ))}

          <svg
            className="tl-stave-svg"
            width="100%"
            height={STAVE_ROW_HEIGHT}
            aria-hidden="true"
            focusable="false"
          >
            <line
              className="tl-stave-midline"
              x1="0"
              y1={STAVE_MID}
              x2="100%"
              y2={STAVE_MID}
            />
            {row.links.map((l, k) => (
              <line
                key={k}
                className={`tl-stave-link${l.outlier ? ' outlier' : ''}`}
                x1={`${l.x1Pct}%`}
                y1={l.y1Px}
                x2={`${l.x2Pct}%`}
                y2={l.y2Px}
              />
            ))}
            {row.points.map((p) => (
              <circle
                key={p.id}
                className={[
                  'tl-stave-dot',
                  p.outlier ? 'outlier' : '',
                  p.hasAnalysis ? 'analyzed' : 'unanalyzed',
                  p.id === selectedEventId ? 'selected' : '',
                  dimmedIds.has(p.id) ? 'dim' : '',
                ]
                  .filter(Boolean)
                  .join(' ')}
                cx={`${p.xPct}%`}
                cy={p.yPx}
                r={p.radius}
              />
            ))}
          </svg>

          {/* Hit targets are separate from the SVG so each point gets a real
              focusable button with an accessible name. */}
          {row.points.map((p) => (
            <button
              type="button"
              key={p.id}
              className={`tl-stave-hit${p.id === selectedEventId ? ' selected' : ''}`}
              style={{ left: `${p.xPct}%`, top: p.yPx }}
              onClick={() => onSelectEvent(p.datum)}
              title={`${p.datum.title} · rank ${p.datum.chronologicalRank?.toFixed(2)}`}
            >
              <span className="sr-only">{p.datum.title}</span>
            </button>
          ))}

          {row.annotations.map((a) => (
            <span
              key={a.id}
              className={`tl-stave-note ${a.align}`}
              style={{ left: `${a.xPct}%`, top: a.yPx }}
            >
              {t(
                a.kind === 'flashback'
                  ? 'timeline.stave.flashbackNote'
                  : 'timeline.stave.flashforwardNote',
                { ch: a.chapter, count: a.count },
              )}
            </span>
          ))}

          {/* rank === null is a stable class of events, so it gets a
              permanent home rather than being hidden. */}
          {row.hasUnranked && (
            <div className="tl-stave-unranked" style={{ height: STAVE_UNRANKED_BAND }}>
              <span className="tl-stave-unranked-label">{t('timeline.stave.unranked')}</span>
              {row.unranked.map((u) => (
                <button
                  type="button"
                  key={u.id}
                  className={`tl-stave-unranked-dot${
                    u.id === selectedEventId ? ' selected' : ''
                  }${dimmedIds.has(u.id) ? ' dim' : ''}`}
                  style={{ left: `${u.xPct}%` }}
                  onClick={() => onSelectEvent(u.datum)}
                  title={u.datum.title}
                >
                  <span className="sr-only">{u.datum.title}</span>
                </button>
              ))}
            </div>
          )}
        </div>
      ))}
    </div>
  );
}
