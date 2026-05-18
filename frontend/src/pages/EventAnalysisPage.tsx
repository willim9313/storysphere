import { useState, useEffect, useRef } from 'react';
import { useParams, Link } from 'react-router-dom';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import {
  Search,
  AlertTriangle,
  RefreshCw,
  Sparkles,
  ExternalLink,
  Check,
  X,
  BookOpen,
} from 'lucide-react';
import { useTranslation } from 'react-i18next';
import { useChatContext } from '@/contexts/ChatContext';
import { useBook } from '@/hooks/useBook';
import { useEventAnalysis } from '@/hooks/useEventAnalysis';
import {
  triggerEventAnalysis,
  deleteEventAnalysis,
  triggerBatchEventAnalysis,
  fetchEventAnalysisDetail,
} from '@/api/analysis';
import { BatchEepPanel } from '@/components/analysis/BatchEepPanel';
import { EventAnalysisDetail } from '@/components/analysis/EventAnalysisDetail';
import {
  EventAnalyzedItem,
  EventUnanalyzedItem,
} from '@/components/analysis/EventListItems';
import { ConfirmDialog } from '@/components/ui/ConfirmDialog';
import { useTaskPolling } from '@/hooks/useTaskPolling';
import type { BatchEepResult, AnalysisItem } from '@/api/types';
import '@/styles/event-analysis.css';

export default function EventAnalysisPage() {
  const queryClient = useQueryClient();
  const { bookId } = useParams<{ bookId: string }>();
  const { setPageContext } = useChatContext();
  const { data: book } = useBook(bookId);
  const [searchQuery, setSearchQuery] = useState('');
  const [selectedEntityId, setSelectedEntityId] = useState<string | null>(null);
  const [confirmRegenerate, setConfirmRegenerate] = useState(false);
  const [generateTaskId, setGenerateTaskId] = useState<string | null>(null);
  const [generatingId, setGeneratingId] = useState<string | null>(null);
  const [triggerError, setTriggerError] = useState<string | null>(null);
  const [justDoneIds, setJustDoneIds] = useState<Set<string>>(new Set());
  const justDoneTimers = useRef<Map<string, ReturnType<typeof setTimeout>>>(new Map());
  const { t } = useTranslation('analysis');
  const { t: tc } = useTranslation('common');

  const [confirmBatchEep, setConfirmBatchEep] = useState(false);
  const [batchTaskId, setBatchTaskId] = useState<string | null>(null);
  const [batchError, setBatchError] = useState<string | null>(null);
  const [batchSummary, setBatchSummary] = useState<BatchEepResult | null>(null);
  const [prevBatchProgress, setPrevBatchProgress] = useState(0);
  const [toastVisible, setToastVisible] = useState(false);

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

  const { data: eventDetail, isLoading: detailLoading } = useQuery({
    queryKey: ['books', bookId, 'events', selectedEntityId, 'analysis'],
    queryFn: () => fetchEventAnalysisDetail(bookId!, selectedEntityId!),
    enabled: !!bookId && !!selectedEntityId,
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
      setGenerateTaskId(data.taskId);
    },
    onError: () => {
      setGeneratingId(null);
      setTriggerError(t('triggerFailed'));
    },
  });

  const handleGenerate = (id: string) => {
    setGeneratingId(id);
    setSelectedEntityId(id);
    triggerMutation.mutate(id);
  };

  const { data: genTask } = useTaskPolling(generateTaskId);

  useEffect(() => {
    if (genTask?.status === 'done') {
      queryClient.invalidateQueries({ queryKey: ['books', bookId, 'analysis', 'events'] });
      queryClient.invalidateQueries({
        queryKey: ['books', bookId, 'events', selectedEntityId, 'analysis'],
      });
      if (generatingId) markJustDone(generatingId);
      setGenerateTaskId(null);
      setGeneratingId(null);
    }
  }, [genTask?.status, bookId, selectedEntityId, queryClient, generatingId]);

  const batchMutation = useMutation({
    mutationFn: () => triggerBatchEventAnalysis(bookId!),
    onSuccess: (data) => {
      setBatchError(null);
      setBatchSummary(null);
      setPrevBatchProgress(0);
      setBatchTaskId(data.taskId);
    },
    onError: () => setBatchError(t('batchTriggerFailed')),
  });

  const { data: batchTask } = useTaskPolling(batchTaskId);
  const isBatchRunning =
    !!batchTaskId &&
    !!batchTask &&
    batchTask.status !== 'done' &&
    batchTask.status !== 'error';

  useEffect(() => {
    if (!batchTask?.result) return;
    const result = batchTask.result as BatchEepResult;
    if (result.progress > prevBatchProgress) {
      setPrevBatchProgress(result.progress);
      queryClient.invalidateQueries({ queryKey: ['books', bookId, 'analysis', 'events'] });
    }
  }, [batchTask?.result, prevBatchProgress, bookId, queryClient]);

  useEffect(() => {
    if (batchTask?.status === 'done') {
      queryClient.invalidateQueries({ queryKey: ['books', bookId, 'analysis', 'events'] });
      const result = batchTask.result as BatchEepResult;
      setBatchSummary(result);
      setBatchTaskId(null);
      setToastVisible(true);
    } else if (batchTask?.status === 'error') {
      setBatchError(batchTask.error ?? t('batchTriggerFailed'));
      setBatchTaskId(null);
    }
  }, [batchTask?.status, batchTask?.result, batchTask?.error, bookId, queryClient, t]);

  // Auto-dismiss toast after 5s
  useEffect(() => {
    if (!toastVisible) return;
    const timer = setTimeout(() => setToastVisible(false), 5000);
    return () => clearTimeout(timer);
  }, [toastVisible]);

  const selectedUnanalyzed = evtData?.unanalyzed.find((u) => u.id === selectedEntityId);

  const filterFn = (name: string) =>
    !searchQuery || name.toLowerCase().includes(searchQuery.toLowerCase());
  const filteredAnalyzed: AnalysisItem[] =
    evtData?.analyzed.filter((a) => filterFn(a.title)) ?? [];
  const filteredUnanalyzed = evtData?.unanalyzed.filter((u) => filterFn(u.name)) ?? [];
  const totalCount = (evtData?.analyzed.length ?? 0) + (evtData?.unanalyzed.length ?? 0);

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
  const chunk = eventDetail?.chunk ?? null;

  return (
    <div className="ea-page" data-density="comfy">
      <div className="ea-body">
        {/* Left Panel */}
        <aside className="ea-left">
          {evtData && (
            <BatchEepPanel
              analyzedCount={evtData.analyzed.length}
              totalCount={totalCount}
              batchTask={batchTask}
              isBatchRunning={isBatchRunning}
              batchError={batchError}
              batchSummary={batchSummary}
              onTrigger={() => setConfirmBatchEep(true)}
              onDismissSummary={() => setBatchSummary(null)}
              isPending={batchMutation.isPending}
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

          <div className="ea-list">
            {filteredAnalyzed.length > 0 && (
              <div className="ea-list-group">
                <div className="ea-list-group-head">
                  <span>{t('analyzed')}</span>
                  <span className="count">{filteredAnalyzed.length}</span>
                </div>
                {filteredAnalyzed.map((item) => (
                  <EventAnalyzedItem
                    key={item.id}
                    item={item}
                    isSelected={selectedEntityId === item.entityId}
                    onSelect={() => setSelectedEntityId(item.entityId)}
                    justDone={justDoneIds.has(item.entityId)}
                    showImportance
                    showNarrative
                  />
                ))}
              </div>
            )}
            {filteredUnanalyzed.length > 0 && (
              <div className="ea-list-group">
                <div className="ea-list-group-head">
                  <span>{t('notAnalyzed')}</span>
                  <span className="count">{filteredUnanalyzed.length}</span>
                </div>
                {filteredUnanalyzed.map((item) => (
                  <EventUnanalyzedItem
                    key={item.id}
                    item={item}
                    isSelected={selectedEntityId === item.id}
                    onSelect={() => setSelectedEntityId(item.id)}
                    onGenerate={() => handleGenerate(item.id)}
                    isGenerating={generatingId === item.id}
                    showImportance
                    showNarrative
                  />
                ))}
              </div>
            )}
            {filteredAnalyzed.length === 0 && filteredUnanalyzed.length === 0 && (
              <p className="ea-list-empty">
                {searchQuery
                  ? t('event.list.searchPlaceholder', { count: totalCount })
                  : t('notAnalyzed')}
              </p>
            )}
          </div>
        </aside>

        {/* Content Area */}
        <div className="ea-content">
          <div className="ea-content-scroll">
            {selectedEntityId && detailLoading ? (
              <div className="ea-empty">
                <div className="ea-spinner" />
              </div>
            ) : selectedEntityId && eventDetail ? (
              <>
                <div className="ea-titlebar">
                  <div className="ea-titlebar-main">
                    <h1 className="ea-title">{eventDetail.title}</h1>
                    {importance && (
                      <span className={'ea-title-imp ' + (isKernel ? 'kernel' : 'satellite')}>
                        <span className="ea-title-imp-letter">{isKernel ? 'K' : 'S'}</span>
                        {isKernel
                          ? t('event.importance.kernel')
                          : t('event.importance.satellite')}
                      </span>
                    )}
                    {(chapter !== null || chunk !== null) && (
                      <span className="ea-title-meta">
                        {chapter !== null && (
                          <span>{t('event.list.chapterShort', { n: chapter })}</span>
                        )}
                        {chapter !== null && chunk !== null && <span className="sep" />}
                        {chunk !== null && <span>Chunk {chunk}</span>}
                      </span>
                    )}
                    {bookId && selectedEntityId && (
                      <Link
                        to={`/books/${bookId}/graph?entity=${selectedEntityId}`}
                        className="ea-title-link"
                      >
                        {t('viewInGraph')} <ExternalLink size={10} />
                      </Link>
                    )}
                  </div>
                  <div className="ea-titlebar-actions">
                    <button
                      type="button"
                      className="ea-btn"
                      onClick={() => setConfirmRegenerate(true)}
                    >
                      <RefreshCw size={12} /> {t('regenerate')}
                    </button>
                  </div>
                </div>
                <EventAnalysisDetail data={eventDetail} causalVariant="stepped" />
              </>
            ) : genTask?.status === 'error' ? (
              <div className="ea-empty">
                <div className="ea-empty-icon error">
                  <AlertTriangle size={24} />
                </div>
                <h2 className="ea-empty-title">{t('analysisFailed')}</h2>
                <p className="ea-empty-sub">
                  {genTask.error ? genTask.error : t('triggerFailed')}
                </p>
                <button
                  type="button"
                  className="ea-btn"
                  onClick={() => {
                    setGenerateTaskId(null);
                    triggerMutation.reset();
                    setTriggerError(null);
                  }}
                >
                  <RefreshCw size={12} /> {tc('retry')}
                </button>
              </div>
            ) : generateTaskId && genTask && genTask.status !== 'done' ? (
              <div className="ea-empty">
                <div className="ea-spinner" />
                <p className="ea-empty-title" style={{ fontSize: 16 }}>
                  {selectedUnanalyzed?.name ?? t('event.generating.title')}
                </p>
                <span className="ea-stage-chip">
                  <span className="ea-mini-spinner" />
                  {t('event.generating.stage', {
                    stage: genTask.stage || t('analyzing'),
                    progress: genTask.progress ?? 0,
                  })}
                </span>
              </div>
            ) : selectedUnanalyzed ? (
              <div className="ea-empty">
                <h2 className="ea-empty-title">{selectedUnanalyzed.name}</h2>
                <p className="ea-empty-sub">{t('event.empty.unanalyzedSubtitle')}</p>
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
            ) : (
              <div className="ea-empty">
                <div className="ea-empty-icon">
                  <BookOpen size={22} />
                </div>
                <h2 className="ea-empty-title">{t('event.empty.title')}</h2>
                <p className="ea-empty-sub">{t('event.empty.subtitle')}</p>
              </div>
            )}
          </div>

          {/* Toast */}
          {toastVisible && batchSummary && (
            <div className="ea-toast" role="status">
              <div className="ea-toast-icon">
                <Check size={18} strokeWidth={2.2} />
              </div>
              <div className="ea-toast-main">
                <div className="ea-toast-title">{t('batch.toastTitle')}</div>
                <div className="ea-toast-body">
                  {t('batch.toastBody', {
                    generated:
                      batchSummary.progress - batchSummary.skipped - batchSummary.failed,
                    skipped: batchSummary.skipped,
                    failed: batchSummary.failed,
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

      <ConfirmDialog
        open={confirmRegenerate}
        title={t('regenerateTitle')}
        message={t('regenerateMessage')}
        onConfirm={() => {
          setConfirmRegenerate(false);
          if (selectedEntityId && bookId) {
            deleteEventAnalysis(bookId, selectedEntityId).then(() => {
              queryClient.invalidateQueries({
                queryKey: ['books', bookId, 'analysis', 'events'],
              });
              triggerMutation.mutate(selectedEntityId);
            });
          }
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
          batchMutation.mutate();
        }}
        onCancel={() => setConfirmBatchEep(false)}
      />
    </div>
  );
}
