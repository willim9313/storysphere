// Hero's Journey — four layout variants (A track / B columns / C ring / D band).
// Each manages its own selected stage and renders viz + legend + detail.
import { useEffect, useMemo, useRef, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { AlertTriangle } from 'lucide-react';
import type { HeroJourneyStage } from '@/api/narrative';
import type { StageTheory } from './heroJourney';
import {
  PHASES,
  formatChapters,
  groupByPhase,
  phaseWash,
  sortStages,
  stageOrdinal,
  stageState,
} from './heroJourney';
import { Legend, StageDisc, StateBadge } from './atoms';
import { StageDetail, type EventInfo } from './StageDetail';

export interface LayoutProps {
  stages: HeroJourneyStage[];
  theory: Record<string, StageTheory>;
  events: Record<string, EventInfo>;
  chapterCount: number;
  /** Chapter of each kernel event, one entry per event — drives the band's density row. */
  kernelChapters?: number[];
}

function useStageData(stages: HeroJourneyStage[]) {
  return useMemo(() => {
    const sorted = sortStages(stages);
    const byId: Record<string, HeroJourneyStage> = {};
    for (const s of sorted) byId[s.stage_id] = s;
    return { sorted, byId, groups: groupByPhase(sorted) };
  }, [stages]);
}

// Measured, not assumed: the chapter axis always spans the whole book, so how
// much room each chapter gets depends on the book. Guards below key off the
// real pixel width rather than a chapter-count threshold, which would be a
// guess — the library has only two books to generalise from.
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

const drawer: React.CSSProperties = {
  flex: 1,
  minHeight: 0,
  background: 'var(--bg-secondary)',
  borderWidth: 'var(--border-width)',
  borderStyle: 'var(--border-style)',
  borderColor: 'var(--border)',
  borderRadius: 'var(--radius-lg)',
  padding: 20,
  overflowY: 'auto',
};

// ════════════════════════════════════════════════════════════
// LAYOUT A — Horizontal journey track
// ════════════════════════════════════════════════════════════
export function LayoutTrack({ stages, theory, events }: LayoutProps) {
  const { t } = useTranslation('analysis');
  const { sorted, byId, groups } = useStageData(stages);
  const [sel, setSel] = useState(sorted[0]?.stage_id);
  const selStage = byId[sel] ?? sorted[0];

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 18, flex: 1, minHeight: 0 }}>
      {/* phase bands */}
      <div style={{ display: 'flex', gap: 18, paddingTop: 4 }}>
        {PHASES.map((phase) => (
          <div key={phase} style={{ flex: groups[phase].length || 1, display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 4 }}>
            <span style={{ fontFamily: 'var(--font-sans)', fontSize: 'var(--font-size-2xs)', fontWeight: 700, letterSpacing: '0.1em', textTransform: 'uppercase', color: 'var(--accent)' }}>
              {t(`narrative.phase.${phase}`)}
            </span>
            <div style={{ width: '78%', height: 3, borderRadius: 2, background: phaseWash(phase, true) }} />
          </div>
        ))}
      </div>

      {/* track */}
      <div style={{ position: 'relative', display: 'flex', gap: 18 }}>
        <div style={{ position: 'absolute', top: 23, left: '4%', right: '4%', height: 2, background: 'var(--border)' }} />
        {PHASES.map((phase) => (
          <div key={phase} style={{ flex: groups[phase].length || 1, display: 'flex', justifyContent: 'space-around', position: 'relative' }}>
            {groups[phase].map((stage) => (
              <div key={stage.stage_id} style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 8, width: 96 }}>
                <StageDisc
                  stage={stage}
                  selected={sel === stage.stage_id}
                  onClick={() => setSel(stage.stage_id)}
                  title={theory[stage.stage_id]?.name ?? stage.stage_name}
                />
                <div style={{ textAlign: 'center', display: 'flex', flexDirection: 'column', gap: 2 }}>
                  <span style={{ fontFamily: 'var(--font-serif)', fontSize: 'var(--font-size-xs)', fontWeight: 600, lineHeight: 1.25, color: sel === stage.stage_id ? 'var(--accent)' : 'var(--fg-primary)' }}>
                    {theory[stage.stage_id]?.name ?? stage.stage_name}
                  </span>
                  <span style={{ fontFamily: 'var(--font-mono)', fontSize: 'var(--font-size-2xs)', color: 'var(--fg-muted)' }}>
                    {stage.chapter_range.length ? formatChapters(stage.chapter_range, t) : t('narrative.state.absent')}
                  </span>
                </div>
              </div>
            ))}
          </div>
        ))}
      </div>

      <Legend />

      <div style={{ ...drawer, marginTop: 2 }}>{selStage && <StageDetail stage={selStage} theory={theory} events={events} />}</div>
    </div>
  );
}

// ════════════════════════════════════════════════════════════
// LAYOUT B — Three-phase columns + right detail panel
// ════════════════════════════════════════════════════════════
export function LayoutColumns({ stages, theory, events }: LayoutProps) {
  const { t } = useTranslation('analysis');
  const { sorted, byId, groups } = useStageData(stages);
  const initiation = groups.initiation[0]?.stage_id;
  const [sel, setSel] = useState(initiation ?? sorted[0]?.stage_id);
  const selStage = byId[sel] ?? sorted[0];

  const Row = ({ stage }: { stage: HeroJourneyStage }) => {
    const st = stageState(stage);
    const active = sel === stage.stage_id;
    return (
      <div
        role="button"
        onClick={() => setSel(stage.stage_id)}
        style={{
          display: 'flex',
          alignItems: 'center',
          gap: 10,
          width: '100%',
          textAlign: 'left',
          cursor: 'pointer',
          padding: '9px 10px',
          borderRadius: 'var(--radius-md)',
          borderWidth: 'var(--border-width)',
          borderStyle: 'var(--border-style)',
          borderColor: active ? 'var(--accent)' : 'var(--border)',
          background: active ? 'var(--bg-tertiary)' : 'var(--bg-primary)',
          opacity: st === 'absent' ? 0.7 : 1,
          transition: 'background-color var(--transition-fast), border-color var(--transition-fast)',
        }}
      >
        <StageDisc stage={stage} selected={false} size={32} onClick={() => setSel(stage.stage_id)} />
        <span style={{ flex: 1, minWidth: 0 }}>
          <span style={{ display: 'block', fontFamily: 'var(--font-serif)', fontSize: 'var(--font-size-sm)', fontWeight: 600, color: 'var(--fg-primary)', lineHeight: 1.25 }}>
            {theory[stage.stage_id]?.name ?? stage.stage_name}
          </span>
          <span style={{ fontFamily: 'var(--font-mono)', fontSize: 'var(--font-size-2xs)', color: 'var(--fg-muted)' }}>{formatChapters(stage.chapter_range, t)}</span>
        </span>
        <StateBadge stage={stage} size="sm" />
      </div>
    );
  };

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 18, flex: 1, minHeight: 0 }}>
      <div style={{ flex: 1, minHeight: 0, display: 'flex', gap: 18 }}>
        <div style={{ flex: '1 1 0', display: 'flex', gap: 14, overflowY: 'auto', paddingRight: 2 }}>
          {PHASES.map((phase) => (
            <div key={phase} style={{ flex: 1, display: 'flex', flexDirection: 'column', minWidth: 0 }}>
              <div
                style={{
                  padding: '8px 12px',
                  borderRadius: 'var(--radius-md)',
                  background: phaseWash(phase, true),
                  marginBottom: 10,
                  display: 'flex',
                  alignItems: 'baseline',
                  justifyContent: 'space-between',
                }}
              >
                <span style={{ fontFamily: 'var(--font-sans)', fontSize: 'var(--font-size-xs)', fontWeight: 700, letterSpacing: '0.08em', textTransform: 'uppercase', color: 'var(--accent)' }}>
                  {t(`narrative.phase.${phase}`)}
                </span>
                <span style={{ fontFamily: 'var(--font-mono)', fontSize: 'var(--font-size-2xs)', color: 'var(--fg-secondary)' }}>{groups[phase].length}</span>
              </div>
              <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
                {groups[phase].map((stage) => (
                  <Row key={stage.stage_id} stage={stage} />
                ))}
              </div>
            </div>
          ))}
        </div>
        <div style={{ width: 360, flexShrink: 0, ...drawer }}>{selStage && <StageDetail stage={selStage} theory={theory} events={events} compact />}</div>
      </div>
      <Legend />
    </div>
  );
}

// ════════════════════════════════════════════════════════════
// LAYOUT C — Circular monomyth ring (detail in centre)
// ════════════════════════════════════════════════════════════
export function LayoutRing({ stages, theory, events }: LayoutProps) {
  const { t } = useTranslation('analysis');
  const { sorted, byId, groups } = useStageData(stages);
  const ordeal = sorted.find((s) => s.stage_id === 'ordeal')?.stage_id;
  const [sel, setSel] = useState(ordeal ?? sorted[Math.floor(sorted.length / 2)]?.stage_id);
  const selStage = byId[sel] ?? sorted[0];

  const R = 280;
  const cx = 360;
  const cy = 360;
  const nodeR = 23;
  const n = sorted.length || 1;
  const pos = (stageId: string) => {
    const i = sorted.findIndex((s) => s.stage_id === stageId);
    const ang = ((-90 + (360 / n) * i) * Math.PI) / 180; // start top, clockwise
    return { x: cx + R * Math.cos(ang), y: cy + R * Math.sin(ang), ang };
  };

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 12, flex: 1, minHeight: 0 }}>
      <div style={{ flex: 1, minHeight: 760, position: 'relative' }}>
        <div style={{ position: 'absolute', left: '50%', top: '50%', transform: 'translate(-50%,-50%)', width: 720, height: 720 }}>
          <svg width="720" height="720" style={{ position: 'absolute', inset: 0 }}>
            <circle cx={cx} cy={cy} r={R} fill="none" stroke="var(--border)" strokeWidth="2" strokeDasharray="2 6" />
            <line x1={cx - R - 8} y1={cy} x2={cx + R + 8} y2={cy} stroke="var(--border)" strokeWidth="1" strokeDasharray="4 6" />
            <text x={cx - R - 2} y={cy - 10} fontFamily="var(--font-sans)" fontSize="10.5" fill="var(--fg-muted)" letterSpacing="0.08em">
              {t('narrative.ring.knownWorld')}
            </text>
            <text x={cx - R - 2} y={cy + 20} fontFamily="var(--font-sans)" fontSize="10.5" fill="var(--fg-muted)" letterSpacing="0.08em">
              {t('narrative.ring.specialWorld')}
            </text>
          </svg>

          {/* phase arc labels */}
          {PHASES.map((phase) => {
            const ids = groups[phase];
            if (!ids.length) return null;
            const mid = ids[Math.floor(ids.length / 2)];
            const p = pos(mid.stage_id);
            const lx = cx + (R + 52) * Math.cos(p.ang);
            const ly = cy + (R + 52) * Math.sin(p.ang);
            return (
              <span
                key={phase}
                style={{
                  position: 'absolute',
                  left: lx,
                  top: ly,
                  transform: 'translate(-50%,-50%)',
                  fontFamily: 'var(--font-sans)',
                  fontSize: 'var(--font-size-2xs)',
                  fontWeight: 700,
                  letterSpacing: '0.1em',
                  textTransform: 'uppercase',
                  color: 'var(--accent)',
                  whiteSpace: 'nowrap',
                  pointerEvents: 'none',
                }}
              >
                {t(`narrative.phase.${phase}`)}
              </span>
            );
          })}

          {/* nodes */}
          {sorted.map((stage) => {
            const p = pos(stage.stage_id);
            return (
              <div key={stage.stage_id} style={{ position: 'absolute', left: p.x, top: p.y, transform: 'translate(-50%,-50%)' }}>
                <StageDisc
                  stage={stage}
                  selected={sel === stage.stage_id}
                  onClick={() => setSel(stage.stage_id)}
                  size={2 * nodeR}
                  title={theory[stage.stage_id]?.name ?? stage.stage_name}
                />
              </div>
            );
          })}

          {/* centre detail */}
          <div
            style={{
              position: 'absolute',
              left: cx,
              top: cy,
              transform: 'translate(-50%,-50%)',
              width: 2 * (R - 64),
              height: 2 * (R - 64),
              borderRadius: '50%',
              background: 'var(--bg-secondary)',
              borderWidth: 'var(--border-width)',
              borderStyle: 'var(--border-style)',
              borderColor: 'var(--border)',
              padding: '30px 44px',
              overflowY: 'auto',
              display: 'flex',
              flexDirection: 'column',
              justifyContent: 'center',
            }}
          >
            {selStage && <StageDetail stage={selStage} theory={theory} events={events} compact />}
          </div>
        </div>
      </div>
      <Legend />
    </div>
  );
}

// ════════════════════════════════════════════════════════════
// LAYOUT D — Chapter-alignment band (gantt; shows overlap + reversal)
// ════════════════════════════════════════════════════════════
export function LayoutBand({ stages, theory, events, chapterCount, kernelChapters = [] }: LayoutProps) {
  const { i18n, t } = useTranslation('analysis');
  const { sorted, byId } = useStageData(stages);
  const ordeal = sorted.find((s) => s.stage_id === 'ordeal')?.stage_id;
  const [sel, setSel] = useState(ordeal ?? sorted[0]?.stage_id);
  const selStage = byId[sel] ?? sorted[0];
  const [axisRef, axisW] = useMeasuredWidth<HTMLDivElement>();

  // The axis is the whole book. Chapters with nothing in them stay blank rather
  // than being dropped, so a stage at ch10 and events stopping at ch9 read as
  // the same fact they are.
  const N = Math.max(
    chapterCount,
    sorted.reduce((m, s) => Math.max(m, s.chapter_range[s.chapter_range.length - 1] ?? 0), 1),
    1,
  );
  const colW = axisW ? axisW / N : 0;
  const labelW = i18n.language.startsWith('zh') ? 186 : 238;

  const chapters = useMemo(() => {
    const kernelPerChapter: Record<number, number> = {};
    for (const ch of kernelChapters) kernelPerChapter[ch] = (kernelPerChapter[ch] ?? 0) + 1;
    const maxKernel = Math.max(1, ...Object.values(kernelPerChapter));
    return Array.from({ length: N }, (_, i) => {
      const ch = i + 1;
      const covering = sorted.filter((s) => {
        const r = s.chapter_range;
        return r.length > 0 && r[0] <= ch && r[r.length - 1] >= ch;
      }).length;
      const kernels = kernelPerChapter[ch] ?? 0;
      return {
        ch,
        covering,
        // Three or more stages on one chapter is the pattern worth flagging:
        // it means the mapping could not separate them, not that the book is dense.
        overlap: covering >= 3,
        kernels,
        densityPct: kernels ? Math.max(8, Math.round((kernels / maxKernel) * 100)) : 0,
      };
    });
  }, [sorted, N, kernelChapters]);

  // A stage that starts earlier than the stage before it — Campbell order and
  // chapter order disagreeing is a finding, not a glitch, so it gets a mark.
  const reversed = useMemo(() => {
    const out: Record<string, boolean> = {};
    let prev = 0;
    for (const s of sorted) {
      const r = s.chapter_range;
      if (!r.length) continue;
      if (prev > 0 && r[0] < prev) out[s.stage_id] = true;
      prev = r[0];
    }
    return out;
  }, [sorted]);

  // Guards keyed off measured width, never off chapter count.
  const headStep = colW >= 18 ? 1 : colW >= 9 ? 5 : 10;
  const showBarLabel = (span: number) => colW * span >= 34;

  const grid: React.CSSProperties = {
    display: 'grid',
    gridTemplateColumns: `${labelW}px minmax(0, 1fr)`,
    gap: 10,
    alignItems: 'center',
  };

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 14, flex: 1, minHeight: 0 }}>
      <div>
        {/* chapter ruler */}
        <div style={{ ...grid, marginBottom: 4 }}>
          <div className="nl-band-head">{t('narrative.band.head')}</div>
          <div ref={axisRef} className="nl-band-cols" style={{ gridTemplateColumns: `repeat(${N}, 1fr)` }}>
            {chapters.map((c) => (
              <div
                key={c.ch}
                className="nl-band-tick"
                style={{ color: c.overlap ? 'var(--fg-primary)' : 'var(--fg-muted)' }}
              >
                {c.ch % headStep === 0 || headStep === 1 ? c.ch : ''}
                {/* The tag needs a whole word's worth of column to be readable;
                    the tint on the lane below carries the same signal without it. */}
                {c.overlap && headStep === 1 && (
                  <div className="nl-band-overlap">{t('narrative.band.overlapTag')}</div>
                )}
              </div>
            ))}
          </div>
        </div>

        {/* one lane per stage */}
        {sorted.map((stage) => {
          const st = stageState(stage);
          const active = sel === stage.stage_id;
          const r = stage.chapter_range;
          const from = r.length ? r[0] : 0;
          const to = r.length ? r[r.length - 1] : 0;
          const span = to - from + 1;
          return (
            <div key={stage.stage_id} style={{ ...grid, marginBottom: 3 }}>
              <button
                type="button"
                className={active ? 'nl-band-label is-active' : 'nl-band-label'}
                onClick={() => setSel(stage.stage_id)}
              >
                <span className="nl-band-rev" title={reversed[stage.stage_id] ? t('narrative.band.reversedTip') : undefined}>
                  {reversed[stage.stage_id] ? '↰' : ''}
                </span>
                <span className="nl-band-n">{stageOrdinal(stage.stage_id)}</span>
                <span
                  className="nl-band-name"
                  style={{ color: st === 'absent' ? 'var(--fg-muted)' : 'var(--fg-primary)' }}
                >
                  {theory[stage.stage_id]?.name ?? stage.stage_name}
                </span>
              </button>
              <div
                className="nl-band-lane"
                style={{ borderColor: active ? 'var(--accent)' : 'var(--border)' }}
              >
                <div className="nl-band-cols" style={{ position: 'absolute', inset: 0, gridTemplateColumns: `repeat(${N}, 1fr)`, gap: 0 }}>
                  {chapters.map((c) => (
                    <div
                      key={c.ch}
                      style={{
                        borderRight: '1px solid var(--bg-tertiary)',
                        background: c.overlap ? 'var(--bg-secondary)' : 'transparent',
                      }}
                    />
                  ))}
                </div>
                {st === 'absent' ? (
                  <div className="nl-band-absent">{t('narrative.band.absentLane')}</div>
                ) : (
                  <button
                    type="button"
                    className="nl-band-bar"
                    title={formatChapters(stage.chapter_range, t)}
                    onClick={() => setSel(stage.stage_id)}
                    style={{
                      left: `${((from - 1) / N) * 100}%`,
                      width: `${(span / N) * 100}%`,
                      background: st === 'low' ? 'var(--color-warning)' : 'var(--accent)',
                      boxShadow: active ? '0 0 0 2px var(--timeline-selected-ring)' : 'none',
                    }}
                  >
                    {showBarLabel(span) && (from === to ? `${from}` : `${from}–${to}`)}
                    {st === 'low' && <AlertTriangle size={11} />}
                  </button>
                )}
              </div>
            </div>
          );
        })}

        {/* where the kernel events actually are, on the same axis */}
        {kernelChapters.length > 0 && (
          <div style={{ ...grid, marginTop: 6, alignItems: 'end' }}>
            <div className="nl-band-head">{t('narrative.band.density')}</div>
            <div className="nl-band-cols" style={{ gridTemplateColumns: `repeat(${N}, 1fr)`, alignItems: 'end', height: 26 }}>
              {chapters.map((c) => (
                <div
                  key={c.ch}
                  title={t('narrative.band.densityTip', { ch: c.ch, count: c.kernels })}
                  style={{
                    height: c.kernels ? `${c.densityPct}%` : 5,
                    background: c.kernels ? 'var(--accent)' : 'transparent',
                    border: `1px ${c.kernels ? 'solid' : 'dashed'} var(--border)`,
                    borderRadius: 2,
                  }}
                />
              ))}
            </div>
          </div>
        )}

        <p className="nl-band-note">
          {t('narrative.band.axisNote', { n: N })} {t('narrative.band.markNote')}
        </p>
      </div>

      <Legend />

      <div style={{ ...drawer, padding: 18 }}>{selStage && <StageDetail stage={selStage} theory={theory} events={events} compact />}</div>
    </div>
  );
}
