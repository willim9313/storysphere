// Hero's Journey — stage detail panel.
import { useTranslation } from 'react-i18next';
import { Link } from 'react-router-dom';
import type { HeroJourneyStage } from '@/api/narrative';
import type { StageTheory } from './heroJourney';
import { formatChapters, stageOrdinal, stagePhase, stageState } from './heroJourney';
import { ConfidenceMeter, StateBadge } from './atoms';

export interface EventInfo {
  title: string;
  chapter?: number;
  significance?: string;
}

interface StageDetailProps {
  stage: HeroJourneyStage;
  theory: Record<string, StageTheory>;
  events: Record<string, EventInfo>;
  compact?: boolean;
  /** Every stage on the book — peers for the confidence range and shared-range detection. */
  allStages?: HeroJourneyStage[];
  bookId?: string;
  /** Last chapter that holds a kernel event; explains a stage resolving to none. */
  lastKernelChapter?: number;
}

function Section({ label, extra, children }: { label: string; extra?: string; children: React.ReactNode }) {
  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
      <div style={{ display: 'flex', alignItems: 'baseline', gap: 6 }}>
        <div className="nl-sd-label">{label}</div>
        {extra && <span className="nl-sd-extra">{extra}</span>}
      </div>
      {children}
    </div>
  );
}

export function StageDetail({
  stage,
  theory,
  events,
  compact,
  allStages = [],
  bookId,
  lastKernelChapter,
}: StageDetailProps) {
  const { t } = useTranslation('analysis');
  const phase = stagePhase(stage.stage_id);
  const st = stageState(stage);
  const def = theory[stage.stage_id];
  const name = def?.name ?? stage.stage_name;
  const range = stage.chapter_range;

  const evs = (stage.representative_event_ids ?? [])
    .map((id) => events[id])
    .filter((e): e is EventInfo => Boolean(e));

  // Stages covering the same chapters resolve to the same events. Saying so is
  // the honest reading — a stage is chapter-level, an event sits inside one.
  const sharing = allStages.filter(
    (s) =>
      s.stage_id !== stage.stage_id &&
      s.chapter_range.length > 0 &&
      range.length > 0 &&
      s.chapter_range[0] === range[0] &&
      s.chapter_range[s.chapter_range.length - 1] === range[range.length - 1],
  );

  const peers = allStages.map((s) => s.confidence);
  const body: React.CSSProperties = {
    fontFamily: 'var(--font-serif)',
    fontSize: compact ? 'var(--font-size-xs)' : 'var(--font-size-sm)',
    lineHeight: 1.7,
    color: 'var(--fg-secondary)',
    margin: 0,
    textWrap: 'pretty',
  };

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: compact ? 12 : 15 }}>
      <div style={{ display: 'flex', alignItems: 'flex-start', justifyContent: 'space-between', gap: 12 }}>
        <div style={{ display: 'flex', flexDirection: 'column', gap: 6, minWidth: 0 }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: 8, flexWrap: 'wrap' }}>
            <span className="nl-sd-phase">{t(`narrative.phase.${phase}`)}</span>
            <span style={{ width: 3, height: 3, borderRadius: '50%', background: 'var(--fg-muted)' }} />
            <span style={{ fontFamily: 'var(--font-mono)', fontSize: 'var(--font-size-2xs)', color: 'var(--fg-muted)' }}>
              {formatChapters(range, t)}
            </span>
          </div>
          <h3
            style={{
              margin: 0,
              fontFamily: 'var(--font-serif)',
              fontSize: compact ? 'var(--font-size-lg)' : 'var(--font-size-xl)',
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
        <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
          <ConfidenceMeter stage={stage} peers={peers} />
          <p className="nl-sd-note">
            {/* Without the branch this reads "this book has 0 of them" on every
                book whose stages all scored above the threshold — i.e. both of them. */}
            {peers.filter((v) => v > 0 && v < 0.6).length === 0
              ? t('narrative.confNoteNone')
              : t('narrative.confNote', { below: peers.filter((v) => v > 0 && v < 0.6).length })}
          </p>
        </div>
      )}

      {stage.notes && (
        <Section label={t('narrative.notes')}>
          <p style={body}>{stage.notes}</p>
        </Section>
      )}

      <Section label={t('narrative.repEvents')} extra={evs.length ? t('narrative.evCount', { n: evs.length }) : undefined}>
        {sharing.length > 0 && evs.length > 0 && (
          <div className="nl-sd-shared">
            {t('narrative.repEventsShared', {
              list: sharing.map((s) => stageOrdinal(s.stage_id)).join('、'),
            })}
          </div>
        )}
        {evs.length === 0 && (
          <div className="nl-sd-empty">
            {st === 'absent'
              ? t('narrative.repEventsNoneAbsent')
              : t('narrative.repEventsNoneRange', {
                  ch: range[0] ?? 0,
                  last: lastKernelChapter ?? 0,
                })}
          </div>
        )}
        <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
          {evs.map((ev, i) => {
            const id = (stage.representative_event_ids ?? [])[i];
            const inner = (
              <>
                <div style={{ display: 'flex', alignItems: 'baseline', gap: 6 }}>
                  <span style={{ fontFamily: 'var(--font-mono)', fontSize: 9, color: 'var(--fg-muted)' }}>
                    {ev.chapter ?? ''}
                  </span>
                  <span style={{ fontFamily: 'var(--font-serif)', fontSize: 'var(--font-size-sm)', fontWeight: 600 }}>
                    {ev.title}
                  </span>
                </div>
                {ev.significance && <div className="nl-sd-ev-sig">{ev.significance}</div>}
              </>
            );
            return bookId ? (
              <Link key={id ?? i} className="nl-sd-ev" to={`/books/${bookId}/events?event=${id}`}>
                {inner}
              </Link>
            ) : (
              <div key={id ?? i} className="nl-sd-ev">
                {inner}
              </div>
            );
          })}
        </div>
      </Section>

      {def && (
        <details className="nl-sd-theory">
          <summary>{t('narrative.theoryLabel')}</summary>
          <p style={body}>{def.description}</p>
          <p style={{ ...body, color: 'var(--fg-muted)' }}>
            {t('narrative.fnLabel')}
            {def.narrativeFunction}
          </p>
          <Link className="nl-sd-method" to="/methodology?framework=hero_journey">
            {t('narrative.methodLink')}
          </Link>
        </details>
      )}
    </div>
  );
}
