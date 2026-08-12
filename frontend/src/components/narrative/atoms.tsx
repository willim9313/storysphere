// Hero's Journey — shared visual primitives.
import { useTranslation } from 'react-i18next';
import { AlertTriangle, Check, Circle, X, Sparkles } from 'lucide-react';
import type { HeroJourneyStage, NarrativeReviewStatus } from '@/api/narrative';
import { discFill, discText, stageOrdinal, stageState } from './heroJourney';

// ── State badge — filled / low-confidence / absent ─────────────────
export function StateBadge({ stage, size = 'md' }: { stage: HeroJourneyStage; size?: 'sm' | 'md' }) {
  const { t } = useTranslation('analysis');
  const st = stageState(stage);
  const sm = size === 'sm';
  const base: React.CSSProperties = {
    display: 'inline-flex',
    alignItems: 'center',
    gap: 4,
    fontFamily: 'var(--font-sans)',
    fontSize: 'var(--font-size-2xs)',
    fontWeight: 600,
    padding: sm ? '1px 7px' : '2px 9px',
    borderRadius: 20,
    lineHeight: 1.5,
    borderWidth: 'var(--border-width)',
    borderStyle: 'var(--border-style)',
  };
  if (st === 'absent') {
    return (
      <span style={{ ...base, background: 'transparent', borderColor: 'var(--border)', color: 'var(--fg-muted)', borderStyle: 'dashed' }}>
        <Circle size={sm ? 9 : 10} /> {t('narrative.state.absent')}
      </span>
    );
  }
  if (st === 'low') {
    return (
      <span style={{ ...base, background: 'var(--color-warning-bg)', borderColor: 'var(--color-warning)', color: 'var(--color-warning)' }}>
        <AlertTriangle size={sm ? 9 : 11} /> {t('narrative.state.low')}
      </span>
    );
  }
  return (
    <span
      style={{
        ...base,
        background: 'color-mix(in oklab, var(--accent) 14%, var(--bg-primary))',
        borderColor: 'color-mix(in oklab, var(--accent) 40%, var(--bg-primary))',
        color: 'var(--accent)',
      }}
    >
      <Check size={sm ? 9 : 11} /> {t('narrative.state.filled')}
    </span>
  );
}

// ── Review badge — book-level HITL status ──────────────────────────
export function ReviewBadge({ status }: { status: NarrativeReviewStatus }) {
  const { t } = useTranslation('analysis');
  const map = {
    pending: { bg: 'var(--bg-tertiary)', fg: 'var(--fg-secondary)', bd: 'var(--border)', Icon: Sparkles, label: t('narrative.review.pending') },
    approved: { bg: 'var(--color-success-bg)', fg: 'var(--color-success)', bd: 'var(--color-success)', Icon: Check, label: t('narrative.review.approved') },
    rejected: { bg: 'var(--bg-secondary)', fg: 'var(--fg-muted)', bd: 'var(--border)', Icon: X, label: t('narrative.review.rejected') },
  } as const;
  const m = map[status] ?? map.pending;
  return (
    <span
      style={{
        display: 'inline-flex',
        alignItems: 'center',
        gap: 5,
        fontFamily: 'var(--font-sans)',
        fontSize: 'var(--font-size-2xs)',
        fontWeight: 600,
        padding: '3px 10px',
        borderRadius: 20,
        background: m.bg,
        color: m.fg,
        whiteSpace: 'nowrap',
        borderWidth: 'var(--border-width)',
        borderStyle: 'var(--border-style)',
        borderColor: m.bd,
      }}
    >
      <m.Icon size={11} /> {m.label}
    </span>
  );
}

// ── Confidence meter ───────────────────────────────────────────────
// A bare "0.90" says nothing on its own. The 0.6 tick is stageState's own
// filled/low boundary; the peer range is what the rest of this book scored.
export function ConfidenceMeter({ stage, peers = [] }: { stage: HeroJourneyStage; peers?: number[] }) {
  const { t } = useTranslation('analysis');
  const st = stageState(stage);
  if (st === 'absent') {
    return <span style={{ fontFamily: 'var(--font-sans)', fontSize: 'var(--font-size-xs)', color: 'var(--fg-muted)' }}>—</span>;
  }
  const above = stage.confidence >= 0.6;
  const scored = peers.filter((v) => v > 0);
  return (
    <div className="nl-conf">
      <div className="nl-conf-row">
        <span>{t('narrative.confidence')}</span>
        <span>{stage.confidence.toFixed(2)}</span>
      </div>
      <div className="nl-conf-bar">
        <div
          className="nl-conf-fill"
          style={{
            width: `${Math.round(stage.confidence * 100)}%`,
            background: above ? 'var(--accent)' : 'var(--color-warning)',
          }}
        />
        <div className="nl-conf-tick" />
      </div>
      <div className="nl-conf-scale">
        <span>0</span>
        <span>{t('narrative.threshold')}</span>
        <span>1.0</span>
      </div>
      <div className="nl-conf-state">
        <span
          className="nl-conf-chip"
          style={{
            color: above ? 'var(--accent)' : 'var(--color-warning)',
            borderColor: above ? 'var(--accent)' : 'var(--color-warning)',
            borderStyle: above ? 'var(--border-style)' : 'dashed',
          }}
        >
          {above ? t('narrative.confAbove') : t('narrative.confBelow')}
        </span>
        {scored.length > 0 && (
          <span className="nl-conf-peer">
            {t('narrative.confPeer', {
              min: Math.min(...scored).toFixed(2),
              max: Math.max(...scored).toFixed(2),
            })}
          </span>
        )}
      </div>
    </div>
  );
}

// ── Legend ─────────────────────────────────────────────────────────
export function Legend() {
  const { t } = useTranslation('analysis');
  const disc = (bg: string, extra?: React.CSSProperties) => (
    <span
      style={{
        width: 14,
        height: 14,
        borderRadius: '50%',
        background: bg,
        borderWidth: 'var(--border-width)',
        borderStyle: 'var(--border-style)',
        borderColor: 'var(--border)',
        ...extra,
      }}
    />
  );
  const item = (swatch: React.ReactNode, label: string) => (
    <span style={{ display: 'inline-flex', alignItems: 'center', gap: 6, fontFamily: 'var(--font-sans)', fontSize: 'var(--font-size-2xs)', color: 'var(--fg-secondary)' }}>
      {swatch} {label}
    </span>
  );
  return (
    <div style={{ display: 'flex', gap: 16, flexWrap: 'wrap', alignItems: 'center' }}>
      <span style={{ fontFamily: 'var(--font-sans)', fontSize: 'var(--font-size-2xs)', fontWeight: 600, textTransform: 'uppercase', letterSpacing: '0.06em', color: 'var(--fg-muted)' }}>
        {t('narrative.legend')}
      </span>
      {item(disc('color-mix(in oklab, var(--accent) 60%, var(--bg-primary))'), t('narrative.state.filled'))}
      {item(disc('color-mix(in oklab, var(--accent) 30%, var(--bg-primary))', { borderColor: 'var(--color-warning)' }), t('narrative.state.low'))}
      {/* Short label here; the reading of what an absence means, and how many
          there are, lives in the callout under the switcher. */}
      {item(disc('transparent', { borderStyle: 'dashed', borderColor: 'var(--fg-muted)' }), t('narrative.state.absent'))}
    </div>
  );
}

// ── Stage disc — numbered node used by Track + Ring layouts ────────
export function StageDisc({
  stage,
  selected,
  onClick,
  size = 46,
  title,
}: {
  stage: HeroJourneyStage;
  selected: boolean;
  onClick: () => void;
  size?: number;
  title?: string;
}) {
  const st = stageState(stage);
  const ord = stageOrdinal(stage.stage_id);
  return (
    <button
      onClick={onClick}
      title={title}
      style={{
        position: 'relative',
        width: size,
        height: size,
        borderRadius: '50%',
        cursor: 'pointer',
        padding: 0,
        background: discFill(stage),
        border:
          st === 'absent'
            ? 'calc(var(--border-width) + 0.5px) dashed var(--fg-muted)'
            : `var(--border-width) var(--border-style) ${st === 'low' ? 'var(--color-warning)' : 'color-mix(in oklab, var(--accent) 55%, var(--bg-primary))'}`,
        boxShadow: selected ? '0 0 0 3px var(--timeline-selected-ring)' : 'none',
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'center',
        transition: 'box-shadow var(--transition-fast), transform var(--transition-fast)',
        transform: selected ? 'scale(1.08)' : 'scale(1)',
      }}
    >
      <span
        style={{
          fontFamily: 'var(--font-sans)',
          fontWeight: 700,
          fontSize: size * 0.34,
          color: st === 'absent' ? 'var(--fg-muted)' : discText(stage),
          fontVariantNumeric: 'tabular-nums',
        }}
      >
        {st === 'absent' ? '—' : ord}
      </span>
      {st === 'low' && (
        <span
          style={{
            position: 'absolute',
            top: -5,
            right: -5,
            width: 17,
            height: 17,
            borderRadius: '50%',
            background: 'var(--color-warning)',
            color: 'var(--bg-primary)',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            border: '1.5px solid var(--bg-primary)',
          }}
        >
          <AlertTriangle size={9} color="var(--bg-primary)" />
        </span>
      )}
    </button>
  );
}
