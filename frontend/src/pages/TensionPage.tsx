import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { Link, useNavigate, useParams } from 'react-router-dom';
import { useQuery, useQueryClient, useMutation } from '@tanstack/react-query';
import { Trans, useTranslation } from 'react-i18next';
import { useChatDispatch } from '@/contexts/ChatContext';
import { useBook } from '@/hooks/useBook';
import {
  triggerTensionAnalysis,
  fetchTensionAnalysisTask,
  fetchTensionLines,
  fetchTEUs,
  assignTEUToLine,
  triggerGroupTensionLines,
  fetchGroupTensionLinesTask,
  triggerSynthesizeTensionTheme,
  fetchSynthesizeThemeTask,
  fetchTensionTheme,
  reviewTensionLine,
  reviewTensionTheme,
} from '@/api/tension';
import { fetchBuildOverview } from '@/api/buildOverview';
import { ConfirmDialog } from '@/components/ui/ConfirmDialog';
import { LlmUnconfiguredNotice } from '@/components/ui/LlmUnconfiguredNotice';
import { LoadingSpinner } from '@/components/ui/LoadingSpinner';
import { PageFailure } from '@/components/ui/PageFailure';
import { ApiError } from '@/api/client';
import { failureKind, techDetailOf } from '@/api/failureKind';
import {
  TensionStepperStrip,
  type TensionStageSpec,
} from '@/components/tension/TensionStepperStrip';
import { GuidanceRibbon } from '@/components/ui/GuidanceRibbon';
import { TensionThemeHero } from '@/components/tension/TensionThemeHero';
import {
  TensionEmptyCard,
  TensionErrorCard,
  TensionFailureList,
  type TeuFailure,
  TensionRunningCard,
  TensionSoftGate,
  TensionStep1Card,
} from '@/components/tension/TensionStateCards';
import { assignFailureKind, isNoTheme, runSequentially } from '@/components/tension/tensionModel';
import { TensionChapterGrid } from '@/components/tension/TensionChapterGrid';
import { TensionTEUInspector } from '@/components/tension/TensionTEUInspector';
import { TensionReviewToolbar } from '@/components/tension/TensionReviewToolbar';
import { TensionLineTable } from '@/components/tension/TensionLineTable';
import { TensionReviewDrawer } from '@/components/tension/TensionReviewDrawer';
import {
  countByFilter,
  sortLines,
  type AssignApi,
  type ReviewFilter,
  type ReviewSort,
} from '@/components/tension/reviewTypes';
import { useTensionTask } from '@/components/tension/hooks/useTensionTask';
import '@/styles/tension.css';
import { qk } from '@/api/queryKeys';

/**
 * Shape of the Step 1 task result (API_CONTRACT #14b).
 *
 * Hand-written rather than pulled from `generated.ts` because `TaskStatus.result`
 * is `dict[str, Any]` on the backend — there is no schema to generate from.
 * Fields stay snake_case: this dict is built by the service and never passes
 * through an `alias_generator=to_camel` model.
 */
interface AnalyzeResult {
  total_events?: number;
  candidates?: number;
  assembled?: number;
  failed?: number;
  failures?: TeuFailure[];
}

export default function TensionPage() {
  const queryClient = useQueryClient();
  const { bookId } = useParams<{ bookId: string }>();
  const navigate = useNavigate();
  const { setPageContext } = useChatDispatch();
  const { data: book } = useBook(bookId);
  const { t } = useTranslation('analysis');
  const { t: tn } = useTranslation('nav');

  useEffect(() => {
    if (book) setPageContext({ page: 'analysis', bookId: bookId!, bookTitle: book.title });
    return () => setPageContext({ page: 'other' });
  }, [book, bookId, setPageContext]);

  const [analyzeResult, setAnalyzeResult] = useState<AnalyzeResult | null>(null);
  const [statusFilter, setStatusFilter] = useState<ReviewFilter>('all');
  const [sort, setSort] = useState<ReviewSort>('intensity');
  const [selected, setSelected] = useState<Set<string>>(new Set());
  const [focusedId, setFocusedId] = useState<string | null>(null);
  const [editing, setEditing] = useState(false);
  const [mode, setMode] = useState<'lines' | 'teu'>('lines');
  const [rerunOpen, setRerunOpen] = useState(false);

  const linesQuery = useQuery({
    queryKey: qk.tension.lines(bookId),
    queryFn: () => fetchTensionLines(bookId!),
    enabled: !!bookId,
  });
  const { data: lines = [], isLoading: linesLoading, refetch: refetchLines } = linesQuery;

  const teusQuery = useQuery({
    queryKey: qk.tension.teus(bookId),
    queryFn: () => fetchTEUs(bookId!),
    enabled: !!bookId,
  });
  const { data: teus = [], isLoading: teusLoading } = teusQuery;

  // "No theme yet" is the app's own 404 — an answer, not a failure. Anything
  // else (500, a bare gateway status) has to reach the error state instead of
  // being read as "not analysed yet".
  const themeQuery = useQuery({
    queryKey: qk.tension.theme(bookId),
    queryFn: async () => {
      try {
        return await fetchTensionTheme(bookId!);
      } catch (err) {
        if (isNoTheme(err)) return null;
        throw err;
      }
    },
    enabled: !!bookId,
    retry: false,
  });
  const { data: theme, isLoading: themeLoading, refetch: refetchTheme } = themeQuery;

  // Only an error with nothing to show replaces the page: a failed background
  // refetch keeps the data it already has.
  const failedQueries = [linesQuery, teusQuery, themeQuery].filter((q) => q.isError && q.data === undefined);
  const loadError = failedQueries[0]?.error ?? null;

  const analyzeOp = useTensionTask(
    fetchTensionAnalysisTask,
    (task) => setAnalyzeResult(task.result as AnalyzeResult),
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

  // The book's language, not the UI's. The backend turns this into the prompt's
  // "Respond in {name}.", so the two must not be confused: an English UI reading
  // a Traditional-Chinese book still wants Traditional-Chinese analysis.
  // The fallback matches `Document.language`'s own default, so the unreachable
  // case (a trigger fired before the book loads) sends what the backend assumes
  // anyway rather than inventing a third answer.
  const bookLang = book?.language ?? 'en';

  // Read the count off the build manifest rather than asking the concept
  // endpoints: this is the number TEU assembly will actually see (Concept nodes
  // in the graph), and the build overview already derives it. Two sources for
  // one fact is how they drift.
  const { data: manifest } = useQuery({
    queryKey: ['buildOverview', bookId],
    queryFn: () => fetchBuildOverview(bookId!),
    enabled: !!bookId,
  });
  // Judged only once the manifest has loaded: while it is still in flight the
  // count reads as 0 and the notice would flash up for a book that has concepts.
  const conceptsMissing =
    manifest != null &&
    (manifest.nodes.find((n) => n.nodeId === 'kg_concept_inferred')?.counts.total ?? 0) === 0;

  // `force` has to be true to re-run a completed step: without it the backend
  // returns the cached result, reports success, and nothing changes.
  const runStep = useCallback(
    (key: 1 | 2 | 3, force: boolean) => {
      if (key === 1) {
        analyzeOp.trigger(
          () => triggerTensionAnalysis(bookId!, bookLang, force),
          t('tension.errors.triggerAnalysis'),
        );
      } else if (key === 2) {
        groupOp.trigger(
          () => triggerGroupTensionLines(bookId!, bookLang, force),
          t('tension.errors.triggerGroup'),
        );
      } else {
        synthesizeOp.trigger(
          () => triggerSynthesizeTensionTheme(bookId!, bookLang, force),
          t('tension.errors.triggerSynth'),
        );
      }
    },
    [bookId, bookLang, analyzeOp, groupOp, synthesizeOp, t],
  );

  const onLineReviewed = () => {
    queryClient.invalidateQueries({ queryKey: qk.tension.lines(bookId) });
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
      queryClient.invalidateQueries({ queryKey: qk.tension.theme(bookId) });
    },
  });


  const hasLines = lines.length > 0;
  // `teus.length` has to be in here: without it the page only knows Step 1 ran
  // if it ran *in this session*, so a reload threw away the evidence of 23
  // assembled TEUs and showed the "not analysed yet" empty state instead —
  // offering to spend a full LLM pass redoing work that was already done
  // (B-110). `analyzeResult` stays first because it arrives before the TEU
  // query refetches, so the card does not flicker through the empty state.
  const hasTeus = analyzeResult !== null || hasLines || teus.length > 0;
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

  const [assignFailure, setAssignFailure] = useState<AssignApi['failure']>(null);
  const assignMutation = useMutation({
    mutationFn: ({ teuId, lineId }: { teuId: string; lineId: string }) =>
      assignTEUToLine(teuId, bookId!, lineId),
    onMutate: () => setAssignFailure(null),
    // 409 (another line already owns the TEU) is a designed outcome with its
    // own explanation; the row shows it, not a generic toast.
    onError: (err, vars) =>
      setAssignFailure({
        teuId: vars.teuId,
        kind: assignFailureKind(err),
        reason: err instanceof ApiError ? err.detail : (err as Error).message,
      }),
    onSuccess: () => {
      // Both queries move: the line gains a TEU and recomputed rollups, and the
      // TEU's line_id flips out of the orphan set.
      queryClient.invalidateQueries({ queryKey: qk.tension.lines(bookId) });
      queryClient.invalidateQueries({ queryKey: qk.tension.teus(bookId) });
    },
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

  const assignApi: AssignApi = {
    pendingTeuId: assignMutation.isPending ? (assignMutation.variables?.teuId ?? null) : null,
    failure: assignFailure,
    onAssign: (teuId, lineId) => assignMutation.mutate({ teuId, lineId }),
  };

  const [batch, setBatch] = useState({ failed: 0, busy: false });
  const batchReview = async (status: 'approved' | 'rejected') => {
      setBatch({ failed: 0, busy: true });
      // Sequential (every call rewrites the same cached blob). A failure no
      // longer aborts the rest: the failed lines stay selected for a retry.
      const { failed } = await runSequentially(selected, (id) =>
        reviewMutation.mutateAsync({ id, status }),
      );
      setSelected(new Set(failed));
      setBatch({ failed: failed.length, busy: false });
  };

  const openLine = useMemo(
    () => filteredLines.find((l) => l.id === focusedId) ?? null,
    [filteredLines, focusedId],
  );
  const openIndex = openLine ? filteredLines.indexOf(openLine) : -1;

  // Below this width the review drawer overlays the main column instead of
  // sitting beside it (see the Responsive block in tension.css). The value is
  // duplicated here because a media query is not readable from CSS — keep the
  // two in sync.
  const [drawerOverlays, setDrawerOverlays] = useState(
    () => window.matchMedia('(max-width: 1080px)').matches,
  );
  useEffect(() => {
    const mq = window.matchMedia('(max-width: 1080px)');
    const onChange = (e: MediaQueryListEvent) => setDrawerOverlays(e.matches);
    mq.addEventListener('change', onChange);
    return () => mq.removeEventListener('change', onChange);
  }, []);

  // Content under an overlaying drawer is covered but still tabbable, so focus
  // walks into rows and buttons the reader cannot see. `inert` takes the whole
  // subtree out of the tab order and the accessibility tree. Only while the
  // drawer actually overlays: docked beside the content it is an ordinary side
  // panel, and making the page inert next to it would be hostile.
  const drawerOverlaying = openLine != null && mode === 'lines' && drawerOverlays;

  const drawerRef = useRef<HTMLElement>(null);
  const focusReturnRef = useRef<HTMLElement | null>(null);
  useEffect(() => {
    if (!drawerOverlaying) return;
    // `inert` is about to drop focus to <body>, so remember where it was first.
    focusReturnRef.current = document.activeElement as HTMLElement | null;
    drawerRef.current?.focus();
    return () => {
      // Cleanup runs after the DOM commit that removed `inert`, so the element
      // is focusable again by the time we reach for it.
      focusReturnRef.current?.focus();
      focusReturnRef.current = null;
    };
  }, [drawerOverlaying]);

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
    if (!hasLines || mode !== 'lines') return;
    const onKey = (e: KeyboardEvent) => {
      if (e.metaKey || e.ctrlKey || e.altKey) return;
      const el = e.target as HTMLElement | null;
      const typing = !!el && (el.tagName === 'INPUT' || el.tagName === 'TEXTAREA');
      if (typing) {
        if (e.key === 'Escape') setEditing(false);
        return;
      }
      // A modal owns the keyboard while it is up: Esc dismisses it and nothing
      // else gets through, or 'a' would approve a row hidden behind it.
      if (rerunOpen) {
        if (e.key === 'Escape') setRerunOpen(false);
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
  }, [hasLines, filteredLines, openIndex, reviewMutation, toggleSelect, toggleAll, rerunOpen, mode]);

  const reviewedCount = lines.filter(
    (l) => l.review_status === 'approved' || l.review_status === 'modified',
  ).length;
  const unreviewedCount = lines.length - reviewedCount;
  const orphanCount = teus.filter((teu) => teu.line_id === null).length;
  const approvedCount = lines.filter((l) => l.review_status === 'approved').length;
  const editedCount = lines.filter((l) => l.review_status === 'modified').length;

  // Both counts. The bars stay on the TEU count: a narrative run is not a
  // scene, and drawing it as density flattened the chart to near-uniform stubs
  // — every chapter of Age of Fire has no flashback, so all five collapsed to
  // one run and the columns became identical (B-068). The run total is kept as
  // text beside the TEU total, where it cannot be read as a density.
  // A TEU whose source event is gone has no run index and stands alone.
  const teuChapterCounts = useMemo(() => {
    const byChapter = new Map<
      number,
      { teus: number; runs: Set<string>; scenes: Set<number> }
    >();
    for (const teu of teus) {
      const entry =
        byChapter.get(teu.chapter) ??
        { teus: 0, runs: new Set<string>(), scenes: new Set<number>() };
      entry.teus += 1;
      entry.runs.add(
        teu.narrative_run_index == null ? `teu:${teu.id}` : `run:${teu.narrative_run_index}`,
      );
      // A chapter with no typographic divider is omitted from the grouping
      // entirely, so every TEU in it has a null index and the set stays empty.
      // That empty set becomes `null` below — "not known", never 0 or 1.
      if (teu.scene_index != null) entry.scenes.add(teu.scene_index);
      byChapter.set(teu.chapter, entry);
    }
    return [...byChapter.entries()]
      .sort((a, b) => a[0] - b[0])
      .map(([chapter, e]) => [chapter, e.teus, e.runs.size, e.scenes.size || null]) as [
      number,
      number,
      number,
      number | null,
    ][];
  }, [teus]);

  const runTotal = useMemo(
    () => teuChapterCounts.reduce((n, [, , runs]) => n + runs, 0),
    [teuChapterCounts],
  );

  // Counted separately from the chapters that have no answer, because summing
  // them would turn "we cannot tell" into "zero scenes there" (B-068).
  const sceneSummary = useMemo(() => {
    const known = teuChapterCounts.filter(([, , , scenes]) => scenes != null);
    return {
      total: known.reduce((n, [, , , scenes]) => n + (scenes ?? 0), 0),
      knownChapters: known.length,
      unknownChapters: teuChapterCounts.length - known.length,
    };
  }, [teuChapterCounts]);

  // Only the run that just finished carries a failure list: it lives in the
  // task result, and nothing persists it per-book. A refresh drops it (same
  // shape as B-110), so the panel below is honest about being run-scoped.
  const teuFailures = analyzeResult?.failures ?? [];

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
          ? teuFailures.length > 0
            ? t('tension.stage.teuPartial', {
                assembled: analyzeResult.assembled ?? 0,
                candidates: analyzeResult.candidates ?? 0,
                failed: teuFailures.length,
              })
            : t('tension.stage.teuDone', {
                assembled: analyzeResult.assembled ?? 0,
                candidates: analyzeResult.candidates ?? 0,
              })
          : hasTeus
            ? t('tension.stage.teuDone', { assembled: teus.length, candidates: teus.length })
            : t('tension.stage.teuIdle'),
      noteWarning: teuFailures.length > 0,
      // Not `failed` — that means the step broke and produced nothing, while a
      // partial run did assemble the rest. `partial` rides alongside `done` so
      // the downstream gate still unblocks; only the dot changes.
      partial: teuFailures.length > 0,
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
      notReady: !hasLines || (!hasTheme && unreviewedCount > 0),
      progress: synthesizeOp.task?.progress ?? 0,
      error: synthesizeOp.error,
    },
  ];

  // Any of the four triggers (Step 1, Step 2 / re-run, synthesise) refused with
  // the app's own 503: said once, in place under the strip, page otherwise intact.
  const llmBlocked = analyzeOp.llmBlocked || groupOp.llmBlocked || synthesizeOp.llmBlocked;

  const backToBook = (
    <Link to={`/books/${bookId}`} className="ss-btn ss-btn-md ss-btn-secondary">
      {t('character.error.backToBook')}
    </Link>
  );

  // The queries stay mounted at page level, so a retry refetches in place — no
  // unmount/mount cycle that would reset an errored query to pending.
  if (loadError) {
    return (
      <div className="tn-shell">
        <div className="tn-shell-main tn-scroll">
          <div className="tn-page">
            <PageFailure
              variant={failureKind(loadError)}
              pageName={tn('tabs.tensionAnalysis')}
              onRetry={() => failedQueries.forEach((q) => void q.refetch())}
              secondaryAction={backToBook}
              techDetail={techDetailOf(loadError)}
            />
          </div>
        </div>
      </div>
    );
  }

  const loading = linesLoading || teusLoading || themeLoading;
  const showStep1Card = hasTeus && !hasLines && !groupOp.running && !groupOp.error;

  return (
    <div className="tn-shell">
      <div className="tn-shell-main tn-scroll" inert={drawerOverlaying}>
        <div className="tn-page">
          <GuidanceRibbon surface="tension">
            <strong>{t('tension.guide.prefix')}</strong>{' '}
            <Trans i18nKey="tension.guide.body" ns="analysis" components={{ strong: <strong /> }} />
          </GuidanceRibbon>

          <TensionStepperStrip stages={stages} />

          {llmBlocked && <LlmUnconfiguredNotice />}

          {/* With a Step 1 card the list sits at its foot; without one (lines
              already exist) it is a page-level footnote. */}
          {!showStep1Card && <TensionFailureList failures={teuFailures} />}

          {loading ? <LoadingSpinner /> : null}

          {!loading && !hasTeus && !analyzeOp.running && (
            <TensionEmptyCard
              onStart={() => runStep(1, false)}
              bookId={bookId!}
              conceptsMissing={conceptsMissing}
            />
          )}

          {analyzeOp.running && (
            <TensionRunningCard
              title={t('tension.state.analyzeRunningTitle')}
              progress={analyzeOp.task?.progress ?? 0}
            />
          )}

          {/* Inserted above the previous result rather than replacing it: a
              failed re-run leaves the last good grouping intact. */}
          {groupOp.error && (
            <TensionErrorCard
              title={t('tension.state.groupErrorTitle')}
              message={
                <Trans
                  i18nKey={hasLines ? 'tension.state.groupErrorBody' : 'tension.state.groupErrorBodyNoPrev'}
                  ns="analysis"
                  values={{ error: groupOp.error, count: lines.length }}
                  components={{ mono: <span className="tn-alert-mono" /> }}
                />
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
            />
          )}

          {showStep1Card && (
            <TensionStep1Card
              teuCount={teus.length}
              runCount={runTotal}
              sceneSummary={sceneSummary}
              chapterCounts={teuChapterCounts}
              failures={teuFailures}
              onGroup={() => runStep(2, false)}
            />
          )}

          {synthesizeOp.running && (
            <TensionRunningCard
              title={t('tension.state.themeRunningTitle')}
              progress={synthesizeOp.task?.progress ?? 0}
            />
          )}

          {hasLines && !hasTheme && !synthesizeOp.running && (
            <TensionSoftGate unreviewed={unreviewedCount} onSynthesize={() => runStep(3, false)} />
          )}

          {theme && (
            <TensionThemeHero
              theme={theme}
              lines={lines}
              onResynthesize={() => runStep(3, true)}
              onOpenLine={(id) => setFocusedId(id)}
              onApprove={() => themeReviewMutation.mutate({ status: 'approved' })}
              onReject={() => themeReviewMutation.mutate({ status: 'rejected' })}
              onModify={(prop) => themeReviewMutation.mutate({ status: 'modified', proposition: prop })}
              pending={themeReviewMutation.isPending}
            />
          )}

          {hasLines && (
            <>
              <div className="tn-mode-row">
                <div className="ss-seg tn-mode-seg" role="group">
                  <button
                    type="button"
                    className={`ss-seg-item${mode === 'lines' ? ' active' : ''}`}
                    aria-pressed={mode === 'lines'}
                    onClick={() => setMode('lines')}
                  >
                    {t('tension.mode.lines', { count: lines.length })}
                  </button>
                  <button
                    type="button"
                    className={`ss-seg-item${mode === 'teu' ? ' active' : ''}`}
                    aria-pressed={mode === 'teu'}
                    onClick={() => setMode('teu')}
                  >
                    {t('tension.mode.teu', { count: teus.length })}
                  </button>
                </div>
                <span className="tn-hint">
                  {mode === 'lines'
                    ? t('tension.mode.hintLines')
                    : t('tension.mode.hintTeu', { count: orphanCount })}
                </span>
              </div>

              {mode === 'teu' ? (
                <TensionTEUInspector
                  teus={teus}
                  lines={lines}
                  assign={assignApi}
                  onOpenChapter={openChapter}
                />
              ) : (
                <>
                  <TensionChapterGrid
                    lines={lines}
                    teus={teus}
                    openId={focusedId}
                    onOpen={(id) => setFocusedId((prev) => (prev === id ? null : id))}
                    assign={assignApi}
                  />

                  <section className="tn-card tn-review">
                    <TensionReviewToolbar
                      counts={filterCounts}
                      filter={statusFilter}
                      onFilterChange={setStatusFilter}
                      sort={sort}
                      onSortChange={setSort}
                      selectedCount={selected.size}
                      batchFailed={batch.failed}
                      batchBusy={batch.busy}
                      onBatchApprove={() => void batchReview('approved')}
                      onBatchReject={() => void batchReview('rejected')}
                      onClearSelection={() => {
                        setSelected(new Set());
                        setBatch({ failed: 0, busy: false });
                      }}
                    />

                    <TensionLineTable
                      rows={filteredLines}
                      allIntensities={allIntensities}
                      totalCount={lines.length}
                      selected={selected}
                      openId={focusedId}
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
                      <span className="tn-meta-mono">{t('tension.table.shortcuts')}</span>
                      <span className="tn-spacer" />
                      <span className="tn-hint">{t('tension.state.tokenHintShort')}</span>
                      <button
                        type="button"
                        className="ss-btn ss-btn-sm ss-btn-danger ss-btn-llm"
                        onClick={() => setRerunOpen(true)}
                      >
                        {t('tension.rerun.trigger')}
                      </button>
                    </div>
                  </section>
                </>
              )}
            </>
          )}
        </div>
      </div>

      {openLine && mode === 'lines' && (
        <TensionReviewDrawer
          ref={drawerRef}
          line={openLine}
          position={{ index: openIndex + 1, total: filteredLines.length }}
          lineIntensities={allIntensities}
          teuIntensities={teuIntensities}
          editing={editing}
          onStartEdit={() => setEditing(true)}
          onCancelEdit={() => setEditing(false)}
          onSaveLabels={(a, b, note) => saveLabelsMutation.mutate({ id: openLine.id, a, b, note })}
          onReview={(status) => reviewMutation.mutate({ id: openLine.id, status })}
          onClose={() => {
            setEditing(false);
            setFocusedId(null);
          }}
          onOpenChapter={openChapter}
        />
      )}

      {/* Re-running Step 2 mints new line ids, so every approval and rewritten
          label is lost: the dialog itemises that. Zero counts do not appear. */}
      <ConfirmDialog
        open={rerunOpen}
        title={t('tension.rerun.title')}
        message={t('tension.rerun.body')}
        sections={[
          {
            title: t('tension.rerun.willLose'),
            items: [
              ...(lines.length > 0 ? [t('tension.rerun.lossLines', { count: lines.length })] : []),
              ...(approvedCount > 0 ? [t('tension.rerun.lossApproved', { count: approvedCount })] : []),
              ...(editedCount > 0 ? [t('tension.rerun.lossEdited', { count: editedCount })] : []),
            ],
          },
          {
            title: t('tension.rerun.willStale'),
            items: hasTheme ? [t('tension.rerun.willStaleBody')] : [],
          },
        ]}
        costHint={t('tension.state.tokenHintShort')}
        confirmLabel={t('tension.rerun.confirm')}
        spendsTokens
        danger
        onConfirm={() => {
          setRerunOpen(false);
          setFocusedId(null);
          setSelected(new Set());
          runStep(2, true);
        }}
        onCancel={() => setRerunOpen(false)}
      />
    </div>
  );
}
