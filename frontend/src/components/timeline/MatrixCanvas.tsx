/**
 * 矩陣視圖 — chapter (X, discrete) against `chronological_rank` (Y).
 *
 * The axis encoding is the information content of this chart and is fixed:
 * X = chapter, Y = rank, a 45° reference line meaning "narrative order ==
 * story order", and unranked events in a degraded band below the plot.
 *
 * Same-chapter events all share an X, so they used to stack into a single
 * unclickable column (11 deep in Ch.2 of the seed book). The beeswarm offset
 * from the geometry layer fixes that, counted per chapter.
 *
 * Replaces a d3 implementation: the geometry layer now produces the
 * coordinates, so this only has to place them.
 */

import { useTranslation } from 'react-i18next';
import {
  MATRIX_HEIGHT,
  buildMatrixPoints,
  buildMatrixUnranked,
  chapterCentrePct,
  type TimelineDatum,
} from '@/lib/timelineGeometry';

const UNRANKED_BAND_HEIGHT = 22;

interface MatrixCanvasProps {
  data: TimelineDatum[];
  chapters: number[];
  dimmedIds: Set<string>;
  selectedChapter: number;
  selectedEventId: string | null;
  outlierCount: number;
  onSelectChapter: (chapter: number) => void;
  onSelectEvent: (d: TimelineDatum) => void;
}

export function MatrixCanvas({
  data,
  chapters,
  dimmedIds,
  selectedChapter,
  selectedEventId,
  outlierCount,
  onSelectChapter,
  onSelectEvent,
}: MatrixCanvasProps) {
  const { t } = useTranslation('analysis');

  const points = buildMatrixPoints(data, chapters);
  const unranked = buildMatrixUnranked(data, chapters);

  return (
    <div className="tl-matrix">
      <div className="tl-matrix-main">
        <div className="tl-matrix-plot" style={{ height: MATRIX_HEIGHT }}>
          {chapters.map((n, i) => (
            <button
              type="button"
              key={n}
              className={`tl-matrix-col${n === selectedChapter ? ' active' : ''}`}
              style={{
                left: `${(i / chapters.length) * 100}%`,
                width: `${100 / chapters.length}%`,
              }}
              onClick={() => onSelectChapter(n)}
              aria-label={t('timeline.gotoChapter', { n })}
            >
              <span className="tl-matrix-col-label">Ch.{n}</span>
            </button>
          ))}

          <svg className="tl-matrix-svg" width="100%" height={MATRIX_HEIGHT} aria-hidden="true">
            {/* 45° reference: narrative order == story order. */}
            <line
              className="tl-matrix-diagonal"
              x1={`${chapterCentrePct(chapters[0], chapters)}%`}
              y1={MATRIX_HEIGHT}
              x2={`${chapterCentrePct(chapters.at(-1)!, chapters)}%`}
              y2={0}
            />
            {points.map((p) => (
              <circle
                key={p.id}
                className={[
                  'tl-matrix-dot',
                  p.outlier ? 'outlier' : '',
                  p.hasAnalysis ? 'analyzed' : 'unanalyzed',
                  p.id === selectedEventId ? 'selected' : '',
                  dimmedIds.has(p.id) ? 'dim' : '',
                ]
                  .filter(Boolean)
                  .join(' ')}
                cx={`calc(${p.xPct}% + ${p.offsetPx}px)`}
                cy={p.yPx}
                r={p.radius}
              />
            ))}
          </svg>

          {points.map((p) => (
            <button
              type="button"
              key={p.id}
              className="tl-matrix-hit"
              style={{ left: `calc(${p.xPct}% + ${p.offsetPx}px)`, top: p.yPx }}
              onClick={() => onSelectEvent(p.datum)}
              title={`${p.datum.title} · rank ${p.datum.chronologicalRank?.toFixed(2)}`}
            >
              <span className="sr-only">{p.datum.title}</span>
            </button>
          ))}

          <span className="tl-matrix-tick" style={{ top: 0 }}>
            1.0
          </span>
          <span className="tl-matrix-tick" style={{ top: MATRIX_HEIGHT / 2 }}>
            0.5
          </span>
          <span className="tl-matrix-tick" style={{ top: MATRIX_HEIGHT }}>
            0
          </span>
          <span className="tl-matrix-y-label">{t('timeline.matrix.yAxisLabel')}</span>
        </div>

        {unranked.length > 0 && (
          <div className="tl-matrix-unranked" style={{ height: UNRANKED_BAND_HEIGHT }}>
            {unranked.map((p) => (
              <button
                type="button"
                key={p.id}
                className={`tl-matrix-unranked-dot${
                  p.id === selectedEventId ? ' selected' : ''
                }${dimmedIds.has(p.id) ? ' dim' : ''}`}
                style={{ left: `calc(${p.xPct}% + ${p.offsetPx}px)` }}
                onClick={() => onSelectEvent(p.datum)}
                title={p.datum.title}
              >
                <span className="sr-only">{p.datum.title}</span>
              </button>
            ))}
            <span className="tl-matrix-unranked-label">
              {t('timeline.matrix.unrankedBand', { n: unranked.length })}
            </span>
          </div>
        )}

        <div className="tl-matrix-x-label">{t('timeline.matrix.xAxisLabel')}</div>
      </div>

      <aside className="tl-matrix-legend">
        <h3 className="tl-matrix-legend-title">{t('timeline.matrix.legendTitle')}</h3>
        <p className="tl-matrix-legend-desc">{t('timeline.matrix.legendDesc')}</p>
        <ul className="tl-matrix-legend-list">
          <li>
            <span className="tl-legend-dot kernel" /> {t('timeline.legend.kernel')}
          </li>
          <li>
            <span className="tl-legend-dot unanalyzed" /> {t('timeline.legend.unanalyzed')}
          </li>
          <li>
            <span className="tl-legend-dot outlier" />{' '}
            {t('timeline.legend.outlier', { n: outlierCount })}
          </li>
          <li>
            <span className="tl-legend-line" /> {t('timeline.matrix.diagonalLabel')}
          </li>
        </ul>
        <p className="tl-matrix-legend-foot">{t('timeline.matrix.legendFoot')}</p>
      </aside>
    </div>
  );
}
