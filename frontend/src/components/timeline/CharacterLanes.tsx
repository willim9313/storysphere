/**
 * 角色軌跡泳道 — an *overlay* on the existing views, not a fourth view tab.
 *
 * This answers the open question in the plan: a separate tab would make the
 * character dimension an alternative to the timeline, when what it actually
 * adds is a second reading of the same X axis — who is present when, who
 * disappears for a stretch, and where the selected cast share a scene.
 *
 * X is the narrative index, deliberately not `chronological_rank`: rank is
 * null for a stable minority of events, and a lane with holes in it would be
 * indistinguishable from an absence.
 */

import { useTranslation } from 'react-i18next';
import { X } from 'lucide-react';
import {
  MAX_LANES,
  buildLane,
  coPresence,
  type TimelineDatum,
} from '@/lib/timelineGeometry';

interface CharacterLanesProps {
  data: TimelineDatum[];
  chapters: number[];
  selected: { id: string; name: string }[];
  available: { id: string; name: string }[];
  selectedEventId: string | null;
  onSelectEvent: (d: TimelineDatum) => void;
  onRemove: (id: string) => void;
  onAdd: (id: string) => void;
}

export function CharacterLanes({
  data,
  chapters,
  selected,
  available,
  selectedEventId,
  onSelectEvent,
  onRemove,
  onAdd,
}: CharacterLanesProps) {
  const { t } = useTranslation('analysis');

  const n = data.length;
  const lanes = selected.map((c) => buildLane(data, c.id, c.name));
  const together = coPresence(
    data,
    selected.map((c) => c.id),
  );

  // Chapter ticks align to the first event of each chapter, not to equal
  // columns — equal columns drift out of step with the dots above them.
  const ticks = chapters.map((ch) => {
    const first = data.findIndex((d) => d.chapter === ch);
    return { ch, xPct: n > 1 ? (first / (n - 1)) * 100 : 0 };
  });

  const unselected = available.filter((c) => !selected.some((s) => s.id === c.id));

  return (
    <section className="tl-lanes" aria-label={t('timeline.lanes.region')}>
      <header className="tl-lanes-head">
        <span className="tl-lanes-title">{t('timeline.lanes.title')}</span>
        {selected.map((c) => (
          <span className="tl-lanes-pill" key={c.id}>
            {c.name}
            <button
              type="button"
              className="tl-lanes-pill-x"
              onClick={() => onRemove(c.id)}
              aria-label={t('timeline.lanes.remove', { name: c.name })}
            >
              <X size={10} />
            </button>
          </span>
        ))}
        {selected.length < MAX_LANES && unselected.length > 0 && (
          <label className="tl-lanes-add">
            <span className="sr-only">{t('timeline.lanes.add', { max: MAX_LANES })}</span>
            <select
              value=""
              onChange={(e) => {
                if (e.target.value) onAdd(e.target.value);
              }}
            >
              <option value="">{t('timeline.lanes.add', { max: MAX_LANES })}</option>
              {unselected.map((c) => (
                <option key={c.id} value={c.id}>
                  {c.name}
                </option>
              ))}
            </select>
          </label>
        )}
        <span className="tl-lanes-note">{t('timeline.lanes.axisNote', { n })}</span>
      </header>

      <div className="tl-lanes-ticks">
        {ticks.map((tick) => (
          <span className="tl-lanes-tick" key={tick.ch} style={{ left: `${tick.xPct}%` }}>
            Ch.{tick.ch}
          </span>
        ))}
      </div>

      {lanes.map((lane) => (
        <div className="tl-lane" key={lane.entityId}>
          <div className="tl-lane-label">
            <span className="tl-lane-name">{lane.name}</span>
            <span className="tl-lane-meta">
              {t('timeline.lanes.meta', {
                present: lane.appearances,
                absent: lane.absent,
                longest: lane.longestAbsence,
              })}
            </span>
          </div>
          <div className="tl-lane-track">
            {lane.present.map((run, k) => (
              <span
                className="tl-lane-run"
                key={`p${k}`}
                style={{ left: `${run.x1Pct}%`, width: `${Math.max(run.widthPct, 0.3)}%` }}
              />
            ))}
            {lane.absences.map((run, k) => (
              <span
                className="tl-lane-gap"
                key={`g${k}`}
                style={{ left: `${run.x1Pct}%`, width: `${run.widthPct}%` }}
              />
            ))}
            {lane.dots.map((dot) => (
              <button
                type="button"
                key={dot.id}
                className={[
                  'tl-lane-dot',
                  dot.datum.isKernel ? 'kernel' : '',
                  dot.datum.hasAnalysis ? 'analyzed' : 'unanalyzed',
                  dot.id === selectedEventId ? 'selected' : '',
                ]
                  .filter(Boolean)
                  .join(' ')}
                style={{ left: `${dot.xPct}%` }}
                onClick={() => onSelectEvent(dot.datum)}
                title={dot.datum.title}
              >
                <span className="sr-only">{dot.datum.title}</span>
              </button>
            ))}
          </div>
          {/* Absence captions live in their own strip below the track so they
              never sit on top of the dots. */}
          <div className="tl-lane-notes">
            {lane.labelled.map((run, k) => (
              <span
                className="tl-lane-note"
                key={k}
                style={{ left: `${run.x1Pct}%`, width: `${run.widthPct}%` }}
              >
                {t(
                  run.fromOpening
                    ? 'timeline.lanes.absentOpening'
                    : 'timeline.lanes.absent',
                  {
                    range:
                      run.startChapter === run.endChapter
                        ? `Ch.${run.startChapter}`
                        : `Ch.${run.startChapter}–${run.endChapter}`,
                    n: run.length,
                  },
                )}
              </span>
            ))}
          </div>
        </div>
      ))}

      {selected.length >= 2 && (
        <div className="tl-lane tl-lane-together">
          <div className="tl-lane-label">
            <span className="tl-lane-name">{t('timeline.lanes.together')}</span>
            <span className="tl-lane-meta">
              {t('timeline.lanes.togetherMeta', { n: together.length })}
            </span>
          </div>
          <div className="tl-lane-track">
            {together.map((i) => (
              <span
                className="tl-lane-together-mark"
                key={i}
                style={{ left: `${n > 1 ? (i / (n - 1)) * 100 : 50}%` }}
              />
            ))}
          </div>
        </div>
      )}

      <ul className="tl-lanes-legend">
        <li>
          <span className="tl-legend-dot analyzed" /> {t('timeline.lanes.legendAnalyzed')}
        </li>
        <li>
          <span className="tl-legend-dot unanalyzed" /> {t('timeline.lanes.legendUnanalyzed')}
        </li>
        <li>
          <span className="tl-legend-dash" /> {t('timeline.lanes.legendAbsent')}
        </li>
        {selected.length >= 2 && (
          <li>
            <span className="tl-legend-mark" /> {t('timeline.lanes.together')}
          </li>
        )}
      </ul>
    </section>
  );
}
