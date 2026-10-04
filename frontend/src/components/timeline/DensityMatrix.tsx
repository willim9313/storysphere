/**
 * 密度矩陣 — the second way to draw 對照故事時序 (5-5).
 *
 * X = chapter (Sjuzhet), Y = `chronologicalRank` decile (Fabula, top row =
 * 91–100%). Each cell is the *count* of events in it, written inside the cell
 * (the number is the only source of magnitude — Ink reads it as greyscale +
 * digit). Diagonal cells carry a heavy frame: told in story order.
 *
 * Clicking a cell filters: the events in it are listed below as action rows,
 * dot colour = the front-end derived narrative mode (same as the detail
 * panel). Zero cost; selection is local and resets when the view is left.
 *
 * It never says "倒敘 n 筆" — that is a displacement verdict (spends tokens),
 * this is only the geometric difference of two rankings.
 */

import { useState, type ReactNode } from 'react';
import { useTranslation } from 'react-i18next';
import type { TimelineDatum } from '@/lib/timelineGeometry';
import {
  RANK_BUCKETS,
  bucketRange,
  buildMatrix,
  cellKey,
  densityStep,
  isDiagonal,
} from './matrixModel';

interface DensityMatrixProps {
  /** Events after the filter's "only" mode; dim mode keeps them and dims rows. */
  data: TimelineDatum[];
  /** Column set — every chapter of the book, so a filter never moves columns. */
  chapters: number[];
  dimmedIds: Set<string>;
  selectedEventId: string | null;
  onSelectEvent: (d: TimelineDatum) => void;
}

const STEPS = [1, 2, 3, 4] as const;

export function DensityMatrix({
  data,
  chapters,
  dimmedIds,
  selectedEventId,
  onSelectEvent,
}: DensityMatrixProps) {
  const { t } = useTranslation('analysis');
  const [sel, setSel] = useState<string | null>(null);

  const { cells, unranked } = buildMatrix(data);
  // A filter can empty the selected cell; treat that as nothing selected.
  const selKey = sel && cells.has(sel) ? sel : null;
  const selEvents = selKey ? (cells.get(selKey) ?? []) : [];
  const [selChapter, selBucket] = selKey ? selKey.split(':').map(Number) : [0, 0];
  const selRange = bucketRange(selBucket);

  const rows = Array.from({ length: RANK_BUCKETS }, (_, i) => RANK_BUCKETS - 1 - i);

  return (
    <div className="tl-mx">
      <div className="tl-mx-scroll">
        <div
          className="tl-mx-grid"
          style={{ gridTemplateColumns: `24px 64px repeat(${chapters.length}, minmax(22px, 1fr))` }}
        >
          <div className="tl-mx-ylabel" style={{ gridRow: `span ${RANK_BUCKETS + 1}` }}>
            <span>{t('timeline.matrix.yAxisLabel')}</span>
          </div>
          {rows.map((b) => {
            const { from, to } = bucketRange(b);
            return (
              <MatrixRow key={b} label={`${from}–${to}%`}>
                {chapters.map((ch, ci) => {
                  const k = cellKey(ch, b);
                  const n = cells.get(k)?.length ?? 0;
                  const step = densityStep(n);
                  const isSel = k === selKey;
                  const cls = [
                    'tl-mx-cell',
                    step ? `is-step-${step}` : '',
                    isDiagonal(ci, chapters.length, b) ? 'is-diagonal' : '',
                    isSel ? 'is-selected' : '',
                  ]
                    .filter(Boolean)
                    .join(' ');
                  return (
                    <button
                      type="button"
                      key={k}
                      className={cls}
                      disabled={n === 0}
                      aria-pressed={n === 0 ? undefined : isSel}
                      aria-label={
                        n === 0
                          ? undefined
                          : t('timeline.matrix.cellTitle', { ch, from, to, n })
                      }
                      onClick={() => setSel(isSel ? null : k)}
                    >
                      {n || ''}
                    </button>
                  );
                })}
              </MatrixRow>
            );
          })}
          <span />
          {chapters.map((ch) => (
            <span key={ch} className="tl-mx-xtick">
              {ch}
            </span>
          ))}
        </div>
      </div>

      <div className="tl-mx-axis">
        <span>{t('timeline.matrix.xAxisLabel')}</span>
        <span className="tl-mx-diag-key">
          <span className="tl-mx-diag-swatch" aria-hidden="true" />
          {t('timeline.matrix.diagonalLabel')}
        </span>
      </div>

      {unranked > 0 && (
        <div className="tl-mx-unranked">
          <span>{t('timeline.matrix.unrankedBand', { n: unranked })}</span>
          <span className="tl-mx-note">{t('timeline.matrix.unsortedNote')}</span>
        </div>
      )}

      <div className="tl-mx-legend">
        <span className="tl-mx-note">{t('timeline.matrix.cellsLegend')}</span>
        {STEPS.map((s) => (
          <span key={s} className="tl-mx-legend-item">
            <span className={`tl-mx-swatch is-step-${s}`} aria-hidden="true" />
            {s === 4 ? t('timeline.matrix.legendFourPlus') : s}
          </span>
        ))}
        <span className="tl-mx-note">{t('timeline.matrix.scaleNote')}</span>
      </div>

      <div className="tl-mx-sel">
        <div className="tl-mx-sel-head">
          <span className="tl-mx-sel-title">
            {selKey
              ? t('timeline.matrix.cellTitle', {
                  ch: selChapter,
                  from: selRange.from,
                  to: selRange.to,
                  n: selEvents.length,
                })
              : t('timeline.matrix.selectedTitle')}
          </span>
          {selKey && (
            <button
              type="button"
              className="ss-btn ss-btn-sm ss-btn-ghost"
              onClick={() => setSel(null)}
            >
              {t('timeline.matrix.clearSelection')}
            </button>
          )}
        </div>
        {selEvents.map((d) => {
          const modeLabel = t(`timeline.narrativeModes.${d.mode}`);
          return (
            <button
              type="button"
              key={d.id}
              className={[
                'tl-mx-event',
                d.id === selectedEventId ? 'is-selected' : '',
                dimmedIds.has(d.id) ? 'is-dim' : '',
              ]
                .filter(Boolean)
                .join(' ')}
              onClick={() => onSelectEvent(d)}
            >
              <span className={`tl-mx-dot is-${d.mode}`} role="img" aria-label={modeLabel} />
              <span className="tl-mx-event-title">{d.title}</span>
              <span className="tl-mx-event-meta">
                Ch.{d.chapter} · rank {Math.round((d.chronologicalRank ?? 0) * 100)}%
              </span>
              <span />
            </button>
          );
        })}
        {!selKey && <span className="tl-mx-note">{t('timeline.matrix.emptyHint')}</span>}
      </div>
    </div>
  );
}

function MatrixRow({ label, children }: { label: string; children: ReactNode }) {
  return (
    <>
      <span className="tl-mx-ylabel-tick">{label}</span>
      {children}
    </>
  );
}
