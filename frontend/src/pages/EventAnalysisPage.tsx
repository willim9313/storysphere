import { useState, useEffect, useRef, useCallback } from 'react';
import { useParams, useLocation, useSearchParams, Link } from 'react-router-dom';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import {
  Search,
  AlertTriangle,
  RefreshCw,
  Sparkles,
  ExternalLink,
  Check,
  X,
  ArrowLeft,
  Columns2,
  BookOpen,
} from 'lucide-react';
import { useTranslation } from 'react-i18next';
import { useChatDispatch } from '@/contexts/ChatContext';
import { useBook } from '@/hooks/useBook';
import { useEventAnalysis } from '@/hooks/useEventAnalysis';
import {
  triggerEventAnalysis,
  triggerBatchEventAnalysis,
  fetchEventAnalysisDetail,
  fetchEventSourcePassages,
} from '@/api/analysis';
import { BatchEepPanel } from '@/components/analysis/BatchEepPanel';
import { EventAnalysisDetail } from '@/components/analysis/EventAnalysisDetail';
import { EventOverviewLanding } from '@/components/analysis/overview/EventOverviewLanding';
import { EventGroupedList } from '@/components/analysis/EventGroupedList';
import { EventCompareDrawer } from '@/components/analysis/EventCompareDrawer';
import { EventGuideRibbon } from '@/components/analysis/EventGuideRibbon';
import { ConfirmDialog } from '@/components/ui/ConfirmDialog';
import { useAsyncTask } from '@/hooks/useAsyncTask';
import { useBatchTask } from '@/hooks/useBatchTask';
import '@/styles/event-analysis.css';

/** Rough per-event wall-clock estimate for the batch ETA. Not measured — a
 *  planning hint only, and the label says "estimated". Replace when per-event
 *  timings are actually recorded. */
const SECONDS_PER_EVENT = 8;

type TFunc = ReturnType<typeof useTranslation>['t'];

function formatEta(count: number, t: TFunc): string {
  const seconds = count * SECONDS_PER_EVENT;
  return seconds >= 60
    ? t('event.batch.etaMinutes', { n: Math.ceil(seconds / 60) })
    : t('event.batch.etaSeconds', { n: seconds });
}

export default function EventAnalysisPage() {
  const queryClient = useQueryClient();
  const { bookId } = useParams<{ bookId: string }>();
  const { setPageContext } = useChatDispatch();
  const { data: book } = useBook(bookId);
  const location = useLocation();

  const [searchQuery, setSearchQuery] = useState('');
  // Selection lives in the URL (`?event=`) so reload / share / back keep it.
  const [searchParams, setSearchParams] = useSearchParams();
  const selectedEntityId = searchParams.get('event');
  const setSelectedEntityId = useCallback(
    (id: string | null, replace = false) => {
      setSearchParams(
        (prev) => {
          const next = new URLSearchParams(prev);
          if (id) next.set('event', id);
          else next.delete('event');
          return next;
        },
        { replace },
      );
    },
    [setSearchParams],
  );

  // Migrate legacy deep-links that pass the id via history state (graph /
  // symbol pages still navigate that way) into the URL, once, on arrival.
  const legacySelectId = (location.state as { selectId?: string } | null)?.selectId;
  useEffect(() => {
    if (legacySelectId && !selectedEntityId) setSelectedEntityId(legacySelectId, true);
  }, [legacySelectId, selectedEntityId, setSelectedEntityId]);

  const [confirmRegenerate, setConfirmRegenerate] = useState(false);
  const [generatingId, setGeneratingId] = useState<string | null>(null);
  const [triggerError, setTriggerError] = useState<string | null>(null);
  const [justDoneIds, setJustDoneIds] = useState<Set<string>>(new Set());
  const justDoneTimers = useRef<Map<string, ReturnType<typeof setTimeout>>>(new Map());
  const { t } = useTranslation('analysis');
  const { t: tc } = useTranslation('common');

  const [confirmBatchEep, setConfirmBatchEep] = useState(false);
  const [toastVisible, setToastVisible] = useState(false);
  const [compareOpen, setCompareOpen] = useState(false);
  const [checkMode, setCheckMode] = useState(false);
  const [checkedIds, setCheckedIds] = useState<Set<string>>(new Set());

  useEffect(() => {
    if (book) {
      setPageContext({
        page: 'analysis',
        bookId,
        bookTitle: book.title,
        analysisTab: 'events',
      });
    }
    return () => setPageContext({ page: 'other' });
  }, [book, bookId, setPageContext]);

  const { data: evtData, isLoading } = useEventAnalysis(bookId);

  // Only analyzed events have a #7d payload. Selecting anything else — an
  // unanalyzed event, or one whose generation is still running — would only
  // 404, so the query stays parked until the list says the analysis exists.
  const isSelectedAnalyzed = !!evtData?.analyzed.some((a) => a.entityId === selectedEntityId);

  // Generation task for the selected event. The id is deliberately kept after a
  // failure: the error panel below is rendered from `gen.task`, and clearing
  // the id would take it off screen.
  const gen = useAsyncTask({
    defaultError: t('triggerFailed'),
    onDone: (_task, { reset }) => {
      queryClient.invalidateQueries({ queryKey: ['books', bookId, 'analysis', 'events'] });
      queryClient.invalidateQueries({
        queryKey: ['books', bookId, 'events', selectedEntityId, 'analysis'],
      });
      if (generatingId) markJustDone(generatingId);
      reset();
      setGeneratingId(null);
    },
  });

  const { data: eventDetail, isLoading: detailLoading } = useQuery({
    queryKey: ['books', bookId, 'events', selectedEntityId, 'analysis'],
    queryFn: () => fetchEventAnalysisDetail(bookId!, selectedEntityId!),
    enabled: !!bookId && !!selectedEntityId && !gen.taskId && isSelectedAnalyzed,
  });

  // #7i — retrieved source passages, only useful while the event is still
  // unanalyzed (that is the "is this worth spending LLM budget on" moment).
  const { data: sourceData, isLoading: sourceLoading } = useQuery({
    queryKey: ['books', bookId, 'events', selectedEntityId, 'source'],
    queryFn: () => fetchEventSourcePassages(bookId!, selectedEntityId!, 2),
    enabled: !!bookId && !!selectedEntityId && !isSelectedAnalyzed && !gen.taskId,
  });

  const markJustDone = (id: string) => {
    setJustDoneIds((prev) => {
      const next = new Set(prev);
      next.add(id);
      return next;
    });
    const prevTimer = justDoneTimers.current.get(id);
    if (prevTimer) clearTimeout(prevTimer);
    const timer = setTimeout(() => {
      setJustDoneIds((prev) => {
        const next = new Set(prev);
        next.delete(id);
        return next;
      });
      justDoneTimers.current.delete(id);
    }, 1500);
    justDoneTimers.current.set(id, timer);
  };

  useEffect(() => {
    const timers = justDoneTimers.current;
    return () => {
      timers.forEach((timer) => clearTimeout(timer));
      timers.clear();
    };
  }, []);

  const triggerMutation = useMutation({
    mutationFn: (id: string) => triggerEventAnalysis(bookId!, id),
    onSuccess: (data) => {
      setTriggerError(null);
      gen.adopt(data.taskId);
    },
    onError: () => {
      setGeneratingId(null);
      setTriggerError(t('triggerFailed'));
    },
  });

  // Retry only the failed parts of a partial result (reuses cached EEP).
  const retryFailedMutation = useMutation({
    mutationFn: (id: string) => triggerEventAnalysis(bookId!, id, 'retryFailed'),
    onSuccess: (data) => {
      setTriggerError(null);
      gen.adopt(data.taskId);
    },
    onError: () => setTriggerError(t('triggerFailed')),
  });

  const handleGenerate = (id: string) => {
    setGeneratingId(id);
    setSelectedEntityId(id);
    triggerMutation.mutate(id);
  };

  const refreshEvents = useCallback(
    () => queryClient.invalidateQueries({ queryKey: ['books', bookId, 'analysis', 'events'] }),
    [queryClient, bookId],
  );

  const batch = useBatchTask<string[]>({
    trigger: (eventIds) => triggerBatchEventAnalysis(bookId!, eventIds),
    onProgress: refreshEvents,
    onDone: () => {
      refreshEvents();
      setToastVisible(true);
    },
    failureMessage: t('batchTriggerFailed'),
  });

  // Auto-dismiss toast after 5s
  useEffect(() => {
    if (!toastVisible) return;
    const timer = setTimeout(() => setToastVisible(false), 5000);
    return () => clearTimeout(timer);
  }, [toastVisible]);

  const selectedUnanalyzed = evtData?.unanalyzed.find((u) => u.id === selectedEntityId);

  // Search / importance / narrative filtering and grouping now live in
  // EventGroupedList; the page only owns the query string.
  const totalCount = (evtData?.analyzed.length ?? 0) + (evtData?.unanalyzed.length ?? 0);
  // Comparison needs two events that actually have a #7d payload.
  const canCompare = (evtData?.analyzed.length ?? 0) >= 2;

  const unanalyzed = evtData?.unanalyzed ?? [];
  const kernelRemaining = unanalyzed.filter((u) => u.importance === 'KERNEL').length;
  const selectedChapter =
    evtData?.analyzed.find((a) => a.entityId === selectedEntityId)?.chapter ??
    unanalyzed.find((u) => u.id === selectedEntityId)?.chapter ??
    null;
  const etaLabel = formatEta(unanalyzed.length, t);

  if (isLoading) {
    return (
      <div className="ea-page">
        <div className="ea-empty">
          <div className="ea-spinner" />
        </div>
      </div>
    );
  }

  const importance = eventDetail?.eep.eventImportance;
  const isKernel = importance === 'KERNEL';
  const chapter = eventDetail?.chapter ?? null;

  return (
    <div className="ea-page" data-density="comfy">
      <div className="ea-body">
        {/* Left Panel */}
        <aside className="ea-left">
          {evtData && (
            <BatchEepPanel
              analyzedCount={evtData.analyzed.length}
              totalCount={totalCount}
              batchTask={batch.task}
              isBatchRunning={batch.running}
              batchError={batch.error}
              batchSummary={batch.summary}
              onTrigger={() => setConfirmBatchEep(true)}
              onDismissSummary={batch.dismiss}
              isPending={batch.pending}
              subset={{
                kernelRemaining,
                onBatchKernel: () =>
                  batch.start(
                    unanalyzed.filter((u) => u.importance === 'KERNEL').map((u) => u.id),
                  ),
                currentChapter: selectedChapter,
                onBatchChapter: () =>
                  batch.start(
                    unanalyzed.filter((u) => u.chapter === selectedChapter).map((u) => u.id),
                  ),
                checkMode,
                onToggleCheckMode: () => {
                  setCheckMode((v) => !v);
                  setCheckedIds(new Set());
                },
                checkedCount: checkedIds.size,
                onBatchChecked: () => batch.start([...checkedIds]),
                etaLabel,
              }}
            />
          )}

          <div className="ea-left-section">
            <div className="ea-search">
              <Search size={12} color="var(--fg-muted)" />
              <input
                type="text"
                placeholder={t('event.list.searchPlaceholder', { count: totalCount })}
                value={searchQuery}
                onChange={(e) => setSearchQuery(e.target.value)}
              />
            </div>
          </div>

          {evtData && (
            <EventGroupedList
              evtData={evtData}
              searchQuery={searchQuery}
              selectedEntityId={selectedEntityId}
              onSelect={(id) => setSelectedEntityId(id)}
              onGenerate={handleGenerate}
              generatingId={generatingId}
              justDoneIds={justDoneIds}
              checkMode={checkMode}
              checked={checkedIds}
              onToggleChecked={(id) =>
                setCheckedIds((prev) => {
                  const next = new Set(prev);
                  if (next.has(id)) next.delete(id);
                  else next.add(id);
                  return next;
                })
              }
            />
          )}
        </aside>

        {/* Content Area */}
        <div className="ea-content">
          <div className="ea-content-scroll">
            {selectedEntityId && (
              <div className="ea-detail-toolbar">
                <button
                  type="button"
                  className="ea-btn"
                  onClick={() => setSelectedEntityId(null)}
                >
                  <ArrowLeft size={12} /> {t('event.overview.backToOverview')}
                </button>
                <div className="ea-detail-toolbar-actions">
                  {eventDetail?.status === 'partial' && (
                    <button
                      type="button"
                      className="ea-btn ea-btn-warning"
                      disabled={retryFailedMutation.isPending}
                      onClick={() => retryFailedMutation.mutate(selectedEntityId)}
                    >
                      <RefreshCw size={12} /> {t('event.retryFailed')}
                    </button>
                  )}
                  {eventDetail && (
                    <>
                      <button
                        type="button"
                        className="ea-btn"
                        disabled={!canCompare}
                        title={canCompare ? undefined : t('event.compare.needTwo')}
                        onClick={() => setCompareOpen(true)}
                      >
                        <Columns2 size={12} /> {t('event.compare.entry')}
                      </button>
                      {bookId && (
                        <Link
                          to={`/books/${bookId}/graph?entity=${selectedEntityId}`}
                          className="ea-btn"
                        >
                          <ExternalLink size={12} /> {t('viewInGraph')}
                        </Link>
                      )}
                      <button
                        type="button"
                        className="ea-btn"
                        onClick={() => setConfirmRegenerate(true)}
                      >
                        <RefreshCw size={12} /> {t('regenerate')}
                      </button>
                    </>
                  )}
                </div>
              </div>
            )}
            {selectedEntityId && detailLoading ? (
              <div className="ea-empty">
                <div className="ea-spinner" />
              </div>
            ) : selectedEntityId && eventDetail ? (
              <>
                <div className="ea-detail-header">
                  <div className="ea-detail-titlerow">
                    <h1 className="ea-title">{eventDetail.title}</h1>
                    {importance && (
                      <span className={'ea-detail-imp ' + (isKernel ? 'kernel' : 'satellite')}>
                        {isKernel
                          ? t('event.importance.kernel')
                          : t('event.importance.satellite')}
                      </span>
                    )}
                  </div>
                  <div className="ea-detail-meta">
                    {chapter !== null && (
                      <span>{t('event.list.chapterShort', { n: chapter })}</span>
                    )}
                    {eventDetail.narrativeMode && (
                      <span>{t(`event.narrative.${eventDetail.narrativeMode}`)}</span>
                    )}
                    {importance && (
                      <span>
                        {isKernel
                          ? t('event.importance.kernelTagline')
                          : t('event.importance.satelliteTagline')}
                      </span>
                    )}
                    {eventDetail.status === 'partial' && (
                      <span className="ea-detail-partial">{t('event.partialBadge')}</span>
                    )}
                  </div>
                </div>
                <EventGuideRibbon surface="detail" />
                <EventAnalysisDetail
                  data={eventDetail}
                  causalVariant="stepped"
                  bookId={bookId}
                  onSelectEvent={(id) => setSelectedEntityId(id)}
                />
              </>
            ) : gen.task?.status === 'error' ? (
              <div className="ea-empty">
                <div className="ea-empty-icon error">
                  <AlertTriangle size={24} />
                </div>
                <h2 className="ea-empty-title">{t('analysisFailed')}</h2>
                <p className="ea-empty-sub">
                  {gen.task.error ? gen.task.error : t('triggerFailed')}
                </p>
                <button
                  type="button"
                  className="ea-btn"
                  onClick={() => {
                    gen.reset();
                    triggerMutation.reset();
                    setTriggerError(null);
                  }}
                >
                  <RefreshCw size={12} /> {tc('retry')}
                </button>
              </div>
            ) : gen.taskId && gen.task && gen.task.status !== 'done' ? (
              <div className="ea-empty">
                <div className="ea-spinner" />
                <p className="ea-empty-title" style={{ fontSize: 'var(--font-size-base)' }}>
                  {selectedUnanalyzed?.name ?? t('event.generating.title')}
                </p>
                <span className="ea-stage-chip">
                  <span className="ea-mini-spinner" />
                  {t('event.generating.stage', {
                    stage: gen.task.stage || t('analyzing'),
                    progress: gen.task.progress ?? 0,
                  })}
                </span>
              </div>
            ) : selectedUnanalyzed ? (
              <div className="ea-unanalyzed">
                <div className="ea-unanalyzed-meta">
                  <span className="ea-imp unknown" title={t('event.overview.undetermined')}>
                    ·
                  </span>
                  {selectedUnanalyzed.chapter != null && (
                    <span>
                      {t('event.list.chapterShort', { n: selectedUnanalyzed.chapter })}
                    </span>
                  )}
                  {selectedUnanalyzed.narrativeMode && (
                    <>
                      <span className="sep" />
                      <span>{t(`event.narrative.${selectedUnanalyzed.narrativeMode}`)}</span>
                    </>
                  )}
                </div>
                <h1 className="ea-unanalyzed-title">{selectedUnanalyzed.name}</h1>
                <p className="ea-unanalyzed-sub">{t('event.empty.unanalyzedSubtitle')}</p>

                <div className="ea-source">
                  <div className="ea-source-head">
                    <BookOpen size={13} />
                    <span>{t('event.source.title')}</span>
                  </div>
                  {sourceLoading && (
                    <p className="ea-source-empty">{t('analyzing')}</p>
                  )}
                  {!sourceLoading && (sourceData?.passages?.length ?? 0) === 0 && (
                    <p className="ea-source-empty">{t('event.source.empty')}</p>
                  )}
                  {!sourceLoading &&
                    sourceData?.passages?.map((p) => (
                      <div key={p.id} className="ea-source-passage">
                        <div className="ea-source-meta">
                          {p.chapterNumber !== null &&
                            p.chapterNumber !== undefined &&
                            t('event.list.chapterShort', { n: p.chapterNumber })}
                          <span className="ea-source-score">
                            {t('event.source.similarity', { score: p.score.toFixed(2) })}
                          </span>
                        </div>
                        <p className="ea-source-text">{p.text}</p>
                      </div>
                    ))}
                  <p className="ea-source-caveat">{t('event.source.caveat')}</p>
                </div>

                <button
                  type="button"
                  className="ea-btn ea-btn-primary"
                  onClick={() => handleGenerate(selectedUnanalyzed.id)}
                  disabled={triggerMutation.isPending}
                >
                  <Sparkles size={12} /> {t('event.empty.createBtn')}
                </button>
              </div>
            ) : triggerError ? (
              <div className="ea-empty">
                <div className="ea-empty-icon error">
                  <AlertTriangle size={24} />
                </div>
                <p className="ea-empty-sub" style={{ color: 'var(--color-error)' }}>
                  {triggerError}
                </p>
                <button type="button" className="ea-btn" onClick={() => setTriggerError(null)}>
                  {tc('confirm')}
                </button>
              </div>
            ) : evtData && bookId ? (
              <EventOverviewLanding
                bookId={bookId}
                evtData={evtData}
                onSelectEvent={(id) => setSelectedEntityId(id)}
                onGenerate={handleGenerate}
                generatingId={generatingId}
                onBatchAll={() => setConfirmBatchEep(true)}
                isBatchRunning={batch.running}
              />
            ) : (
              // Only reached if the #6b list query itself failed (isLoading
              // already gates the loading state above).
              <div className="ea-empty">
                <div className="ea-empty-icon error">
                  <AlertTriangle size={22} />
                </div>
                <p className="ea-empty-sub">{t('event.empty.subtitle')}</p>
              </div>
            )}
          </div>

          {/* Toast */}
          {toastVisible && batch.summary && (
            <div className="ea-toast" role="status">
              <div className="ea-toast-icon">
                <Check size={18} strokeWidth={2.2} />
              </div>
              <div className="ea-toast-main">
                <div className="ea-toast-title">{t('batch.toastTitle')}</div>
                <div className="ea-toast-body">
                  {t('batch.toastBody', {
                    generated:
                      batch.summary.progress - batch.summary.skipped - batch.summary.failed,
                    skipped: batch.summary.skipped,
                    failed: batch.summary.failed,
                  })}
                </div>
              </div>
              <button
                type="button"
                className="ea-toast-close"
                onClick={() => setToastVisible(false)}
                aria-label={t('batch.toastClose')}
              >
                <X size={12} />
              </button>
            </div>
          )}
        </div>
      </div>

      {bookId && evtData && (
        <EventCompareDrawer
          open={compareOpen}
          bookId={bookId}
          analyzed={evtData.analyzed}
          initialA={selectedEntityId}
          onClose={() => setCompareOpen(false)}
        />
      )}

      <ConfirmDialog
        open={confirmRegenerate}
        title={t('regenerateTitle')}
        message={t('regenerateMessage')}
        onConfirm={() => {
          setConfirmRegenerate(false);
          // `mode: 'full'` already forces a re-analysis server-side and only
          // overwrites the cache once the new result lands, so deleting first
          // would just throw away the old EEP if the run then fails.
          if (selectedEntityId && bookId) triggerMutation.mutate(selectedEntityId);
        }}
        onCancel={() => setConfirmRegenerate(false)}
      />

      <ConfirmDialog
        open={confirmBatchEep}
        title={t('event.batchTitle')}
        message={t('event.batchMessage', { count: evtData?.unanalyzed.length ?? 0 })}
        confirmLabel={t('event.batchConfirm')}
        onConfirm={() => {
          setConfirmBatchEep(false);
          batch.start(undefined);
        }}
        onCancel={() => setConfirmBatchEep(false)}
      />
    </div>
  );
}
