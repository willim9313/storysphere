// Hero's Journey — main section: header + book-level HITL + layout switcher.
import { useMemo, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { Check, X } from 'lucide-react';
import type { HeroJourneyStage, NarrativeReviewStatus } from '@/api/narrative';
import type { LayoutId, StageTheory } from './heroJourney';
import { LAYOUT_IDS, STAGE_ORDER, stageState } from './heroJourney';
import { ReviewBadge } from './atoms';
import { LayoutBand, LayoutColumns, LayoutRing, LayoutTrack, type LayoutProps } from './layouts';
import type { EventInfo } from './StageDetail';

const LAYOUTS: Record<LayoutId, (p: LayoutProps) => React.JSX.Element> = {
  track: LayoutTrack,
  columns: LayoutColumns,
  ring: LayoutRing,
  band: LayoutBand,
};

interface HeroJourneySectionProps {
  stages: HeroJourneyStage[];
  theory: Record<string, StageTheory>;
  events: Record<string, EventInfo>;
  chapterCount: number;
  reviewStatus: NarrativeReviewStatus;
  onReview: (status: 'approved' | 'rejected') => void;
  reviewPending: boolean;
}

export function HeroJourneySection({ stages, theory, events, chapterCount, reviewStatus, onReview, reviewPending }: HeroJourneySectionProps) {
  const { t } = useTranslation('analysis');
  const [layout, setLayout] = useState<LayoutId>('track');
  const ActiveLayout = LAYOUTS[layout];

  const mapped = useMemo(() => stages.filter((s) => stageState(s) !== 'absent').length, [stages]);

  const segBtn = (active: boolean): React.CSSProperties => ({
    cursor: 'pointer',
    fontFamily: 'var(--font-sans)',
    fontSize: 'var(--font-size-xs)',
    fontWeight: 600,
    padding: '5px 11px',
    borderRadius: 7,
    border: 'none',
    lineHeight: 1.4,
    background: active ? 'var(--accent)' : 'transparent',
    color: active ? 'var(--bg-primary)' : 'var(--fg-secondary)',
    transition: 'background-color var(--transition-fast), color var(--transition-fast)',
  });

  const hitlBtn = (active: boolean, activeColor: string): React.CSSProperties => ({
    display: 'inline-flex',
    alignItems: 'center',
    gap: 5,
    cursor: reviewPending ? 'wait' : 'pointer',
    opacity: reviewPending ? 0.6 : 1,
    fontFamily: 'var(--font-sans)',
    fontSize: 'var(--font-size-2xs)',
    fontWeight: 600,
    padding: '5px 11px',
    borderRadius: 'var(--radius-md)',
    borderWidth: 'var(--border-width)',
    borderStyle: 'var(--border-style)',
    borderColor: active ? activeColor : 'var(--border)',
    background: active ? activeColor : 'var(--bg-primary)',
    color: active ? 'var(--bg-primary)' : 'var(--fg-secondary)',
    transition: 'background-color var(--transition-fast), color var(--transition-fast)',
  });

  return (
    <section className="nl-card" style={{ flex: 1, minHeight: 0 }}>
      {/* header */}
      <div style={{ display: 'flex', alignItems: 'flex-start', justifyContent: 'space-between', gap: 16, flexWrap: 'wrap' }}>
        <div style={{ minWidth: 0 }}>
          <div style={{ display: 'flex', alignItems: 'baseline', gap: 10, flexWrap: 'wrap' }}>
            <h2 style={{ margin: 0, fontFamily: 'var(--font-serif)', fontSize: 'var(--font-size-2xl)', fontWeight: 700, color: 'var(--fg-primary)', letterSpacing: '-0.01em' }}>{t('narrative.heroJourney')}</h2>
            <span style={{ fontFamily: 'var(--font-sans)', fontSize: 'var(--font-size-xs)', color: 'var(--fg-muted)' }}>{t('narrative.hjSub')}</span>
          </div>
          <div style={{ marginTop: 6, display: 'flex', alignItems: 'center', gap: 8, fontFamily: 'var(--font-sans)', fontSize: 'var(--font-size-2xs)', color: 'var(--fg-secondary)', flexWrap: 'wrap' }}>
            <span style={{ whiteSpace: 'nowrap' }}>
              <b style={{ color: 'var(--accent)', fontWeight: 700 }}>{t('narrative.coverage', { mapped })}</b> {t('narrative.ofTotal', { total: STAGE_ORDER.length })}
            </span>
            <span style={{ width: 3, height: 3, borderRadius: '50%', background: 'var(--fg-muted)', flexShrink: 0 }} />
            <span style={{ color: 'var(--fg-muted)' }}>{t('narrative.notProgress')}</span>
          </div>
        </div>

        {/* book-level HITL */}
        <div style={{ display: 'flex', gap: 8, alignItems: 'center', flexWrap: 'wrap' }}>
          <button disabled={reviewPending} style={hitlBtn(reviewStatus === 'approved', 'var(--color-success)')} onClick={() => onReview('approved')}>
            <Check size={12} /> {t('narrative.approve')}
          </button>
          <button disabled={reviewPending} style={hitlBtn(reviewStatus === 'rejected', 'var(--fg-secondary)')} onClick={() => onReview('rejected')}>
            <X size={12} /> {t('narrative.markNA')}
          </button>
          <ReviewBadge status={reviewStatus} />
        </div>
      </div>

      {/* layout switcher */}
      <div
        style={{
          display: 'inline-flex',
          gap: 2,
          padding: 3,
          borderRadius: 9,
          background: 'var(--bg-secondary)',
          borderWidth: 'var(--border-width)',
          borderStyle: 'var(--border-style)',
          borderColor: 'var(--border)',
          alignSelf: 'flex-start',
        }}
      >
        {LAYOUT_IDS.map((id) => (
          <button key={id} style={segBtn(layout === id)} onClick={() => setLayout(id)}>
            {t(`narrative.layout.${id}`)}
          </button>
        ))}
      </div>

      <ActiveLayout stages={stages} theory={theory} events={events} chapterCount={chapterCount} />
    </section>
  );
}
