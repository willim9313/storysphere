import { useMemo, useState } from 'react';
import { Trans, useTranslation } from 'react-i18next';
import { useNavigate } from 'react-router-dom';
import { Flag } from 'lucide-react';
import { EmptyState } from '@/components/ui/EmptyState';
import type { AnalysisListResponse } from '@/api/types';
import { useTimeline } from '@/hooks/useTimeline';
import { GuidanceRibbon } from '@/components/ui/GuidanceRibbon';
import { EventBackboneMap } from './EventBackboneMap';
import { EventFlowView } from './EventFlowView';
import { EventRankingView } from './EventRankingView';
import { buildOverviewEvents } from './eventTypes';

type LandingView = 'map' | 'ranking' | 'flow';

const VIEWS: { key: LandingView; labelKey: string }[] = [
  { key: 'map', labelKey: 'event.overview.viewMap' },
  { key: 'ranking', labelKey: 'event.overview.viewRanking' },
  { key: 'flow', labelKey: 'event.overview.viewFlow' },
];

interface EventOverviewLandingProps {
  bookId: string;
  evtData: AnalysisListResponse;
  onSelectEvent: (id: string) => void;
  onGenerate: (id: string) => void;
  generatingId: string | null;
  onBatchAll: () => void;
  isBatchRunning: boolean;
}

export function EventOverviewLanding({
  bookId,
  evtData,
  onSelectEvent,
  onGenerate,
  generatingId,
  onBatchAll,
  isBatchRunning,
}: Readonly<EventOverviewLandingProps>) {
  const { t } = useTranslation('analysis');
  const navigate = useNavigate();
  const [view, setView] = useState<LandingView>('map');

  const { data: timeline } = useTimeline(bookId, 'narrative');
  const events = useMemo(() => buildOverviewEvents(evtData, timeline), [evtData, timeline]);

  const analyzedCount = evtData.analyzed.length;
  const unanalyzedCount = evtData.unanalyzed.length;
  const totalCount = analyzedCount + unanalyzedCount;
  const kernelCount = events.filter((e) => e.importance === 'KERNEL').length;

  // No events at all is not "nothing analyzed yet": events come from the
  // knowledge-graph extraction, so a batch EEP run has nothing to work on.
  // Point at the build step instead of offering a 0-event LLM button.
  if (totalCount === 0) {
    return (
      <EmptyState
        weight="prerequisite"
        icon={<Flag size={26} aria-hidden="true" />}
        title={t('event.overview.empty.title')}
        description={t('event.overview.empty.description')}
        action={
          <button
            type="button"
            className="ss-btn ss-btn-md ss-btn-primary"
            onClick={() => navigate(`/books/${bookId}/unraveling`)}
          >
            {t('graph:onboarding.cta')}
          </button>
        }
      />
    );
  }

  return (
    <div className="ea-ov-landing">
      <GuidanceRibbon surface="event-overview">
        <strong>{t('event.guide.prefix')}</strong>{' '}
        <Trans i18nKey="event.guide.overview" ns="analysis" components={{ strong: <strong /> }} />
      </GuidanceRibbon>

      {analyzedCount === 0 && (
        <div className="ea-ov-empty-banner">
          <div className="ea-ov-empty-text">
            <strong>{t('event.overview.emptyLead')}</strong> {t('event.overview.emptyBody')}
          </div>
          <button
            type="button"
            className="ss-btn ss-btn-sm ss-btn-primary ss-btn-llm"
            onClick={onBatchAll}
            disabled={isBatchRunning}
          >
            {t('event.overview.emptyBatch')}
          </button>
        </div>
      )}

      <div className="ea-ov-head">
        <div className="ea-ov-head-main">
          <h1 className="ea-ov-title">{t('event.overview.title')}</h1>
          <span className="ea-ov-meta">
            {totalCount} {t('event.overview.metaTotal')} · {t('event.overview.metaAnalyzed')}{' '}
            {analyzedCount} · {t('event.overview.metaUnanalyzed')} {unanalyzedCount} ·{' '}
            {t('event.overview.metaKernel')} {kernelCount}
          </span>
        </div>
        {/* View switch is a zero-cost mode switch: no LLM glyph, no accent fill. */}
        <div className="ss-seg">
          {VIEWS.map((v) => (
            <button
              key={v.key}
              type="button"
              className={'ss-seg-item' + (view === v.key ? ' active' : '')}
              onClick={() => setView(v.key)}
            >
              {t(v.labelKey)}
            </button>
          ))}
        </div>
      </div>

      {view === 'map' && <EventBackboneMap events={events} onSelectEvent={onSelectEvent} />}
      {view === 'ranking' && (
        <EventRankingView
          events={events}
          onSelectEvent={onSelectEvent}
          onGenerate={onGenerate}
          generatingId={generatingId}
        />
      )}
      {view === 'flow' && (
        <EventFlowView events={events} timeline={timeline} onSelectEvent={onSelectEvent} />
      )}
    </div>
  );
}
