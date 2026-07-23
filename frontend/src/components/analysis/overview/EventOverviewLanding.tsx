import { useMemo } from 'react';
import { Sparkles } from 'lucide-react';
import { useTranslation } from 'react-i18next';
import type { AnalysisListResponse } from '@/api/types';
import { useTimeline } from '@/hooks/useTimeline';
import { EventRankingView } from './EventRankingView';
import { buildOverviewEvents } from './eventTypes';

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

  const { data: timeline } = useTimeline(bookId, 'narrative');
  const events = useMemo(() => buildOverviewEvents(evtData, timeline), [evtData, timeline]);

  const analyzedCount = evtData.analyzed.length;
  const unanalyzedCount = evtData.unanalyzed.length;
  const totalCount = analyzedCount + unanalyzedCount;
  const kernelCount = events.filter((e) => e.importance === 'KERNEL').length;

  return (
    <div className="ea-ov-landing">
      {analyzedCount === 0 && (
        <div className="ea-ov-empty-banner">
          <div className="ea-ov-empty-text">
            <strong>{t('event.overview.emptyLead')}</strong> {t('event.overview.emptyBody')}
          </div>
          <button
            type="button"
            className="ea-btn ea-btn-primary"
            onClick={onBatchAll}
            disabled={isBatchRunning}
          >
            <Sparkles size={12} /> {t('event.overview.emptyBatch')}
          </button>
        </div>
      )}

      <div className="ea-ov-head">
        <h1 className="ea-ov-title">{t('event.overview.title')}</h1>
        <div className="ea-ov-meta">
          <span>
            <strong>{totalCount}</strong> {t('event.overview.metaTotal')}
          </span>
          <span className="ea-ov-meta-item analyzed">
            <span className="ea-ov-meta-dot" /> {t('event.overview.metaAnalyzed')} {analyzedCount}
          </span>
          <span className="ea-ov-meta-item">
            <span className="ea-ov-meta-dot empty" /> {t('event.overview.metaUnanalyzed')}{' '}
            {unanalyzedCount}
          </span>
          <span className="ea-ov-meta-item kernel">
            {t('event.overview.metaKernel')} {kernelCount}
          </span>
        </div>
      </div>

      <EventRankingView
        events={events}
        onSelectEvent={onSelectEvent}
        onGenerate={onGenerate}
        generatingId={generatingId}
      />
    </div>
  );
}
