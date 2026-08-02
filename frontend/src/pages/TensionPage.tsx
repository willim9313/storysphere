import { useCallback, useEffect, useMemo, useState } from 'react';
import { useParams } from 'react-router-dom';
import { useQuery, useQueryClient, useMutation } from '@tanstack/react-query';
import { useTranslation } from 'react-i18next';
import { Zap } from 'lucide-react';
import { useChatContext } from '@/contexts/ChatContext';
import { useBook } from '@/hooks/useBook';
import {
  triggerTensionAnalysis,
  fetchTensionAnalysisTask,
  fetchTensionLines,
  triggerGroupTensionLines,
  fetchGroupTensionLinesTask,
  triggerSynthesizeTensionTheme,
  fetchSynthesizeThemeTask,
  fetchTensionTheme,
  reviewTensionLine,
  reviewTensionTheme,
} from '@/api/tension';
import { ConfirmDialog } from '@/components/ui/ConfirmDialog';
import { LoadingSpinner } from '@/components/ui/LoadingSpinner';
import {
  TensionStepperStrip,
  type TensionStepSpec,
} from '@/components/tension/TensionStepperStrip';
import { TensionThemeHero } from '@/components/tension/TensionThemeHero';
import { TensionOnboardingHero } from '@/components/tension/TensionOnboardingHero';
import { TensionTrajectoryDashboard } from '@/components/tension/TensionTrajectoryDashboard';
import { TensionReviewToolbar } from '@/components/tension/TensionReviewToolbar';
import { TensionLineTable } from '@/components/tension/TensionLineTable';
import {
  countByFilter,
  sortLines,
  type ReviewFilter,
  type ReviewSort,
} from '@/components/tension/reviewTypes';
import { useTensionTask } from '@/components/tension/hooks/useTensionTask';
import '@/styles/tension.css';

export default function TensionPage() {
  const queryClient = useQueryClient();
  const { bookId } = useParams<{ bookId: string }>();
  const { setPageContext } = useChatContext();
  const { data: book } = useBook(bookId);
  const { t } = useTranslation('analysis');

  useEffect(() => {
    if (book) setPageContext({ page: 'analysis', bookId: bookId!, bookTitle: book.title });
    return () => setPageContext({ page: 'other' });
  }, [book, bookId, setPageContext]);

  const [analyzeResult, setAnalyzeResult] = useState<Record<string, number> | null>(null);
  const [statusFilter, setStatusFilter] = useState<ReviewFilter>('all');
  const [sort, setSort] = useState<ReviewSort>('intensity');
  const [selected, setSelected] = useState<Set<string>>(new Set());
  const [focusedId, setFocusedId] = useState<string | null>(null);
  const [confirmStep, setConfirmStep] = useState<1 | 2 | 3 | null>(null);

  const {
    data: lines = [],
    isLoading: linesLoading,
    refetch: refetchLines,
  } = useQuery({
    queryKey: ['books', bookId, 'tension', 'lines'],
    queryFn: () => fetchTensionLines(bookId!),
    enabled: !!bookId,
  });

  const {
    data: theme,
    isLoading: themeLoading,
    refetch: refetchTheme,
  } = useQuery({
    queryKey: ['books', bookId, 'tension', 'theme'],
    queryFn: () => fetchTensionTheme(bookId!),
    enabled: !!bookId,
    retry: false,
  });

  const analyzeOp = useTensionTask(
    fetchTensionAnalysisTask,
    (task) => setAnalyzeResult(task.result as Record<string, number>),
    t('tension.errors.analysisFailed'),
  );
  const groupOp = useTensionTask(
    fetchGroupTensionLinesTask,
    () => refetchLines(),
    t('tension.errors.groupFailed'),
  );
  const synthesizeOp = useTensionTask(
    fetchSynthesizeThemeTask,
    () => refetchTheme(),
    t('tension.errors.synthFailed'),
  );

  // `force` has to be true to re-run a completed step: without it the backend
  // returns the cached result, reports success, and nothing changes.
  const runStep = useCallback(
    (key: 1 | 2 | 3, force: boolean) => {
      if (key === 1) {
        analyzeOp.trigger(
          () => triggerTensionAnalysis(bookId!, 'zh', force),
          t('tension.errors.triggerAnalysis'),
        );
      } else if (key === 2) {
        groupOp.trigger(
          () => triggerGroupTensionLines(bookId!, 'zh', force),
          t('tension.errors.triggerGroup'),
        );
      } else {
        synthesizeOp.trigger(
          () => triggerSynthesizeTensionTheme(bookId!, 'zh', force),
          t('tension.errors.triggerSynth'),
        );
      }
    },
    [bookId, analyzeOp, groupOp, synthesizeOp, t],
  );

  const onLineReviewed = () => {
    queryClient.invalidateQueries({ queryKey: ['books', bookId, 'tension', 'lines'] });
  };

  const themeReviewMutation = useMutation({
    mutationFn: ({
      status,
      proposition,
    }: {
      status: 'approved' | 'modified' | 'rejected';
      proposition?: string;
    }) => reviewTensionTheme(theme!.id, bookId!, status, proposition),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['books', bookId, 'tension', 'theme'] });
    },
  });

  const maxChapter = useMemo(
    () =>
      lines.reduce((m, l) => {
        const range = l.chapter_range ?? [];
        const ch = range[range.length - 1] ?? 0;
        return Math.max(m, ch);
      }, 1),
    [lines],
  );

  const hasLines = lines.length > 0;
  const hasTeus = analyzeResult !== null || hasLines;
  const hasTheme = !!theme;

  // One filter dimension only. The old page had status chips *and* a "hide
  // rejected" checkbox, which could contradict each other — selecting
  // "rejected 1" with the checkbox on listed nothing while the chip said one.
  const filteredLines = useMemo(
    () =>
      sortLines(
        statusFilter === 'all' ? lines : lines.filter((l) => l.review_status === statusFilter),
        sort,
      ),
    [lines, statusFilter, sort],
  );

  const filterCounts = useMemo(() => countByFilter(lines), [lines]);
  const allIntensities = useMemo(() => lines.map((l) => l.intensity_summary), [lines]);

  const reviewMutation = useMutation({
    mutationFn: ({ id, status }: { id: string; status: 'approved' | 'modified' | 'rejected' }) =>
      reviewTensionLine(id, bookId!, status),
    onSuccess: onLineReviewed,
  });

  const toggleSelect = useCallback((id: string) => {
    setSelected((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  }, []);

  const toggleAll = useCallback(() => {
    setSelected((prev) =>
      filteredLines.every((l) => prev.has(l.id))
        ? new Set<string>()
        : new Set(filteredLines.map((l) => l.id)),
    );
  }, [filteredLines]);

  const batchReview = useCallback(
    async (status: 'approved' | 'rejected') => {
      // Sequential, not Promise.all: every call rewrites the same cached
      // `tension_lines:{doc}` blob, so concurrent writes would drop each other.
      for (const id of selected) {
        await reviewMutation.mutateAsync({ id, status });
      }
      setSelected(new Set());
    },
    [selected, reviewMutation],
  );

  const steps: TensionStepSpec[] = [
    {
      key: 1,
      label: t('tension.step1.label'),
      scope: t('tension.step1.scope'),
      desc: analyzeOp.running
        ? t('tension.step1.running', {
            stage: analyzeOp.task?.stage ?? '',
            progress: analyzeOp.task?.progress ?? 0,
          })
        : analyzeResult
          ? t('tension.step1.done', {
              assembled: analyzeResult.assembled ?? 0,
              candidates: analyzeResult.candidates ?? 0,
            })
          : t('tension.step1.desc'),
      done: hasTeus && !analyzeOp.running,
      running: analyzeOp.running,
      active: !hasTeus && !analyzeOp.running,
      progress: analyzeOp.task?.progress ?? 0,
      error: analyzeOp.error,
    },
    {
      key: 2,
      label: t('tension.step2.label'),
      scope: t('tension.step2.scope'),
      desc: groupOp.running
        ? t('tension.step2.running', { stage: groupOp.task?.stage ?? '' })
        : hasLines
          ? t('tension.step2.done', { count: lines.length })
          : t('tension.step2.desc'),
      done: hasLines && !groupOp.running,
      running: groupOp.running,
      active: hasTeus && !hasLines && !groupOp.running,
      disabled: !hasTeus,
      progress: groupOp.task?.progress ?? 0,
      error: groupOp.error,
    },
    {
      key: 3,
      label: t('tension.step3.label'),
      scope: t('tension.step3.scope'),
      desc: synthesizeOp.running
        ? t('tension.step3.running', { stage: synthesizeOp.task?.stage ?? '' })
        : hasTheme
          ? t('tension.step3.done')
          : !hasLines
            ? t('tension.step3.lock')
            : t('tension.step3.desc'),
      done: hasTheme && !synthesizeOp.running,
      running: synthesizeOp.running,
      active: hasLines && !hasTheme && !synthesizeOp.running,
      disabled: !hasLines,
      progress: synthesizeOp.task?.progress ?? 0,
      error: synthesizeOp.error,
    },
  ];

  // A completed step's CTA is a re-run: it costs an LLM call and overwrites the
  // existing result, so it goes through a confirmation rather than firing on click.
  const handleTrigger = (key: 1 | 2 | 3) => {
    if (steps.find((s) => s.key === key)?.done) setConfirmStep(key);
    else runStep(key, false);
  };

  const handleFocus = (id: string) => {
    setFocusedId(id);
    const el = document.getElementById(`tn-line-${id}`);
    if (el) {
      const rect = el.getBoundingClientRect();
      const scrollEl = el.closest('.tn-scroll') as HTMLElement | null;
      if (scrollEl) {
        scrollEl.scrollTo({
          top: scrollEl.scrollTop + rect.top - 80,
          behavior: 'smooth',
        });
      } else {
        window.scrollTo({ top: window.scrollY + rect.top - 80, behavior: 'smooth' });
      }
    }
  };

  return (
    <div
      className="tn-scroll"
      style={{ background: 'var(--bg-primary)', height: '100%', overflowY: 'auto' }}
    >
      <div className="tn-page">
        <TensionStepperStrip steps={steps} onTrigger={handleTrigger} />

        {hasLines || hasTheme ? (
          theme ? (
            <TensionThemeHero
              theme={theme}
              onApprove={() => themeReviewMutation.mutate({ status: 'approved' })}
              onReject={() => themeReviewMutation.mutate({ status: 'rejected' })}
              onModify={(prop) => themeReviewMutation.mutate({ status: 'modified', proposition: prop })}
              pending={themeReviewMutation.isPending}
            />
          ) : (
            <TensionOnboardingHero />
          )
        ) : linesLoading || themeLoading ? (
          <LoadingSpinner />
        ) : (
          <TensionOnboardingHero />
        )}

        {hasLines && (
          <>
            {/* Still the old trajectory chart; the chapter grid replaces it in
                a later step. It predates the generated response type, hence the
                defaults for fields that are optional on the wire. `hideRejected`
                is gone as a control — rejected rows now dim in the table
                instead, so the chart never hides anything. */}
            <TensionTrajectoryDashboard
              lines={lines}
              maxChapter={maxChapter}
              hideRejected={false}
              focusedId={focusedId}
              onFocus={handleFocus}
            />

            <section>
              <TensionReviewToolbar
                counts={filterCounts}
                filter={statusFilter}
                onFilterChange={setStatusFilter}
                sort={sort}
                onSortChange={setSort}
                selectedCount={selected.size}
                allSelected={
                  filteredLines.length > 0 && filteredLines.every((l) => selected.has(l.id))
                }
                onToggleAll={toggleAll}
                onBatchApprove={() => batchReview('approved')}
                onBatchReject={() => batchReview('rejected')}
                onClearSelection={() => setSelected(new Set())}
              />

              <TensionLineTable
                rows={filteredLines}
                allIntensities={allIntensities}
                totalCount={lines.length}
                selected={selected}
                openId={focusedId}
                cursorId={focusedId}
                onOpen={(id) => setFocusedId((prev) => (prev === id ? null : id))}
                onToggleSelect={toggleSelect}
                onToggleAll={toggleAll}
                onReview={(id, status) => reviewMutation.mutate({ id, status })}
                onEditLabels={(id) => setFocusedId(id)}
                onShowAll={() => setStatusFilter('all')}
              />

              <div className="tn-shortcuts">
                <span>{t('tension.table.shortcuts')}</span>
              </div>
            </section>
          </>
        )}

        {!hasLines && !linesLoading && !themeLoading && (
          <div className="tn-empty">
            <div className="tn-empty-icon">
              <Zap size={36} />
            </div>
            <div className="tn-empty-msg">{t('tension.empty')}</div>
            <div className="tn-empty-msg" style={{ marginTop: 4, opacity: 0.8 }}>
              {t('tension.emptyHint')}
            </div>
          </div>
        )}
      </div>

      <ConfirmDialog
        open={confirmStep !== null}
        title={t('tension.rerunTitle')}
        message={t('tension.rerunMessage')}
        confirmLabel={t('tension.rerunConfirm')}
        onConfirm={() => {
          if (confirmStep !== null) runStep(confirmStep, true);
          setConfirmStep(null);
        }}
        onCancel={() => setConfirmStep(null)}
      />
    </div>
  );
}
