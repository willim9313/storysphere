// Hero's Journey — the four layout variants' charts (band / track / columns / ring).
//
// Each draws chart + legend only. The selected stage and its detail panel are
// owned by HeroJourneySection, so switching layout keeps the selection and the
// detail sits in the same sticky column everywhere.
import { useEffect, useMemo, useRef, useState } from 'react';
import { useTranslation } from 'react-i18next';
import type { HeroJourneyStage } from '@/api/narrative';
import type { StageTheory } from './heroJourney';
import { PHASES, formatChapters, groupByPhase, sortStages, stageOrdinal, stagePhase, stageState } from './heroJourney';
import { Legend, StageDot, StateBadge } from './atoms';
import { Tooltip } from '@/components/ui/Tooltip';
import {
  chapterRuns,
  lastStageChapter,
  reversedStageIds,
  sharedChapters,
  stagesPerChapter,
} from './narrativeModel';

export interface VizProps {
  /** Canonical-ordered, padded to 12. */
  stages: HeroJourneyStage[];
  theory: Record<string, StageTheory>;
  sel: string;
  onSelect: (stageId: string) => void;
  chapterCount: number;
  /** Chapter of each kernel event, one entry per event — drives the band's density row. */
  kernelChapters: number[];
}

const nameOf = (s: HeroJourneyStage, theory: Record<string, StageTheory>) => theory[s.stage_id]?.name ?? s.stage_name;

// Measured, not assumed: the chapter axis always spans the whole book, so how
// much room each chapter gets depends on the book. Guards key off real pixel
// width rather than a chapter-count threshold.
function useMeasuredWidth<T extends HTMLElement>() {
  const ref = useRef<T>(null);
  const [width, setWidth] = useState(0);
  useEffect(() => {
    const el = ref.current;
    if (!el) return;
    const ro = new ResizeObserver(([entry]) => setWidth(entry.contentRect.width));
    ro.observe(el);
    return () => ro.disconnect();
  }, []);
  return [ref, width] as const;
}

// ════════════════════════════════════════════════════════════
// Chapter-alignment band — a stage is drawn only on the chapters it really
// has. 1、2、5、8 is three blocks joined by a thin line, never 1–8.
// ════════════════════════════════════════════════════════════
export function LayoutBand({ stages, theory, sel, onSelect, chapterCount, kernelChapters }: VizProps) {
  const { i18n, t } = useTranslation('analysis');
  const sorted = useMemo(() => sortStages(stages), [stages]);
  const [axisRef, axisW] = useMeasuredWidth<HTMLDivElement>();

  // The axis is the whole book. Chapters with nothing in them stay blank rather
  // than being dropped.
  const N = Math.max(chapterCount, lastStageChapter(sorted), 1);
  const labelW = i18n.language.startsWith('zh') ? 190 : 238;
  // The ref sits on the first chapter tick, so its width is one column's width.
  const colW = axisW;

  const perChapter = useMemo(() => stagesPerChapter(sorted, N), [sorted, N]);
  const shared = useMemo(() => sharedChapters(perChapter), [perChapter]);
  const reversed = useMemo(() => reversedStageIds(sorted), [sorted]);
  const kernels = useMemo(() => {
    const per = Array.from({ length: N }, () => 0);
    for (const ch of kernelChapters) if (ch >= 1 && ch <= N) per[ch - 1] += 1;
    return per;
  }, [kernelChapters, N]);
  const maxKernel = Math.max(1, ...kernels);

  // Guards keyed off measured width, never off chapter count.
  const headStep = colW >= 18 ? 1 : colW >= 9 ? 5 : 10;
  const showBarLabel = (span: number) => colW * span >= 34;

  const gridStyle = { gridTemplateColumns: `${labelW}px repeat(${N}, minmax(0, 1fr))` };
  const chapters = Array.from({ length: N }, (_, i) => i + 1);

  return (
    <div className="nl-band">
      <div className="nl-band-grid nl-band-headrow" style={gridStyle}>
        <span className="nl-band-head">{t('narrative.band.head')}</span>
        {chapters.map((c) => (
          <div key={c} className="nl-band-tick" ref={c === 1 ? axisRef : undefined}>
            <span className={shared.has(c) ? 'nl-band-tick-n is-shared' : 'nl-band-tick-n'}>
              {c % headStep === 0 || headStep === 1 ? c : ''}
            </span>
            {/* The tag needs a whole word's worth of column; the tint in the
                lanes below carries the same signal without it. */}
            <span className="nl-band-tick-tag" style={{ visibility: shared.has(c) && headStep === 1 ? 'visible' : 'hidden' }}>
              {t('narrative.band.overlapTag')}
            </span>
          </div>
        ))}
      </div>

      {sorted.map((stage) => {
        const st = stageState(stage);
        const on = sel === stage.stage_id;
        const runs = chapterRuns(stage.chapter_range);
        return (
          <div key={stage.stage_id} className="nl-band-grid" style={gridStyle}>
            <button
              type="button"
              className={on ? 'nl-band-label is-selected' : 'nl-band-label'}
              aria-pressed={on}
              onClick={() => onSelect(stage.stage_id)}
            >
              {reversed.has(stage.stage_id) && (
                <Tooltip label={t('narrative.band.reversedTip')}>
                  <span className="nl-band-rev">↰</span>
                </Tooltip>
              )}
              <span className="nl-band-n">{stageOrdinal(stage.stage_id)}</span>
              <span className={st === 'absent' ? 'nl-band-name is-absent' : 'nl-band-name'}>{nameOf(stage, theory)}</span>
            </button>
            <div
              className={on ? 'nl-band-lane is-selected' : 'nl-band-lane'}
              style={{ gridColumn: `2 / ${N + 2}`, gridTemplateColumns: `repeat(${N}, minmax(0, 1fr))` }}
              onClick={() => onSelect(stage.stage_id)}
              role="presentation"
            >
              {chapters.map((c) => (
                <span
                  key={c}
                  className={shared.has(c) ? 'nl-band-cell is-shared' : 'nl-band-cell'}
                  style={{ gridColumn: `${c} / ${c + 1}` }}
                />
              ))}
              {st === 'absent' ? (
                <span className="nl-band-absent" style={{ gridColumn: `1 / ${N + 1}` }}>
                  {t('narrative.band.absentLane')}
                </span>
              ) : (
                <>
                  {runs.length > 1 && (
                    <span
                      className="nl-band-join"
                      style={{ gridColumn: `${runs[0][0]} / ${runs[runs.length - 1][1] + 1}` }}
                    />
                  )}
                  {runs.map(([a, b]) => (
                    <span key={a} className="nl-band-run" style={{ gridColumn: `${a} / ${b + 1}` }}>
                      <Tooltip label={formatChapters(stage.chapter_range, t)}>
                        <span className={st === 'low' ? 'nl-band-bar is-low' : 'nl-band-bar'}>
                          {showBarLabel(b - a + 1) && (a === b ? a : `${a}–${b}`)}
                        </span>
                      </Tooltip>
                    </span>
                  ))}
                </>
              )}
            </div>
          </div>
        );
      })}

      {/* where the kernel events actually are, on the same axis */}
      {kernelChapters.length > 0 && (
        <div className="nl-band-grid nl-band-densityrow" style={gridStyle}>
          <span className="nl-band-head">{t('narrative.band.density')}</span>
          {chapters.map((c) => {
            const k = kernels[c - 1];
            return (
              <Tooltip key={c} label={t('narrative.band.densityTip', { ch: c, count: k })}>
                <span
                  className={k ? 'nl-band-dens' : 'nl-band-dens is-empty'}
                  style={{ height: k ? `${Math.max(8, Math.round((k / maxKernel) * 100))}%` : undefined }}
                />
              </Tooltip>
            );
          })}
        </div>
      )}

      <p className="nl-band-note">
        {t('narrative.band.axisNote', { n: N })} {t('narrative.band.markNote')}
      </p>
      <Legend />
    </div>
  );
}

// ════════════════════════════════════════════════════════════
// Horizontal track — twelve equal columns; names may take two lines.
// ════════════════════════════════════════════════════════════
export function LayoutTrack({ stages, theory, sel, onSelect }: VizProps) {
  const { t } = useTranslation('analysis');
  const sorted = useMemo(() => sortStages(stages), [stages]);
  const groups = useMemo(() => groupByPhase(sorted), [sorted]);
  const cols = `repeat(${sorted.length || 12}, minmax(0, 1fr))`;
  const spans = PHASES.map((phase, i) => {
    const before = PHASES.slice(0, i).reduce((sum, p) => sum + groups[p].length, 0);
    return { phase, from: before + 1, to: before + 1 + groups[phase].length };
  });

  return (
    <div className="nl-track">
      <div className="nl-track-phases" style={{ gridTemplateColumns: cols }}>
        {spans.map((s) =>
          s.to > s.from ? (
            <div key={s.phase} className="nl-track-phase" style={{ gridColumn: `${s.from} / ${s.to}` }}>
              <span className="nl-track-phase-t">{t(`narrative.phase.${s.phase}`)}</span>
              <span className="nl-track-phase-l" />
            </div>
          ) : null,
        )}
      </div>
      <div className="nl-track-dots" style={{ gridTemplateColumns: cols }}>
        <span className="nl-track-line" />
        {sorted.map((stage) => {
          const on = sel === stage.stage_id;
          return (
            <div key={stage.stage_id} className="nl-track-col">
              <StageDot stage={stage} selected={on} onSelect={() => onSelect(stage.stage_id)} size={40} />
              <span className={on ? 'nl-track-name is-selected' : 'nl-track-name'}>{nameOf(stage, theory)}</span>
              <span className="nl-track-ch">
                {stageState(stage) === 'absent' ? t('narrative.state.absent') : formatChapters(stage.chapter_range, t)}
              </span>
            </div>
          );
        })}
      </div>
      <Legend />
    </div>
  );
}

// ════════════════════════════════════════════════════════════
// Three-phase columns — the stage name owns its line; chapters and the
// identification state drop to a second line.
// ════════════════════════════════════════════════════════════
export function LayoutColumns({ stages, theory, sel, onSelect }: VizProps) {
  const { t } = useTranslation('analysis');
  const sorted = useMemo(() => sortStages(stages), [stages]);
  const groups = useMemo(() => groupByPhase(sorted), [sorted]);

  return (
    <div className="nl-cols-wrap">
      <div className="nl-cols">
        {PHASES.map((phase) => (
          <div key={phase} className="nl-col">
            <div className="nl-col-head">
              <span className="nl-col-head-t">{t(`narrative.phase.${phase}`)}</span>
              <span className="nl-col-head-n">{groups[phase].length}</span>
            </div>
            {groups[phase].map((stage) => {
              const on = sel === stage.stage_id;
              return (
                <div
                  key={stage.stage_id}
                  className={on ? 'nl-col-card is-selected' : 'nl-col-card'}
                  // Mouse convenience only — the dot inside is the focusable control.
                  onClick={() => onSelect(stage.stage_id)}
                  role="presentation"
                >
                  <div className="nl-col-line1">
                    <StageDot stage={stage} selected={false} onSelect={() => onSelect(stage.stage_id)} size={26} />
                    <span className="nl-col-name">{nameOf(stage, theory)}</span>
                  </div>
                  <div className="nl-col-line2">
                    <span className="nl-col-ch">{formatChapters(stage.chapter_range, t)}</span>
                    <StateBadge stage={stage} />
                  </div>
                </div>
              );
            })}
          </div>
        ))}
      </div>
      <Legend />
    </div>
  );
}

// ════════════════════════════════════════════════════════════
// Ring — navigation only. The centre keeps the selected stage's name; the
// detail lives in the sticky column beside it.
// ════════════════════════════════════════════════════════════
export function LayoutRing({ stages, theory, sel, onSelect }: VizProps) {
  const { t } = useTranslation('analysis');
  const sorted = useMemo(() => sortStages(stages), [stages]);
  const groups = useMemo(() => groupByPhase(sorted), [sorted]);
  const selStage = sorted.find((s) => s.stage_id === sel) ?? sorted[0];

  // Fixed pixel geometry: a ring has to be a circle at any viewport.
  const R = 170;
  const C = 210;
  const D = 40;
  const n = sorted.length || 1;
  const angle = (i: number) => (i / n) * Math.PI * 2 - Math.PI / 2;

  // Phase labels sit outside the ring at the middle of each phase's arc.
  const labels = PHASES.map((phase, i) => {
    const count = groups[phase].length;
    const offset = PHASES.slice(0, i).reduce((sum, p) => sum + groups[p].length, 0);
    const mid = offset + (count - 1) / 2;
    const a = angle(mid);
    return { phase, count, x: C + (R + 44) * Math.cos(a), y: C + (R + 44) * Math.sin(a) };
  });

  return (
    <div className="nl-ring-wrap">
      <div className="nl-ring" style={{ width: C * 2, height: C * 2 }}>
        <span
          className="nl-ring-orbit"
          style={{ left: C - R, top: C - R, width: R * 2, height: R * 2 }}
        />
        {selStage && (
          <div className="nl-ring-center">
            <span className="nl-ring-center-k">
              {t(`narrative.phase.${stagePhase(selStage.stage_id)}`)} · {stageOrdinal(selStage.stage_id)}
            </span>
            <span className="nl-ring-center-n">{nameOf(selStage, theory)}</span>
          </div>
        )}
        {labels.map((l) =>
          l.count ? (
            <span key={l.phase} className="nl-ring-phase" style={{ left: l.x, top: l.y }}>
              {t(`narrative.phase.${l.phase}`)}
            </span>
          ) : null,
        )}
        {sorted.map((stage, i) => (
          <span
            key={stage.stage_id}
            className="nl-ring-node"
            style={{ left: C + R * Math.cos(angle(i)) - D / 2, top: C + R * Math.sin(angle(i)) - D / 2 }}
          >
            <StageDot
              stage={stage}
              selected={sel === stage.stage_id}
              onSelect={() => onSelect(stage.stage_id)}
              size={D}
              tooltip={nameOf(stage, theory)}
            />
          </span>
        ))}
      </div>
      <Legend />
    </div>
  );
}
