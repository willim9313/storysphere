// Hero's Journey — click-to-expand stage detail body.
import { useTranslation } from 'react-i18next';
import type { HeroJourneyStage } from '@/api/narrative';
import type { StageTheory } from './heroJourney';
import { formatChapters, stagePhase, stageState } from './heroJourney';
import { ConfidenceMeter, EventPill, StateBadge } from './atoms';

export interface EventInfo {
  title: string;
  chapter?: number;
}

interface StageDetailProps {
  stage: HeroJourneyStage;
  theory: Record<string, StageTheory>;
  events: Record<string, EventInfo>;
  compact?: boolean;
}

function Section({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 4 }}>
      <div
        style={{
          fontFamily: 'var(--font-sans)',
          fontSize: 'var(--font-size-2xs)',
          fontWeight: 600,
          letterSpacing: '0.06em',
          textTransform: 'uppercase',
          color: 'var(--fg-muted)',
        }}
      >
        {label}
      </div>
      {children}
    </div>
  );
}

export function StageDetail({ stage, theory, events, compact }: StageDetailProps) {
  const { t } = useTranslation('analysis');
  const phase = stagePhase(stage.stage_id);
  const st = stageState(stage);
  const def = theory[stage.stage_id];
  const name = def?.name ?? stage.stage_name;
  const evs = (stage.representative_event_ids ?? [])
    .map((id) => events[id])
    .filter((e): e is EventInfo => Boolean(e));

  const body: React.CSSProperties = {
    fontFamily: 'var(--font-serif)',
    fontSize: compact ? 12.5 : 13.5,
    lineHeight: 1.7,
    color: 'var(--fg-secondary)',
    margin: 0,
    textWrap: 'pretty',
  };

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: compact ? 12 : 15 }}>
      <div style={{ display: 'flex', alignItems: 'flex-start', justifyContent: 'space-between', gap: 12 }}>
        <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: 8, flexWrap: 'wrap' }}>
            <span
              style={{
                fontFamily: 'var(--font-sans)',
                fontSize: 'var(--font-size-2xs)',
                fontWeight: 700,
                letterSpacing: '0.05em',
                textTransform: 'uppercase',
                color: 'var(--accent)',
              }}
            >
              {t(`narrative.phase.${phase}`)}
            </span>
            <span style={{ width: 3, height: 3, borderRadius: '50%', background: 'var(--fg-muted)' }} />
            <span style={{ fontFamily: 'var(--font-mono)', fontSize: 'var(--font-size-2xs)', color: 'var(--fg-muted)' }}>
              {formatChapters(stage.chapter_range, t)}
            </span>
          </div>
          <h3
            style={{
              margin: 0,
              fontFamily: 'var(--font-serif)',
              fontSize: compact ? 18 : 21,
              fontWeight: 700,
              color: 'var(--fg-primary)',
              lineHeight: 1.2,
            }}
          >
            {name}
          </h3>
        </div>
        <StateBadge stage={stage} />
      </div>

      {st !== 'absent' && (
        <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
          <span style={{ fontFamily: 'var(--font-sans)', fontSize: 'var(--font-size-2xs)', color: 'var(--fg-muted)' }}>{t('narrative.confidence')}</span>
          <ConfidenceMeter stage={stage} width={compact ? 90 : 130} />
        </div>
      )}

      <Section label={t('narrative.notes')}>
        <p style={body}>{stage.notes ? stage.notes : '—'}</p>
      </Section>

      {evs.length > 0 && (
        <Section label={t('narrative.repEvents')}>
          <div style={{ display: 'flex', flexWrap: 'wrap', gap: 6 }}>
            {evs.map((ev, i) => (
              <EventPill key={i} title={ev.title} chapter={ev.chapter} />
            ))}
          </div>
        </Section>
      )}

      {!compact && def && (
        <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 14 }}>
          <Section label={t('narrative.description')}>
            <p style={body}>{def.description}</p>
          </Section>
          <Section label={t('narrative.narrativeFunction')}>
            <p style={body}>{def.narrativeFunction}</p>
          </Section>
        </div>
      )}
    </div>
  );
}
