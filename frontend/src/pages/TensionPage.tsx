import { useCallback, useEffect, useMemo, useState } from 'react';
import { useNavigate, useParams } from 'react-router-dom';
import { useQuery, useQueryClient, useMutation } from '@tanstack/react-query';
import { useTranslation } from 'react-i18next';
import { useChatContext } from '@/contexts/ChatContext';
import { useBook } from '@/hooks/useBook';
import {
  triggerTensionAnalysis,
  fetchTensionAnalysisTask,
  fetchTensionLines,
  fetchTEUs,
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
  type TensionStageSpec,
} from '@/components/tension/TensionStepperStrip';
import { TensionThemeHero } from '@/components/tension/TensionThemeHero';
import {
  TensionEmptyCard,
  TensionErrorCard,
  TensionRunningCard,
  TensionStep1Card,
} from '@/components/tension/TensionStateCards';
import { TensionTrajectoryDashboard } from '@/components/tension/TensionTrajectoryDashboard';
import { TensionReviewToolbar } from '@/components/tension/TensionReviewToolbar';
import { TensionLineTable } from '@/components/tension/TensionLineTable';
import { TensionReviewDrawer } from '@/components/tension/TensionReviewDrawer';
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
  const navigate = useNavigate();
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
  const [editing, setEditing] = useState(false);
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

  const { data: teus = [] } = useQuery({
    queryKey: ['books', bookId, 'tension', 'teus'],
    queryFn: () => fetchTEUs(bookId!),
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
  // TEU intensities are a different distribution from the line averages; the
  // drawer's per-TEU evidence bars have to rank against their own kind.
  const teuIntensities = useMemo(
    () => lines.flatMap((l) => (l.teus ?? []).map((teu) => teu.intensity)),
    [lines],
  );

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

  const openLine = useMemo(
    () => filteredLines.find((l) => l.id === focusedId) ?? null,
    [filteredLines, focusedId],
  );
  const openIndex = openLine ? filteredLines.indexOf(openLine) : -1;

  const saveLabelsMutation = useMutation({
    mutationFn: ({ id, a, b, note }: { id: string; a: string; b: string; note: string }) =>
      reviewTensionLine(id, bookId!, 'modified', a, b, note || undefined),
    onSuccess: () => {
      setEditing(false);
      onLineReviewed();
    },
  });

  const openChapter = useCallback(
    (chapter: number) => {
      // Chapter-level only: a TEU carries no chunk anchor, so the reader can be
      // pointed at the chapter but not at the paragraph the quote came from.
      navigate(`/books/${bookId}`, { state: { chapterNumber: chapter } });
    },
    [navigate, bookId],
  );

  // Review shortcuts. Deliberately scoped: no modifier combos (those belong to
  // the browser) and nothing fires while a text field has focus, or typing a
  // pole label would review the line instead.
  useEffect(() => {
    if (!hasLines) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.metaKey || e.ctrlKey || e.altKey) return;
      const el = e.target as HTMLElement | null;
      const typing = !!el && (el.tagName === 'INPUT' || el.tagName === 'TEXTAREA');
      if (typing) {
        if (e.key === 'Escape') setEditing(false);
        return;
      }
      const rows = filteredLines;
      if (rows.length === 0) return;
      const cur = openIndex >= 0 ? openIndex : 0;
      const key = e.key.toLowerCase();

      if (key === 'escape') {
        setEditing(false);
        setFocusedId(null);
        setSelected(new Set());
      } else if (key === 'j') {
        e.preventDefault();
        setEditing(false);
        setFocusedId(rows[Math.min(cur + 1, rows.length - 1)].id);
      } else if (key === 'k') {
        e.preventDefault();
        setEditing(false);
        setFocusedId(rows[Math.max(cur - 1, 0)].id);
      } else if (key === 'a') {
        e.preventDefault();
        reviewMutation.mutate({ id: rows[cur].id, status: 'approved' });
      } else if (key === 'x') {
        e.preventDefault();
        reviewMutation.mutate({ id: rows[cur].id, status: 'rejected' });
      } else if (key === 'e') {
        e.preventDefault();
        setFocusedId(rows[cur].id);
        setEditing(true);
      } else if (key === ' ') {
        e.preventDefault();
        toggleSelect(rows[cur].id);
      } else if (key === 'v') {
        e.preventDefault();
        toggleAll();
      }
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [hasLines, filteredLines, openIndex, reviewMutation, toggleSelect, toggleAll]);

  const reviewedCount = lines.filter(
    (l) => l.review_status === 'approved' || l.review_status === 'modified',
  ).length;
  const unreviewedCount = lines.length - reviewedCount;
  const orphanCount = teus.filter((teu) => teu.line_id === null).length;
  const themeReady = hasLines && unreviewedCount === 0;

  const teuChapterCounts = useMemo(() => {
    const byChapter = new Map<number, number>();
    for (const teu of teus) byChapter.set(teu.chapter, (byChapter.get(teu.chapter) ?? 0) + 1);
    return [...byChapter.entries()].sort((a, b) => a[0] - b[0]) as [number, number][];
  }, [teus]);

  // Lines cached before provenance existed have no timestamp; show the version
  // alone rather than inventing a time.
  const lineProvenance = useMemo(() => {
    const first = lines[0];
    if (!first) return null;
    const at = first.assembled_at ? new Date(first.assembled_at).toLocaleString() : null;
    return at ? `${first.assembled_by} · ${at}` : first.assembled_by;
  }, [lines]);

  const stages: TensionStageSpec[] = [
    {
      id: 'teu',
      kind: 'machine',
      kicker: t('tension.stage.scopeScene'),
      title: t('tension.stage.teuTitle'),
      note: analyzeOp.running
        ? t('tension.stage.teuRunning', { progress: analyzeOp.task?.progress ?? 0 })
        : analyzeResult
          ? t('tension.stage.teuDone', {
              assembled: analyzeResult.assembled ?? 0,
              candidates: analyzeResult.candidates ?? 0,
            })
          : hasTeus
            ? t('tension.stage.teuDone', { assembled: teus.length, candidates: teus.length })
            : t('tension.stage.teuIdle'),
      done: hasTeus && !analyzeOp.running,
      running: analyzeOp.running,
      failed: !!analyzeOp.error,
      progress: analyzeOp.task?.progress ?? 0,
      error: analyzeOp.error,
    },
    {
      id: 'review-teu',
      kind: 'gate',
      kicker: t('tension.stage.gate'),
      title: hasTeus
        ? t('tension.stage.reviewTeuTitle', { count: teus.length })
        : t('tension.stage.reviewTeuTitle', { count: 0 }),
      // Orphans are the whole point of this gate: grouping drops TEUs silently,
      // so an unconfirmed count here is the only warning the user gets.
      note: !hasTeus
        ? t('tension.stage.reviewTeuWaiting')
        : orphanCount > 0
          ? t('tension.stage.reviewTeuOrphans', { count: orphanCount })
          : t('tension.stage.reviewTeuClean'),
      noteWarning: orphanCount > 0,
      done: hasTeus && orphanCount === 0,
      notReady: !hasTeus,
    },
    {
      id: 'group',
      kind: 'machine',
      kicker: t('tension.stage.scopeCross'),
      title: t('tension.stage.groupTitle'),
      note: groupOp.running
        ? t('tension.stage.groupRunning', { progress: groupOp.task?.progress ?? 0 })
        : groupOp.error
          ? t('tension.stage.groupFailed')
          : hasLines
            ? t('tension.stage.groupDone', { count: lines.length })
            : t('tension.stage.groupIdle'),
      done: hasLines && !groupOp.running && !groupOp.error,
      running: groupOp.running,
      failed: !!groupOp.error,
      progress: groupOp.task?.progress ?? 0,
      error: groupOp.error,
    },
    {
      id: 'review-lines',
      kind: 'gate',
      kicker: t('tension.stage.gate'),
      title: t('tension.stage.reviewLinesTitle'),
      note: hasLines
        ? t('tension.stage.reviewLinesProgress', { done: reviewedCount, total: lines.length })
        : t('tension.stage.reviewLinesWaiting'),
      done: hasLines && unreviewedCount === 0,
      running: hasLines && reviewedCount > 0 && unreviewedCount > 0,
      progress: lines.length ? (reviewedCount / lines.length) * 100 : 0,
      notReady: !hasLines,
    },
    {
      id: 'theme',
      kind: 'machine',
      kicker: t('tension.stage.scopeBook'),
      title: t('tension.stage.themeTitle'),
      note: synthesizeOp.running
        ? t('tension.stage.themeRunning', { progress: synthesizeOp.task?.progress ?? 0 })
        : theme?.is_stale
          ? t('tension.stage.themeStale')
          : hasTheme
            ? t('tension.stage.themeDone')
            : !hasLines
              ? t('tension.stage.themeWaiting')
              : unreviewedCount > 0
                ? t('tension.stage.themeRemaining', { count: unreviewedCount })
                : t('tension.stage.themeReady'),
      done: hasTheme && !theme?.is_stale && !synthesizeOp.running,
      running: synthesizeOp.running,
      failed: !!synthesizeOp.error,
      // Soft gate: the action only appears once every line has been ruled on.
      // Nothing forbids synthesising early, but the page stops offering it.
      ready: themeReady && !hasTheme && !synthesizeOp.running,
      notReady: !hasLines || (!hasTheme && unreviewedCount > 0),
      progress: synthesizeOp.task?.progress ?? 0,
      error: synthesizeOp.error,
      actionLabel:
        themeReady && !hasTheme && !synthesizeOp.running
          ? t('tension.stage.synthesize')
          : undefined,
      onAction:
        themeReady && !hasTheme && !synthesizeOp.running ? () => runStep(3, false) : undefined,
    },
  ];

  // A completed step's CTA is a re-run: it costs an LLM call and overwrites the
  // existing result, so it goes through a confirmation rather than firing on click.
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
    <div className="tn-shell" style={{ background: 'var(--bg-primary)', height: '100%' }}>
      <div className="tn-shell-main tn-scroll">
        <div className="tn-page">
        <TensionStepperStrip stages={stages} />

        {linesLoading || themeLoading ? <LoadingSpinner /> : null}

        {!linesLoading && !themeLoading && !hasTeus && !analyzeOp.running && (
          <TensionEmptyCard onStart={() => runStep(1, false)} />
        )}

        {analyzeOp.running && (
          <TensionRunningCard
            title={t('tension.state.analyzeRunningTitle')}
            progress={analyzeOp.task?.progress ?? 0}
            stage={analyzeOp.task?.stage ?? null}
          />
        )}

        {/* The error card is inserted above the previous result rather than
            replacing it: a failed re-run leaves the last good grouping intact,
            and hiding it would suggest the work was lost. */}
        {groupOp.error && (
          <TensionErrorCard
            title={t('tension.state.groupErrorTitle')}
            message={
              hasLines
                ? t('tension.state.groupErrorBody', { error: groupOp.error, count: lines.length })
                : t('tension.state.groupErrorBodyNoPrev', { error: groupOp.error })
            }
            retryLabel={t('tension.state.retryGroup')}
            onRetry={() => runStep(2, true)}
            meta={lineProvenance}
          />
        )}

        {groupOp.running && (
          <TensionRunningCard
            title={t('tension.state.groupRunningTitle')}
            progress={groupOp.task?.progress ?? 0}
            stage={groupOp.task?.stage ?? null}
          />
        )}

        {hasTeus && !hasLines && !groupOp.running && !groupOp.error && (
          <TensionStep1Card
            teuCount={teus.length}
            chapterCounts={teuChapterCounts}
            onGroup={() => runStep(2, false)}
          />
        )}

        {synthesizeOp.running && (
          <TensionRunningCard
            title={t('tension.state.themeRunningTitle')}
            progress={synthesizeOp.task?.progress ?? 0}
            stage={synthesizeOp.task?.stage ?? null}
          />
        )}

        {theme && (
          <TensionThemeHero
            theme={theme}
            onApprove={() => themeReviewMutation.mutate({ status: 'approved' })}
            onReject={() => themeReviewMutation.mutate({ status: 'rejected' })}
            onModify={(prop) => themeReviewMutation.mutate({ status: 'modified', proposition: prop })}
            pending={themeReviewMutation.isPending}
          />
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
                onEditLabels={(id) => {
                  setFocusedId(id);
                  setEditing(true);
                }}
                onShowAll={() => setStatusFilter('all')}
              />

              <div className="tn-shortcuts">
                <span>{t('tension.table.shortcuts')}</span>
              </div>
            </section>
          </>
        )}
        </div>
      </div>

      {openLine && (
        <TensionReviewDrawer
          line={openLine}
          position={{ index: openIndex + 1, total: filteredLines.length }}
          teuIntensities={teuIntensities}
          editing={editing}
          onStartEdit={() => setEditing(true)}
          onCancelEdit={() => setEditing(false)}
          onSaveLabels={(a, b, note) =>
            saveLabelsMutation.mutate({ id: openLine.id, a, b, note })
          }
          onReview={(status) => reviewMutation.mutate({ id: openLine.id, status })}
          onClose={() => {
            setEditing(false);
            setFocusedId(null);
          }}
          onOpenChapter={openChapter}
        />
      )}

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
