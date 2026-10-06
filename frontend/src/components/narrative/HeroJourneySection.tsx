// Hero's Journey — main section: header + book-level review + layout switcher
// + the active chart beside a sticky stage-detail column.
import { useMemo, useState } from 'react';
import { Link } from 'react-router-dom';
import { useTranslation } from 'react-i18next';
import type { HeroJourneyStage, NarrativeReviewStatus } from '@/api/narrative';
import { Tooltip } from '@/components/ui/Tooltip';
import type { LayoutId, StageTheory } from './heroJourney';
import { LAYOUT_IDS, STAGE_ORDER, stageState } from './heroJourney';
import { ReviewBadge } from './atoms';
import { LayoutBand, LayoutColumns, LayoutRing, LayoutTrack, type VizProps } from './layouts';
import { StageDetail, type EventInfo } from './StageDetail';
import { nextReviewStatus } from './narrativeModel';

const LAYOUTS: Record<LayoutId, (p: VizProps) => React.JSX.Element> = {
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
  /** The status to send — already resolved by the toggle (pressing a lit button gives `pending`). */
  onReview: (status: NarrativeReviewStatus) => void;
  reviewPending: boolean;
  onRerun: () => void;
  rerunning: boolean;
  /** Real task progress (the backend reports a fixed 10/20/90). */
  progress: number;
  /** Set when the chapter-summary gate blocks a re-run; carries the reason. */
  rerunBlockedReason: string | null;
  kernelChapters: number[];
  bookId: string;
}

export function HeroJourneySection({
  stages,
  theory,
  events,
  chapterCount,
  reviewStatus,
  onReview,
  reviewPending,
  onRerun,
  rerunning,
  progress,
  rerunBlockedReason,
  kernelChapters,
  bookId,
}: Readonly<HeroJourneySectionProps>) {
  const { t } = useTranslation('analysis');
  const [layout, setLayout] = useState<LayoutId>(LAYOUT_IDS[0]);
  const [sel, setSel] = useState<string>(
    () => stages.find((s) => s.stage_id === 'ordeal')?.stage_id ?? stages[0]?.stage_id ?? '',
  );
  const Chart = LAYOUTS[layout];
  const selStage = stages.find((s) => s.stage_id === sel) ?? stages[0];

  const mapped = useMemo(() => stages.filter((s) => stageState(s) !== 'absent').length, [stages]);
  const absent = STAGE_ORDER.length - mapped;

  const approvedOn = reviewStatus === 'approved';
  const rejectedOn = reviewStatus === 'rejected';

  const rerunBtn = (
    <button
      type="button"
      id="nl-hero-run"
      className="ss-btn ss-btn-sm ss-btn-secondary ss-btn-llm"
      disabled={rerunning || rerunBlockedReason !== null}
      onClick={onRerun}
    >
      {rerunning ? t('narrative.empty.running', { progress }) : t('narrative.rerun')}
    </button>
  );

  return (
    <section className="nl-card" id="nl-hero">
      <div className="nl-hj-head">
        <div className="nl-hj-title">
          <div className="nl-hj-title-line">
            <h2 className="nl-h2">{t('narrative.heroJourney')}</h2>
            {/* The framework name doubles as the way out to its full
                description, so the terms need no explaining here. */}
            <Link className="nl-term-link" to="/methodology?framework=hero_journey">
              {t('narrative.hjSub')}
            </Link>
          </div>
          <span className="nl-hj-cov">
            <b>{t('narrative.coverage', { mapped })}</b> {t('narrative.ofTotal', { total: STAGE_ORDER.length })}
          </span>
        </div>

        {/* Book-level review: three values, no "modified". Pressing a lit
            button again withdraws it. Only re-analysis spends tokens. */}
        <div className="nl-hj-actions">
          <ReviewBadge status={reviewStatus} />
          {rerunBlockedReason ? (
            <Tooltip label={rerunBlockedReason}>{rerunBtn}</Tooltip>
          ) : (
            rerunBtn
          )}
          <Tooltip label={approvedOn ? t('narrative.review.withdrawApproved') : ''} disabled={!approvedOn}>
            <button
              type="button"
              className="ss-btn ss-btn-sm ss-btn-secondary nl-review-btn"
              aria-pressed={approvedOn}
              disabled={reviewPending}
              onClick={() => onReview(nextReviewStatus(reviewStatus, 'approved'))}
            >
              {t('narrative.approve')}
            </button>
          </Tooltip>
          <Tooltip label={rejectedOn ? t('narrative.review.withdrawRejected') : ''} disabled={!rejectedOn}>
            <button
              type="button"
              className="ss-btn ss-btn-sm ss-btn-ghost nl-review-btn"
              aria-pressed={rejectedOn}
              disabled={reviewPending}
              onClick={() => onReview(nextReviewStatus(reviewStatus, 'rejected'))}
            >
              {t('narrative.markNA')}
            </button>
          </Tooltip>
        </div>
      </div>

      {rerunning && (
        <div className="nl-progress" role="status">
          <div className="nl-progress-line">
            <span className="nl-progress-spin" aria-hidden="true" />
            {t('narrative.empty.running', { progress })}
          </div>
          <div className="ss-progress">
            <div className="ss-progress-fill" style={{ width: `${progress}%` }} />
          </div>
        </div>
      )}

      {/* What each view is for, on the control itself: a first-time reader will
          not hover something they don't yet know differs. */}
      <div className="ss-seg nl-seg" role="radiogroup" aria-label={t('narrative.heroJourney')}>
        {LAYOUT_IDS.map((id) => (
          <button
            key={id}
            type="button"
            role="radio"
            aria-checked={layout === id}
            className={layout === id ? 'ss-seg-item nl-seg-item active' : 'ss-seg-item nl-seg-item'}
            onClick={() => setLayout(id)}
          >
            <span className="nl-seg-name">{t(`narrative.layout.${id}`)}</span>
            <span className="nl-seg-hint">{t(`narrative.viewHint.${id}`)}</span>
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

      {/* Chart left, detail right and sticky; the track puts it full width below. */}
      <div className={`nl-hj-body is-${layout}`}>
        <div className="nl-hj-viz">
          <Chart
            stages={stages}
            theory={theory}
            sel={selStage?.stage_id ?? ''}
            onSelect={setSel}
            chapterCount={chapterCount}
            kernelChapters={kernelChapters}
          />
        </div>
        <aside className="nl-detail">
          {selStage && (
            <StageDetail
              stage={selStage}
              theory={theory}
              events={events}
              allStages={stages}
              bookId={bookId}
              kernelChapters={kernelChapters}
              wide={layout === 'track'}
            />
          )}
        </aside>
      </div>
    </section>
  );
}
