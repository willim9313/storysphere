import { useMemo, useState } from 'react';
import { BarChart3, Columns2, Sparkles, Waypoints } from 'lucide-react';
import { useTranslation } from 'react-i18next';
import type { AnalysisListResponse } from '@/api/types';
import { useTimeline } from '@/hooks/useTimeline';
import { EventBackboneMap } from './EventBackboneMap';
import { EventRankingView } from './EventRankingView';
import { buildOverviewEvents } from './eventTypes';

type LandingView = 'map' | 'ranking';

interface EventOverviewLandingProps {
  bookId: string;
  evtData: AnalysisListResponse;
  onSelectEvent: (id: string) => void;
  onGenerate: (id: string) => void;
  generatingId: string | null;
  onBatchAll: () => void;
  isBatchRunning: boolean;
  canCompare: boolean;
  onOpenCompare: () => void;
}

export function EventOverviewLanding({
  bookId,
  evtData,
  onSelectEvent,
  onGenerate,
  generatingId,
  onBatchAll,
  isBatchRunning,
  canCompare,
  onOpenCompare,
}: Readonly<EventOverviewLandingProps>) {
  const { t } = useTranslation('analysis');
  const [view, setView] = useState<LandingView>('map');

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

      <div className="ea-ov-toolbar">
        <div className="ea-ov-toggle">
          <button
            type="button"
            className={'ea-ov-toggle-btn' + (view === 'map' ? ' active' : '')}
            onClick={() => setView('map')}
          >
            <Waypoints size={13} /> {t('event.overview.viewMap')}
          </button>
          <button
            type="button"
            className={'ea-ov-toggle-btn' + (view === 'ranking' ? ' active' : '')}
            onClick={() => setView('ranking')}
          >
          <BarChart3 size={13} /> {t('event.overview.viewRanking')}
          </button>
        </div>
        <button
          type="button"
          className="ea-btn"
          disabled={!canCompare}
          title={canCompare ? undefined : t('event.compare.needTwo')}
          onClick={onOpenCompare}
        >
          <Columns2 size={13} /> {t('event.compare.entryLong')}
        </button>
      </div>

      {view === 'map' ? (
        <EventBackboneMap events={events} onSelectEvent={onSelectEvent} />
      ) : (
        <EventRankingView
          events={events}
          onSelectEvent={onSelectEvent}
          onGenerate={onGenerate}
          generatingId={generatingId}
        />
      )}
    </div>
  );
}
