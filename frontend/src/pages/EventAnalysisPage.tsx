import { useState, useEffect, useRef, useCallback } from 'react';
import { useParams, useLocation, useSearchParams, Link } from 'react-router-dom';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { Search, AlertTriangle, AlertCircle } from 'lucide-react';
import { Trans, useTranslation } from 'react-i18next';
import { useChatDispatch } from '@/contexts/ChatContext';
import { useToast } from '@/contexts/ToastContext';
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
import { NarrativeChip } from '@/components/analysis/EventListItems';
import { parseNarrativeMode } from '@/components/analysis/overview/eventTypes';
import { EventOverviewLanding } from '@/components/analysis/overview/EventOverviewLanding';
import { EventGroupedList } from '@/components/analysis/EventGroupedList';
import { EventCompareDrawer } from '@/components/analysis/EventCompareDrawer';
import { failureKind, isLlmUnconfigured, techDetailOf } from '@/api/failureKind';
import { GuidanceRibbon } from '@/components/ui/GuidanceRibbon';
import { LlmUnconfiguredNotice } from '@/components/ui/LlmUnconfiguredNotice';
import { PageFailure } from '@/components/ui/PageFailure';
import { Tooltip } from '@/components/ui/Tooltip';
import { ConfirmDialog } from '@/components/ui/ConfirmDialog';
import { useAsyncTask } from '@/hooks/useAsyncTask';
import { useBatchTask } from '@/hooks/useBatchTask';
import '@/styles/event-analysis.css';
import { qk } from '@/api/queryKeys';

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
  // A 503 carrying the app's own body = no LLM provider configured (shown in place).
  const [llmBlocked, setLlmBlocked] = useState(false);
  const [batchLlmBlocked, setBatchLlmBlocked] = useState(false);
  const [justDoneIds, setJustDoneIds] = useState<Set<string>>(new Set());
  const justDoneTimers = useRef<Map<string, ReturnType<typeof setTimeout>>>(new Map());
  const { t } = useTranslation('analysis');
  const { push } = useToast();
  const { t: tc } = useTranslation('common');
  const { t: tn } = useTranslation('nav');

  const [confirmBatchEep, setConfirmBatchEep] = useState(false);
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

  const { data: evtData, isLoading, error: listError, refetch: refetchList } = useEventAnalysis(bookId);

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
      queryClient.invalidateQueries({ queryKey: qk.analysis.events(bookId) });
      queryClient.invalidateQueries({
        queryKey: qk.event.analysis(bookId, selectedEntityId),
      });
      if (generatingId) markJustDone(generatingId);
      reset();
      setGeneratingId(null);
    },
  });

  const {
    data: eventDetail,
    isLoading: detailLoading,
    error: detailError,
    refetch: refetchDetail,
  } = useQuery({
    queryKey: qk.event.analysis(bookId, selectedEntityId),
    queryFn: () => fetchEventAnalysisDetail(bookId!, selectedEntityId!),
    enabled: !!bookId && !!selectedEntityId && !gen.taskId && isSelectedAnalyzed,
  });

  // #7i — retrieved source passages, only useful while the event is still
  // unanalyzed (that is the "is this worth spending LLM budget on" moment).
  const { data: sourceData, isLoading: sourceLoading } = useQuery({
    queryKey: qk.event.source(bookId, selectedEntityId),
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

  // Every token-spending trigger (建立, 覆蓋重新生成, 重試失敗部分) fails the same
  // way: 503 + the app's own body means no LLM provider. Say that in place;
  // anything else is the generic trigger failure.
  const onTriggerStart = () => {
    setTriggerError(null);
    setLlmBlocked(false);
  };
  const onTriggerFailed = (err: unknown) => {
    if (isLlmUnconfigured(err)) {
      setLlmBlocked(true);
      setTriggerError(null);
    } else {
      setTriggerError(t('triggerFailed'));
    }
  };

  const triggerMutation = useMutation({
    mutationFn: (id: string) => triggerEventAnalysis(bookId!, id),
    onMutate: onTriggerStart,
    onSuccess: (data) => gen.adopt(data.taskId),
    onError: (err) => {
      setGeneratingId(null);
      onTriggerFailed(err);
    },
  });

  // Retry only the failed parts of a partial result (reuses cached EEP).
  const retryFailedMutation = useMutation({
    mutationFn: (id: string) => triggerEventAnalysis(bookId!, id, 'retryFailed'),
    onMutate: onTriggerStart,
    onSuccess: (data) => gen.adopt(data.taskId),
    onError: onTriggerFailed,
  });

  const handleGenerate = (id: string) => {
    setGeneratingId(id);
    setSelectedEntityId(id);
    triggerMutation.mutate(id);
  };

  const refreshEvents = useCallback(
    () => queryClient.invalidateQueries({ queryKey: qk.analysis.events(bookId) }),
    [queryClient, bookId],
  );

  const batch = useBatchTask<string[]>({
    trigger: async (eventIds) => {
      setBatchLlmBlocked(false);
      try {
        return await triggerBatchEventAnalysis(bookId!, eventIds);
      } catch (err) {
        // useBatchTask only keeps a message, so the 503 distinction is made here.
        if (isLlmUnconfigured(err)) setBatchLlmBlocked(true);
        throw err;
      }
    },
    onProgress: refreshEvents,
    onDone: (summary) => {
      refreshEvents();
      if (!summary) return;
      // A run with failures persists: the toast only says how many, the named
      // list stays in BatchEepPanel — but five seconds is not long enough to
      // notice the count and go read it (B-113). Clean runs auto-dismiss.
      const hasFailures = (summary.failures?.length ?? 0) > 0;
      push({
        type: hasFailures ? 'warning' : 'success',
        title: t('batch.toastTitle'),
        body: t('batch.toastBody', {
          generated: summary.progress - summary.skipped - summary.failed,
          skipped: summary.skipped,
          failed: summary.failed,
        }),
        persist: hasFailures,
      });
    },
    failureMessage: t('batchTriggerFailed'),
  });

  const selectedUnanalyzed = evtData?.unanalyzed.find((u) => u.id === selectedEntityId);
  const unanalyzedMode = parseNarrativeMode(selectedUnanalyzed?.narrativeMode);

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

  const pageName = tn('tabs.eventAnalysis');
  const backToBook = (
    <Link to={`/books/${bookId}`} className="ss-btn ss-btn-md ss-btn-secondary">
      {t('character.error.backToBook')}
    </Link>
  );

  const importance = eventDetail?.eep.eventImportance;
  const isKernel = importance === 'KERNEL';
  const chapter = eventDetail?.chapter ?? null;
  const detailMode = parseNarrativeMode(eventDetail?.narrativeMode);
  const inDetail = !!(selectedEntityId && !detailLoading && eventDetail);

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
              batchError={batchLlmBlocked ? null : batch.error}
              batchSummary={batch.summary}
              onTrigger={() => setConfirmBatchEep(true)}
              llmBlocked={batchLlmBlocked}
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
            <div className="ea-content-inner">
            {llmBlocked && <LlmUnconfiguredNotice />}
            {selectedEntityId && !inDetail && (
              <div className="ea-detail-back-row">
                <button type="button" className="ea-detail-back" onClick={() => setSelectedEntityId(null)}>
                  ← {t('event.overview.backToOverview')}
                </button>
              </div>
            )}
            {selectedEntityId && detailLoading ? (
              <div className="ea-empty">
                <div className="ea-spinner" />
              </div>
            ) : selectedEntityId && eventDetail ? (
              <EventAnalysisDetail
                data={eventDetail}
                causalVariant="stepped"
                bookId={bookId}
                onSelectEvent={(id) => setSelectedEntityId(id)}
                header={
                  <>
                    <div className="ea-detail-titlerow">
                      <div className="ea-detail-titlegroup">
                        <button
                          type="button"
                          className="ea-detail-back"
                          onClick={() => setSelectedEntityId(null)}
                        >
                          ← {t('event.overview.backToOverview')}
                        </button>
                        <h1 className="ea-title">{eventDetail.title}</h1>
                        {importance && (
                          <span
                            className={'ss-badge ea-detail-imp ' + (isKernel ? 'kernel' : 'satellite')}
                          >
                            {isKernel
                              ? t('event.importance.kernel')
                              : t('event.importance.satellite')}
                          </span>
                        )}
                      </div>
                      <div className="ea-detail-actions">
                        {eventDetail.status === 'partial' && (
                          <button
                            type="button"
                            className="ss-btn ss-btn-sm ss-btn-secondary ss-btn-llm"
                            disabled={retryFailedMutation.isPending}
                            onClick={() => retryFailedMutation.mutate(selectedEntityId)}
                          >
                            {t('event.retryFailed')}
                          </button>
                        )}
                        <Tooltip label={t('event.compare.needTwo')} disabled={canCompare}>
                          <button
                            type="button"
                            className="ss-btn ss-btn-sm ss-btn-secondary"
                            disabled={!canCompare}
                            onClick={() => setCompareOpen(true)}
                          >
                            {t('event.compare.entry')}
                          </button>
                        </Tooltip>
                        {bookId && (
                          <Link
                            to={`/books/${bookId}/graph?entity=${selectedEntityId}`}
                            className="ss-btn ss-btn-sm ss-btn-ghost"
                          >
                            {t('viewInGraph')}
                          </Link>
                        )}
                        <button
                          type="button"
                          className="ss-btn ss-btn-sm ss-btn-secondary ss-btn-llm"
                          onClick={() => setConfirmRegenerate(true)}
                        >
                          {t('regenerate')}
                        </button>
                      </div>
                    </div>
                    <div className="ea-detail-meta">
                      {chapter !== null && (
                        <span className="ea-detail-meta-ch">
                          {t('event.list.chapterShort', { n: chapter })}
                        </span>
                      )}
                      {detailMode && <NarrativeChip mode={detailMode} />}
                      {importance && (
                        <span className="ea-detail-meta-imp">
                          {isKernel
                            ? t('event.importance.kernelTagline')
                            : t('event.importance.satelliteTagline')}
                        </span>
                      )}
                      {eventDetail.status === 'partial' && (
                        <span className="ss-badge ss-badge-warning">{t('event.partialBadge')}</span>
                      )}
                      {eventDetail.isStale && (
                        <Tooltip label={t('event.stale.tooltip')}>
                          <span className="ss-badge ss-badge-warning" tabIndex={0}>
                            {t('event.stale.badge')}
                          </span>
                        </Tooltip>
                      )}
                    </div>
                    <GuidanceRibbon surface="event-detail">
                      <strong>{t('event.guide.prefix')}</strong>{' '}
                      <Trans
                        i18nKey="event.guide.detail"
                        ns="analysis"
                        components={{ strong: <strong /> }}
                      />
                    </GuidanceRibbon>
                  </>
                }
              />
            ) : selectedEntityId && detailError && isSelectedAnalyzed ? (
              // The list says this event has a #7d payload but fetching it
              // failed. Without this branch the cascade falls through to the
              // overview landing, which reads as "the detail vanished" — the
              // shape a 500 from #7d took before it was found. A bare gateway
              // status (no app body) is a backend outage instead.
              failureKind(detailError) === 'backend' ? (
                <PageFailure
                  variant="backend"
                  pageName={pageName}
                  onRetry={() => void refetchDetail()}
                  techDetail={techDetailOf(detailError)}
                />
              ) : (
                <div className="ss-state ss-state-stage" role="alert">
                  <span className="ss-state-icon ss-state-icon-error">
                    <AlertCircle size={24} />
                  </span>
                  <h4 className="ss-state-title">{t('event.detailError.title')}</h4>
                  <p className="ss-state-text">{t('event.detailError.body')}</p>
                  <div className="ss-state-actions">
                    <button
                      type="button"
                      className="ss-btn ss-btn-sm ss-btn-primary"
                      onClick={() => void refetchDetail()}
                    >
                      {tc('retry')}
                    </button>
                  </div>
                </div>
              )
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
                  className="ss-btn ss-btn-md ss-btn-secondary"
                  onClick={() => {
                    gen.reset();
                    triggerMutation.reset();
                    setTriggerError(null);
                  }}
                >
                  {tc('retry')}
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
                  <Tooltip label={t('event.overview.undetermined')}>
                    <span className="ea-imp is-sm unknown">·</span>
                  </Tooltip>
                  {selectedUnanalyzed.chapter != null && (
                    <span>
                      {t('event.list.chapterShort', { n: selectedUnanalyzed.chapter })}
                    </span>
                  )}
                  {unanalyzedMode && <NarrativeChip mode={unanalyzedMode} />}
                  <span>
                    {t('notAnalyzed')} · {t('event.overview.undetermined')}
                  </span>
                </div>
                <h1 className="ea-unanalyzed-title">{selectedUnanalyzed.name}</h1>
                <p className="ea-unanalyzed-sub">{t('event.empty.unanalyzedSubtitle')}</p>

                <div className="ea-source">
                  <div className="ea-source-head">{t('event.source.title')}</div>
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

                <div className="ea-unanalyzed-cta">
                  <button
                    type="button"
                    className="ss-btn ss-btn-md ss-btn-primary ss-btn-llm"
                    onClick={() => handleGenerate(selectedUnanalyzed.id)}
                    disabled={triggerMutation.isPending}
                  >
                    {t('event.empty.createBtn')}
                  </button>
                  <span className="ea-token-hint">
                    <span className="ss-llm-glyph" aria-hidden="true" />
                    {t('tension.state.tokenHintShort')}
                  </span>
                </div>
              </div>
            ) : triggerError ? (
              <div className="ea-empty">
                <div className="ea-empty-icon error">
                  <AlertTriangle size={24} />
                </div>
                <p className="ea-empty-sub" style={{ color: 'var(--color-error)' }}>
                  {triggerError}
                </p>
                <button
                  type="button"
                  className="ss-btn ss-btn-md ss-btn-secondary"
                  onClick={() => setTriggerError(null)}
                >
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
              // already gated the loading state above).
              <PageFailure
                variant={failureKind(listError)}
                pageName={pageName}
                onRetry={() => void refetchList()}
                secondaryAction={backToBook}
                techDetail={techDetailOf(listError)}
              />
            )}
            </div>
          </div>

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
        spendsTokens
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
        spendsTokens
        onConfirm={() => {
          setConfirmBatchEep(false);
          batch.start(undefined);
        }}
        onCancel={() => setConfirmBatchEep(false)}
      />
    </div>
  );
}
