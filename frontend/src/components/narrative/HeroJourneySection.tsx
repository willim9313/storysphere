// Hero's Journey — main section: header + book-level HITL + layout switcher.
import { useMemo, useState } from 'react';
import { Link } from 'react-router-dom';
import { useTranslation } from 'react-i18next';
import { Check, RefreshCw, X } from 'lucide-react';
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
  onRerun: () => void;
  rerunning: boolean;
  kernelChapters: number[];
  lastKernelChapter: number;
  bookId: string;
}

export function HeroJourneySection({ stages, theory, events, chapterCount, reviewStatus, onReview, reviewPending, onRerun, rerunning, kernelChapters, lastKernelChapter, bookId }: HeroJourneySectionProps) {
  const { t } = useTranslation('analysis');
  const [layout, setLayout] = useState<LayoutId>(LAYOUT_IDS[0]);
  const ActiveLayout = LAYOUTS[layout];

  const mapped = useMemo(() => stages.filter((s) => stageState(s) !== 'absent').length, [stages]);
  const absent = STAGE_ORDER.length - mapped;

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
    <section className="nl-card" id="nl-hero" style={{ flex: 1, minHeight: 0 }}>
      {/* header */}
      <div style={{ display: 'flex', alignItems: 'flex-start', justifyContent: 'space-between', gap: 16, flexWrap: 'wrap' }}>
        <div style={{ minWidth: 0 }}>
          <div style={{ display: 'flex', alignItems: 'baseline', gap: 10, flexWrap: 'wrap' }}>
            <h2 style={{ margin: 0, fontFamily: 'var(--font-serif)', fontSize: 'var(--font-size-2xl)', fontWeight: 700, color: 'var(--fg-primary)', letterSpacing: '-0.01em' }}>{t('narrative.heroJourney')}</h2>
            {/* The framework name doubles as the way out to its full
                description, so the terms need no explaining here. */}
            <Link className="nl-term-link" to="/methodology?framework=hero_journey">
              {t('narrative.hjSub')}
            </Link>
          </div>
          <div style={{ marginTop: 6, display: 'flex', alignItems: 'center', gap: 8, fontFamily: 'var(--font-sans)', fontSize: 'var(--font-size-2xs)', color: 'var(--fg-secondary)', flexWrap: 'wrap' }}>
            <span style={{ whiteSpace: 'nowrap' }}>
              <b style={{ color: 'var(--accent)', fontWeight: 700 }}>{t('narrative.coverage', { mapped })}</b> {t('narrative.ofTotal', { total: STAGE_ORDER.length })}
            </span>
          </div>
        </div>

        {/* book-level HITL */}
        <div style={{ display: 'flex', gap: 8, alignItems: 'center', flexWrap: 'wrap' }}>
          <button
            type="button"
            disabled={rerunning}
            style={{ ...hitlBtn(false, 'var(--accent)'), cursor: rerunning ? 'wait' : 'pointer', opacity: rerunning ? 0.6 : 1 }}
            onClick={onRerun}
          >
            <RefreshCw size={12} /> {rerunning ? t('narrative.rerunning') : t('narrative.rerun')}
          </button>
          <button disabled={reviewPending} style={hitlBtn(reviewStatus === 'approved', 'var(--color-success)')} onClick={() => onReview('approved')}>
            <Check size={12} /> {t('narrative.approve')}
          </button>
          <button disabled={reviewPending} style={hitlBtn(reviewStatus === 'rejected', 'var(--fg-secondary)')} onClick={() => onReview('rejected')}>
            <X size={12} /> {t('narrative.markNA')}
          </button>
          <ReviewBadge status={reviewStatus} />
        </div>
      </div>

      {/* What each view is for, stated on the control itself: a first-time
          reader will not hover something they don't yet know differs. */}
      <div className="nl-views">
        {LAYOUT_IDS.map((id) => (
          <button
            key={id}
            type="button"
            className={layout === id ? 'nl-view is-active' : 'nl-view'}
            onClick={() => setLayout(id)}
          >
            <span className="nl-view-name">{t(`narrative.layout.${id}`)}</span>
            <span className="nl-view-hint">{t(`narrative.viewHint.${id}`)}</span>
          </button>
        ))}
      </div>

      {absent > 0 && (
        <div className="nl-absent-note">
          <span className="nl-absent-glyph">—</span>
          <div>
            <div className="nl-absent-title">{t('narrative.absentSummary', { count: absent })}</div>
            <div className="nl-absent-body">{t('narrative.absentBody')}</div>
          </div>
        </div>
      )}

      <ActiveLayout stages={stages} theory={theory} events={events} chapterCount={chapterCount} kernelChapters={kernelChapters} lastKernelChapter={lastKernelChapter} bookId={bookId} />
    </section>
  );
}
