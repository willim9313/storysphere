// Hero's Journey — four layout variants (A track / B columns / C ring / D band).
// Each manages its own selected stage and renders viz + legend + detail.
import { useMemo, useState } from 'react';
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
  stagePhase,
  stageState,
  discFill,
  discText,
} from './heroJourney';
import { Legend, StageDisc, StateBadge } from './atoms';
import { StageDetail, type EventInfo } from './StageDetail';

export interface LayoutProps {
  stages: HeroJourneyStage[];
  theory: Record<string, StageTheory>;
  events: Record<string, EventInfo>;
  chapterCount: number;
}

function useStageData(stages: HeroJourneyStage[]) {
  return useMemo(() => {
    const sorted = sortStages(stages);
    const byId: Record<string, HeroJourneyStage> = {};
    for (const s of sorted) byId[s.stage_id] = s;
    return { sorted, byId, groups: groupByPhase(sorted) };
  }, [stages]);
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
            <span style={{ fontFamily: 'var(--font-sans)', fontSize: 11, fontWeight: 700, letterSpacing: '0.1em', textTransform: 'uppercase', color: 'var(--accent)' }}>
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
                  <span style={{ fontFamily: 'var(--font-serif)', fontSize: 12, fontWeight: 600, lineHeight: 1.25, color: sel === stage.stage_id ? 'var(--accent)' : 'var(--fg-primary)' }}>
                    {theory[stage.stage_id]?.name ?? stage.stage_name}
                  </span>
                  <span style={{ fontFamily: 'var(--font-mono)', fontSize: 10, color: 'var(--fg-muted)' }}>
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
          <span style={{ display: 'block', fontFamily: 'var(--font-serif)', fontSize: 13, fontWeight: 600, color: 'var(--fg-primary)', lineHeight: 1.25 }}>
            {theory[stage.stage_id]?.name ?? stage.stage_name}
          </span>
          <span style={{ fontFamily: 'var(--font-mono)', fontSize: 10, color: 'var(--fg-muted)' }}>{formatChapters(stage.chapter_range, t)}</span>
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
                <span style={{ fontFamily: 'var(--font-sans)', fontSize: 12, fontWeight: 700, letterSpacing: '0.08em', textTransform: 'uppercase', color: 'var(--accent)' }}>
                  {t(`narrative.phase.${phase}`)}
                </span>
                <span style={{ fontFamily: 'var(--font-mono)', fontSize: 11, color: 'var(--fg-secondary)' }}>{groups[phase].length}</span>
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
      <div style={{ flex: 1, minHeight: 0, position: 'relative' }}>
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
                  fontSize: 10.5,
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
// LAYOUT D — Chapter-alignment band (gantt; shows overlap + absence)
// ════════════════════════════════════════════════════════════
export function LayoutBand({ stages, theory, events, chapterCount }: LayoutProps) {
  const { t } = useTranslation('analysis');
  const { sorted, byId } = useStageData(stages);
  const ordeal = sorted.find((s) => s.stage_id === 'ordeal')?.stage_id;
  const [sel, setSel] = useState(ordeal ?? sorted[0]?.stage_id);
  const selStage = byId[sel] ?? sorted[0];

  const N = Math.max(
    chapterCount,
    sorted.reduce((m, s) => Math.max(m, s.chapter_range[s.chapter_range.length - 1] ?? 0), 1),
  );
  const labelW = 220;
  const laneH = 30;
  const laneGap = 4;

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 14, flex: 1, minHeight: 0 }}>
      <div style={{ display: 'flex', flexDirection: 'column' }}>
        {/* chapter ruler */}
        <div style={{ display: 'flex', alignItems: 'flex-end', marginBottom: 6 }}>
          <div style={{ width: labelW, flexShrink: 0, fontFamily: 'var(--font-sans)', fontSize: 10, fontWeight: 600, textTransform: 'uppercase', letterSpacing: '0.06em', color: 'var(--fg-muted)' }}>
            {t('narrative.stageColumn')}
          </div>
          <div style={{ flex: 1, display: 'flex', position: 'relative', height: 16 }}>
            {Array.from({ length: N }, (_, i) => (
              <div
                key={i}
                style={{
                  flex: 1,
                  textAlign: 'center',
                  fontFamily: 'var(--font-mono)',
                  fontSize: 9,
                  color: 'var(--fg-muted)',
                  borderLeft: i % 4 === 0 ? '1px solid var(--border)' : 'none',
                }}
              >
                {i % 4 === 0 ? i + 1 : ''}
              </div>
            ))}
          </div>
        </div>

        {/* lanes */}
        <div style={{ display: 'flex', flexDirection: 'column', gap: laneGap }}>
          {sorted.map((stage) => {
            const st = stageState(stage);
            const phase = stagePhase(stage.stage_id);
            const active = sel === stage.stage_id;
            const start = stage.chapter_range.length ? stage.chapter_range[0] : null;
            const end = stage.chapter_range.length ? stage.chapter_range[stage.chapter_range.length - 1] : null;
            const leftPct = start ? ((start - 1) / N) * 100 : 0;
            const widthPct = start && end ? ((end - start + 1) / N) * 100 : 100;
            return (
              <button
                key={stage.stage_id}
                onClick={() => setSel(stage.stage_id)}
                style={{
                  display: 'flex',
                  alignItems: 'center',
                  cursor: 'pointer',
                  textAlign: 'left',
                  padding: 0,
                  border: 'none',
                  background: active ? 'var(--bg-tertiary)' : 'transparent',
                  borderRadius: 'var(--radius-sm)',
                }}
              >
                <div style={{ width: labelW, flexShrink: 0, display: 'flex', alignItems: 'center', gap: 8, padding: '0 8px' }}>
                  <span style={{ fontFamily: 'var(--font-mono)', fontSize: 10, color: 'var(--fg-muted)', width: 16, textAlign: 'right' }}>{stageOrdinal(stage.stage_id)}</span>
                  <span
                    style={{
                      fontFamily: 'var(--font-serif)',
                      fontSize: 12,
                      fontWeight: 600,
                      lineHeight: 1.2,
                      color: active ? 'var(--accent)' : st === 'absent' ? 'var(--fg-muted)' : 'var(--fg-primary)',
                      whiteSpace: 'nowrap',
                      overflow: 'hidden',
                      textOverflow: 'ellipsis',
                    }}
                  >
                    {theory[stage.stage_id]?.name ?? stage.stage_name}
                  </span>
                </div>
                <div style={{ flex: 1, position: 'relative', height: laneH, background: phaseWash(phase, false), borderRadius: 'var(--radius-sm)', overflow: 'hidden' }}>
                  {Array.from({ length: N }, (_, i) => (
                    <div key={i} style={{ position: 'absolute', left: `${(i / N) * 100}%`, top: 0, bottom: 0, width: 1, background: i % 4 === 0 ? 'var(--border)' : 'transparent', opacity: 0.5 }} />
                  ))}
                  {st === 'absent' ? (
                    <div style={{ position: 'absolute', inset: '0 8px', display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 8 }}>
                      <div style={{ flex: 1, borderTop: '1.5px dashed var(--fg-muted)', opacity: 0.6 }} />
                      <span style={{ fontFamily: 'var(--font-sans)', fontSize: 10, color: 'var(--fg-muted)' }}>{t('narrative.state.absent')} —</span>
                      <div style={{ flex: 1, borderTop: '1.5px dashed var(--fg-muted)', opacity: 0.6 }} />
                    </div>
                  ) : (
                    <div
                      title={formatChapters(stage.chapter_range, t)}
                      style={{
                        position: 'absolute',
                        left: `${leftPct}%`,
                        width: `${widthPct}%`,
                        top: 5,
                        bottom: 5,
                        borderRadius: 5,
                        display: 'flex',
                        alignItems: 'center',
                        justifyContent: 'space-between',
                        padding: '0 8px',
                        background: discFill(stage),
                        borderWidth: 'var(--border-width)',
                        borderStyle: st === 'low' ? 'dashed' : 'var(--border-style)',
                        borderColor: st === 'low' ? 'var(--color-warning)' : 'color-mix(in oklab, var(--accent) 55%, var(--bg-primary))',
                        boxShadow: active ? '0 0 0 2px var(--timeline-selected-ring)' : 'none',
                      }}
                    >
                      <span style={{ fontFamily: 'var(--font-mono)', fontSize: 10, color: discText(stage), whiteSpace: 'nowrap' }}>
                        {start}
                        {end !== start ? `–${end}` : ''}
                      </span>
                      {st === 'low' && <AlertTriangle size={11} color={discText(stage)} />}
                    </div>
                  )}
                </div>
              </button>
            );
          })}
        </div>
      </div>

      <Legend />

      <div style={{ ...drawer, padding: 18 }}>{selStage && <StageDetail stage={selStage} theory={theory} events={events} compact />}</div>
    </div>
  );
}

