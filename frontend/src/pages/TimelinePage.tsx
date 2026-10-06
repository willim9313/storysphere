/**
 * Timeline page — 章節順序 底圖 + 對照故事時序 開關 (DS v3 batch 4, 4-1).
 *
 * The old three-view tabs are gone: story order and the matrix read the same
 * `chronological_rank` (no rank → both empty, rank → both alive), so they were
 * one question sold as two. 章節順序 is the only base; the comparison is a
 * zero-cost switch that decides whether ranked events are drawn on the midline
 * (off) or at their deviation from it (on). Deviation is the analepsis /
 * prolepsis signal.
 *
 * Three deviations from the design canvas are deliberate and recorded in
 * `docs/plans/20260725-timeline-page-enhancements.md`:
 *
 *  1. The 倒敘與預敘 action is gated on the real `storyTimeHint` coverage
 *     (`coverage_sufficient`), not on "the story-order run finished". The two
 *     draw on different data, so running story order does not unblock it.
 *  2. Filtering keeps both display modes (dim / only).
 *  3. All headline prose is computed from the data.
 *
 * EEP (event analysis) is a prerequisite of this page, not one of its
 * actions: its two buttons live on the event analysis page, and this page
 * re-reads the timeline on mount to pick up what was run there.
 */

import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { Link, useNavigate, useParams, useSearchParams } from 'react-router-dom';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { Trans, useTranslation } from 'react-i18next';
import { AlertTriangle, Loader2, X } from 'lucide-react';
import { useChatDispatch } from '@/contexts/ChatContext';
import { useToast } from '@/contexts/ToastContext';
import { useBook } from '@/hooks/useBook';
import { useTimeline } from '@/hooks/useTimeline';
import { useTaskPolling } from '@/hooks/useTaskPolling';
import { useSourceJump } from '@/hooks/useSourceJump';
import { computeTimeline } from '@/api/timeline';
import { cancelTask } from '@/api/ingest';
import { fetchTemporalCoverage, triggerTemporalAnalysis } from '@/api/narrative';
import { failureKind, isLlmUnconfigured, techDetailOf } from '@/api/failureKind';
import { sortEventsForOrder } from '@/lib/timelineSort';
import {
  MAX_LANES,
  buildStaveRows,
  buildTimelineData,
  chapterList,
  timelineStats,
  type TimelineDatum,
} from '@/lib/timelineGeometry';
import { ConfirmDialog } from '@/components/ui/ConfirmDialog';
import { PageFailure } from '@/components/ui/PageFailure';
import { GuidanceRibbon } from '@/components/ui/GuidanceRibbon';
import { TimelineOnboardingHero } from '@/components/timeline/TimelineOnboardingHero';
import { TimelineToolbar } from '@/components/timeline/TimelineToolbar';
import {
  TimelineActionPanel,
  type ActionRowState,
} from '@/components/timeline/TimelineActionPanel';
import { FilterSheet } from '@/components/timeline/FilterSheet';
import { TimelineStave } from '@/components/timeline/TimelineStave';
import { ChapterCardBand } from '@/components/timeline/ChapterCardBand';
import { DensityMatrix } from '@/components/timeline/DensityMatrix';
import { CharacterLanes } from '@/components/timeline/CharacterLanes';
import { EventDetailPanel } from '@/components/timeline/EventDetailPanel';
import {
  compareState,
  displacementSkipped,
  drawsDeviation,
  eepPrereq,
  hintCoverage,
  staleStepKey,
} from '@/components/timeline/timelineModel';
import {
  activeFilterCount,
  buildActiveFilterTags,
  buildFilterOptions,
  createDefaultFilter,
  eventPassesFilter,
  isFilterActive,
  type FilterMode,
  type FilterState,
} from '@/components/timeline/filterState';
import '@/styles/timeline.css';
import { qk } from '@/api/queryKeys';

/** Lane picks are per book and survive reloads — including the empty set,
 *  which is why absence of the key (not an empty array) is what triggers
 *  seeding. */
const laneStorageKey = (bookId: string) => `timeline:lanes:${bookId}`;

function readStoredLanes(bookId: string): string[] | null {
  try {
    const raw = localStorage.getItem(laneStorageKey(bookId));
    if (!raw) return null;
    const parsed: unknown = JSON.parse(raw);
    return Array.isArray(parsed) ? parsed.filter((v): v is string => typeof v === 'string') : null;
  } catch {
    return null;
  }
}

export default function TimelinePage() {
  const { bookId } = useParams<{ bookId: string }>();
  const navigate = useNavigate();
  const queryClient = useQueryClient();
  const { t } = useTranslation('analysis');
  const { t: tn } = useTranslation('nav');
  const { t: tr } = useTranslation('reader');
  const { push } = useToast();
  const [searchParams, setSearchParams] = useSearchParams();

  /* ── State ─────────────────────────────────────────────────── */

  const selectedEventId = searchParams.get('event');

  const [selectedChapter, setSelectedChapter] = useState<number | null>(null);
  const [filter, setFilter] = useState<FilterState>(createDefaultFilter);
  const [filterMode, setFilterMode] = useState<FilterMode>('dim');
  const [filterOpen, setFilterOpen] = useState(false);
  const [onlyAnalyzed, setOnlyAnalyzed] = useState(false);
  const [lanesOn, setLanesOn] = useState(true);
  const [laneIds, setLaneIds] = useState<string[]>([]);
  const [panelOpen, setPanelOpen] = useState(false);
  const [expandedChapter, setExpandedChapter] = useState<number | null>(null);
  const [confirm, setConfirm] = useState<'story' | 'displacement' | null>(null);
  /** The user's wish; whether it can be honoured is `compareState`. */
  const [wantsCompare, setWantsCompare] = useState(false);
  /** How an open comparison is drawn. Local like the switch — not in the URL. */
  const [compareView, setCompareView] = useState<'stave' | 'matrix'>('stave');
  const [computeTaskId, setComputeTaskId] = useState<string | null>(null);
  const [displacementTaskId, setDisplacementTaskId] = useState<string | null>(null);
  const [skippedNotice, setSkippedNotice] = useState(false);
  const [llmBlocked, setLlmBlocked] = useState(false);

  const filterRef = useRef<HTMLDivElement>(null);
  /** Which book's lanes have already been seeded — see the seeding effect. */
  const laneSeedRef = useRef<string | undefined>(undefined);

  const setParam = useCallback(
    (key: string, value: string | null) => {
      setSearchParams(
        (prev) => {
          const next = new URLSearchParams(prev);
          if (value === null) next.delete(key);
          else next.set(key, value);
          return next;
        },
        { replace: true },
      );
    },
    [setSearchParams],
  );

  /* ── Data ──────────────────────────────────────────────────── */

  const { setPageContext } = useChatDispatch();
  const { data: book } = useBook(bookId);
  const bookLanguage = book?.language ?? 'en';
  /* Always narrative order: `index` — which the stave and the character lanes
     position by — has to mean "position in the book". Story order is a
     property of each event (its rank), not a second fetch. `refetchOnMount`
     picks up EEP that finished on the event analysis page, which no longer
     happens from here. */
  const { data, isLoading, error, refetch } = useTimeline(bookId, 'narrative', {
    refetchOnMount: 'always',
  });
  const { data: computeTask } = useTaskPolling(computeTaskId);
  const { data: displacementTask } = useTaskPolling(displacementTaskId);
  const { jump, pendingKey } = useSourceJump(bookId);

  const { data: coverage } = useQuery({
    queryKey: ['narrative', bookId, 'temporal-coverage'],
    queryFn: () => fetchTemporalCoverage(bookId!),
    enabled: !!bookId,
    staleTime: 60_000,
  });

  const rawEvents = data?.events;
  const events = useMemo(
    () => (rawEvents ? sortEventsForOrder(rawEvents, 'narrative') : []),
    [rawEvents],
  );

  const timelineData = useMemo(() => buildTimelineData(events), [events]);
  const stats = useMemo(() => timelineStats(timelineData), [timelineData]);
  const chapters = useMemo(() => chapterList(timelineData), [timelineData]);
  const filterOptions = useMemo(() => buildFilterOptions(events), [events]);

  /** Whole-book rank presence decides the switch, never the filter. */
  const cmpState = compareState(stats.ranked, wantsCompare);
  const comparing = drawsDeviation(cmpState);

  const filterActive = isFilterActive(filter);
  const filterCount = activeFilterCount(filter) + (onlyAnalyzed ? 1 : 0);

  // Same label lambdas the FilterSheet passes down, so a chip and the option
  // it came from can never disagree.
  const activeTags = useMemo(
    () =>
      buildActiveFilterTags(
        filter,
        setFilter,
        filterOptions,
        (m) => t(`timeline.narrativeModes.${m}`, m),
        (ty) => t(`timeline.eventTypes.${ty}`, ty),
      ),
    [filter, filterOptions, t],
  );

  const matches = useMemo(() => {
    const set = new Set<string>();
    for (const d of timelineData) {
      const passesScope = !onlyAnalyzed || d.hasAnalysis;
      const passesFilter = !filterActive || eventPassesFilter(d.event, filter);
      if (passesScope && passesFilter) set.add(d.id);
    }
    return set;
  }, [timelineData, filter, filterActive, onlyAnalyzed]);

  const anyFilter = filterActive || onlyAnalyzed;
  /** In "only" mode non-matching events are removed; in dim mode they stay. */
  const visible = useMemo(
    () =>
      anyFilter && filterMode === 'only'
        ? timelineData.filter((d) => matches.has(d.id))
        : timelineData,
    [timelineData, matches, anyFilter, filterMode],
  );
  const dimmedIds = useMemo(
    () =>
      anyFilter && filterMode === 'dim'
        ? new Set(timelineData.filter((d) => !matches.has(d.id)).map((d) => d.id))
        : new Set<string>(),
    [timelineData, matches, anyFilter, filterMode],
  );

  const filterCounts = useMemo(() => {
    const counts = new Map<string, number>();
    const bump = (k: string) => counts.set(k, (counts.get(k) ?? 0) + 1);
    for (const d of timelineData) {
      bump(`eventTypes:${d.event.eventType}`);
      bump(`narrativeModes:${d.event.narrativeMode}`);
      if (d.event.eventImportance) bump(`importance:${d.event.eventImportance}`);
      for (const p of d.event.participants) {
        if (p.type === 'character') bump(`characters:${p.id}`);
        // Locations arrive as participants, not in a field of their own: the
        // extraction prompt asks for "entity names involved" and does not
        // restrict the type, so a place lands there like anyone else. The
        // dedicated `location` field was removed in B-109 — nothing ever wrote
        // it, and this facet was empty for as long as it existed.
        //
        // Read it as "events involving this place", not "events set here":
        // 16% of events name more than one place (a character crossing three
        // of them on the way somewhere), and nothing in the data says which
        // one is the setting.
        if (p.type === 'location') bump(`locations:${p.id}`);
      }
    }
    return counts;
  }, [timelineData]);

  const staveRows = useMemo(
    () =>
      buildStaveRows(
        timelineData,
        (d) => (anyFilter && filterMode === 'only' ? matches.has(d.id) : true),
        comparing,
      ),
    [timelineData, matches, anyFilter, filterMode, comparing],
  );

  const activeChapter = selectedChapter ?? chapters[0] ?? 1;
  const selectedDatum = useMemo(
    () => timelineData.find((d) => d.id === selectedEventId) ?? null,
    [timelineData, selectedEventId],
  );

  const laneCharacters = useMemo(() => {
    const byId = new Map(filterOptions.characters.map((c) => [c.id, c]));
    return laneIds
      .map((id) => byId.get(id))
      .filter((c): c is { id: string; name: string } => !!c);
  }, [laneIds, filterOptions.characters]);

  /* ── Effects ───────────────────────────────────────────────── */

  useEffect(() => {
    setPageContext({ page: 'timeline', bookId, bookTitle: book?.title });
  }, [bookId, book?.title, setPageContext]);

  useEffect(() => {
    if (selectedDatum) {
      setPageContext({
        selectedEntity: { id: selectedDatum.id, name: selectedDatum.title, type: 'event' },
      });
    } else {
      setPageContext({ selectedEntity: undefined });
    }
  }, [selectedDatum, setPageContext]);

  /* eslint-disable react-hooks/set-state-in-effect */

  /** Restore this book's lane picks, or seed with the most-present characters
   *  on first visit — an empty overlay teaches nothing, and "appears most
   *  often" is the useful default.
   *
   *  Runs once per book, tracked by a ref rather than by `laneIds.length`:
   *  keying off the length re-seeds the defaults the moment the reader removes
   *  the last pill, which reads as the overlay refusing to be emptied. An
   *  empty lane set is a legitimate state — it is how you start picking, and
   *  it is remembered as such. */
  useEffect(() => {
    if (!bookId || timelineData.length === 0 || laneSeedRef.current === bookId) return;
    laneSeedRef.current = bookId;
    const stored = readStoredLanes(bookId);
    if (stored) {
      setLaneIds(stored.slice(0, MAX_LANES));
      return;
    }
    const tally = new Map<string, number>();
    for (const d of timelineData) {
      for (const p of d.event.participants) {
        if (p.type === 'character') tally.set(p.id, (tally.get(p.id) ?? 0) + 1);
      }
    }
    const top = [...tally.entries()]
      .sort((a, b) => b[1] - a[1])
      .slice(0, MAX_LANES)
      .map(([id]) => id);
    if (top.length > 0) setLaneIds(top);
  }, [timelineData, bookId]);

  /** Persist after hydration only, so the initial empty state never overwrites
   *  what the reader saved last time. */
  useEffect(() => {
    if (!bookId || laneSeedRef.current !== bookId) return;
    try {
      localStorage.setItem(laneStorageKey(bookId), JSON.stringify(laneIds));
    } catch {
      // quota exceeded or private browsing — the picks just do not persist
    }
  }, [bookId, laneIds]);

  useEffect(() => {
    if (computeTask?.status === 'done') {
      setComputeTaskId(null);
      queryClient.invalidateQueries({ queryKey: qk.timeline.all(bookId) });
      push({ type: 'success', title: t('timeline.toast.storyOrderDone') });
    } else if (computeTask?.status === 'error') {
      setComputeTaskId(null);
      push({ type: 'error', title: t('timeline.toast.storyOrderFailed') });
    }
  }, [computeTask?.status, bookId, queryClient, push, t]);

  useEffect(() => {
    if (displacementTask?.status === 'done') {
      setDisplacementTaskId(null);
      queryClient.invalidateQueries({ queryKey: qk.timeline.all(bookId) });
      /* The service returns `done` even when it bailed on insufficient
         coverage without calling the LLM. That is "did not run", not "broke":
         it is reported on the panel in the partial colour (and not as a toast,
         which would vanish while the reason still applies). */
      if (displacementSkipped(displacementTask.result)) {
        setSkippedNotice(true);
      } else {
        push({ type: 'success', title: t('timeline.toast.displacementDone') });
      }
    } else if (displacementTask?.status === 'error') {
      setDisplacementTaskId(null);
      push({ type: 'error', title: t('timeline.toast.displacementFailed') });
    }
  }, [displacementTask?.status, displacementTask?.result, bookId, queryClient, push, t]);

  /* eslint-enable react-hooks/set-state-in-effect */

  /* ── Selection ─────────────────────────────────────────────── */

  const selectEvent = useCallback(
    (d: TimelineDatum) => {
      setParam('event', d.id);
      setPanelOpen(true);
      setSelectedChapter(d.chapter);
    },
    [setParam],
  );

  const selectByIndex = useCallback(
    (index: number) => {
      const next = timelineData[Math.min(timelineData.length - 1, Math.max(0, index))];
      if (next) selectEvent(next);
    },
    [timelineData, selectEvent],
  );

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      const target = e.target as HTMLElement | null;
      if (target && /^(INPUT|TEXTAREA|SELECT)$/.test(target.tagName)) return;

      if (e.key === 'Escape') {
        setConfirm(null);
        setFilterOpen(false);
        setPanelOpen(false);
        return;
      }
      if (e.key === 'ArrowRight' || e.key === 'ArrowLeft') {
        if (timelineData.length === 0) return;
        const base = selectedDatum?.index ?? 0;
        selectByIndex(base + (e.key === 'ArrowRight' ? 1 : -1));
        e.preventDefault();
      }
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [selectedDatum, timelineData.length, selectByIndex]);

  /** Close the filter popover on an outside click. */
  useEffect(() => {
    if (!filterOpen) return;
    const onDown = (e: MouseEvent) => {
      if (filterRef.current && !filterRef.current.contains(e.target as Node)) {
        setFilterOpen(false);
      }
    };
    document.addEventListener('mousedown', onDown);
    return () => document.removeEventListener('mousedown', onDown);
  }, [filterOpen]);

  /* ── Expensive actions ─────────────────────────────────────── */

  const isComputing = computeTaskId !== null;
  const isRunningDisplacement = displacementTaskId !== null;

  /** Both triggers fail the same way: 503 + the app's own body means no LLM
   *  provider, which is said in place on the panel; anything else is the
   *  generic failure toast. */
  const onTriggerFailed = useCallback(
    (err: unknown, failedKey: string) => {
      if (isLlmUnconfigured(err)) setLlmBlocked(true);
      else push({ type: 'error', title: t(failedKey) });
    },
    [push, t],
  );

  const runStoryOrder = useCallback(async () => {
    if (!bookId || isComputing) return;
    setConfirm(null);
    setLlmBlocked(false);
    try {
      const { taskId } = await computeTimeline(bookId);
      setComputeTaskId(taskId);
    } catch (err) {
      onTriggerFailed(err, 'timeline.toast.storyOrderFailed');
    }
  }, [bookId, isComputing, onTriggerFailed]);

  const runDisplacement = useCallback(async () => {
    if (!bookId || isRunningDisplacement) return;
    setConfirm(null);
    setLlmBlocked(false);
    setSkippedNotice(false);
    try {
      /* Always `force`: the user asked to run it. Without it a cached
         "coverage too low" early return keeps answering instead of the run. */
      const task = await triggerTemporalAnalysis(bookId, bookLanguage, true);
      setDisplacementTaskId(task.taskId);
    } catch (err) {
      onTriggerFailed(err, 'timeline.toast.displacementFailed');
    }
  }, [bookId, bookLanguage, isRunningDisplacement, onTriggerFailed]);

  /** 中止 hits the backend (`POST /tasks/:id/cancel`) rather than just
   *  forgetting the id, which would leave the run going. */
  const cancelRunning = useCallback((taskId: string | null, clear: () => void) => {
    if (taskId) void cancelTask(taskId).catch(() => undefined);
    clear();
  }, []);

  /** What #21h actually produced for this book. */
  const temporalAnalyzed = data?.temporalAnalyzed === true;
  const temporalIsStale = data?.temporalIsStale === true;
  const verdictCounts = useMemo(() => {
    let analepsis = 0;
    let prolepsis = 0;
    for (const d of timelineData) {
      if (d.displacement?.type === 'analepsis') analepsis++;
      else if (d.displacement?.type === 'prolepsis') prolepsis++;
    }
    return { analepsis, prolepsis };
  }, [timelineData]);

  const hint = hintCoverage(coverage);
  /** The real gate — story-time hints, which the story-order run does not
   *  produce. Running story order will NOT unblock this. */
  const displacementReady = coverage?.coverage_sufficient === true;
  const displacementBlocked = !!coverage && !displacementReady && !isRunningDisplacement;

  const prereq = eepPrereq(stats.analyzed, stats.total);

  /** A first run and a re-run cost the same but mean different things: the
   *  first produces the ordering, the second discards one that already exists.
   *  Only the second is worth framing as 覆蓋. */
  const hasStoryOrder = stats.ranked > 0;

  const storyOrderState: ActionRowState = {
    ready: !isComputing,
    running: isComputing,
    progress: isComputing ? (computeTask?.progress ?? 0) / 100 : null,
    status: isComputing
      ? t('timeline.action.storyOrderRunning', {
          done: Math.round(((computeTask?.progress ?? 0) / 100) * stats.total),
          total: stats.total,
        })
      : hasStoryOrder
        ? t('timeline.action.storyOrderStatus', { done: stats.ranked, total: stats.total })
        : t('timeline.action.storyOrderStatusNone', { total: stats.total }),
    sub: isComputing
      ? t('timeline.action.leavePageOk')
      : hasStoryOrder
        ? t('timeline.action.storyOrderCost', { n: stats.ranked })
        : t('timeline.action.storyOrderCostFirst', { n: stats.total }),
    runLabel: hasStoryOrder
      ? t('timeline.action.storyOrderRun')
      : t('timeline.action.storyOrderRunFirst'),
    blocked: false,
  };

  const displacementState: ActionRowState = {
    ready: displacementReady && !isRunningDisplacement,
    running: isRunningDisplacement,
    progress: isRunningDisplacement ? (displacementTask?.progress ?? 0) / 100 : null,
    status: isRunningDisplacement
      ? t('timeline.action.displacementRunning')
      : temporalAnalyzed
        ? t('timeline.action.displacementDone', {
            analepsis: verdictCounts.analepsis,
            prolepsis: verdictCounts.prolepsis,
          })
        : !coverage
          ? ''
          : displacementReady
            ? t('timeline.action.displacementReady', { pct: hint.pct })
            : t('timeline.action.displacementBlocked', { n: hint.n, total: hint.total, pct: hint.pct }),
    sub: isRunningDisplacement
      ? t('timeline.action.leavePageOk')
      : displacementReady
        ? t(
            temporalAnalyzed
              ? 'timeline.action.displacementCostRerun'
              : 'timeline.action.displacementCost',
          )
        : displacementBlocked
          ? t('timeline.action.displacementUnblock')
          : '',
    runLabel: t(
      temporalAnalyzed
        ? 'timeline.action.displacementRerun'
        : 'timeline.action.displacementRun',
    ),
    // A stale verdict is not a blocker — it is reported on the band above the stave.
    blocked: displacementBlocked && !temporalAnalyzed,
    /* Build Overview, not the event analysis page (B-065). `story_time_hint` has
       exactly one writer — `_parse_events` during knowledge-graph extraction —
       and there is no endpoint or UI anywhere that edits it afterwards. Re-running
       the knowledge graph is the only thing that re-reads them, and that lives
       there. */
    onSubClick: displacementBlocked ? () => navigate(`/books/${bookId}/unraveling`) : undefined,
  };

  /* ── Render ────────────────────────────────────────────────── */

  if (error && !data) {
    return (
      <div className="tl">
        <div className="tl-inner">
          <PageFailure
            variant={failureKind(error)}
            pageName={tn('tabs.timeline')}
            title={t('timeline.error.title')}
            onRetry={() => void refetch()}
            secondaryAction={
              <Link to={`/books/${bookId}`} className="ss-btn ss-btn-md ss-btn-secondary">
                {t('character.error.backToBook')}
              </Link>
            }
            techDetail={techDetailOf(error)}
          />
        </div>
      </div>
    );
  }

  if (isLoading && !data) {
    return (
      <div className="tl">
        <div className="tl-inner tl-centered">
          <Loader2 className="tl-spinner" size={22} />
          <span className="tl-loading-text">{t('timeline.loadingBy.chapter')}</span>
        </div>
      </div>
    );
  }

  if (events.length === 0 && bookId) {
    return (
      <div className="tl">
        <div className="tl-inner">
          <TimelineOnboardingHero bookId={bookId} />
        </div>
      </div>
    );
  }

  const noMatch = visible.length === 0;

  const chapterAll = timelineData.filter((d) => d.chapter === activeChapter);
  const chapterShown = visible.filter((d) => d.chapter === activeChapter);

  const clearFilters = () => {
    setFilter(createDefaultFilter());
    setOnlyAnalyzed(false);
  };

  const staleStep = staleStepKey(data?.temporalStaleReason);

  return (
    <div className="tl">
      <div className="tl-inner">
        <GuidanceRibbon surface="timeline">
          <strong>{t('timeline.guide.prefix')}</strong>{' '}
          <Trans
            i18nKey="timeline.guide.body"
            ns="analysis"
            components={{ strong: <strong /> }}
          />
        </GuidanceRibbon>

        <TimelineToolbar
          totalCount={stats.total}
          analyzedCount={stats.analyzed}
          matchCount={matches.size}
          onlyAnalyzed={onlyAnalyzed}
          onOnlyAnalyzedChange={setOnlyAnalyzed}
          filterCount={filterCount}
          filterMode={filterMode}
          onFilterModeChange={setFilterMode}
          filterOpen={filterOpen}
          onToggleFilter={() => setFilterOpen((v) => !v)}
          lanesOn={lanesOn}
          onToggleLanes={() => setLanesOn((v) => !v)}
          actions={
            <TimelineActionPanel
              storyOrder={storyOrderState}
              onRunStoryOrder={() => setConfirm('story')}
              onCancelStoryOrder={() => cancelRunning(computeTaskId, () => setComputeTaskId(null))}
              displacement={displacementState}
              onRunDisplacement={() => setConfirm('displacement')}
              onCancelDisplacement={() =>
                cancelRunning(displacementTaskId, () => setDisplacementTaskId(null))
              }
              displacementSkipped={skippedNotice}
              onDismissSkipped={() => setSkippedNotice(false)}
              llmBlocked={llmBlocked}
            />
          }
        >
          {filterOpen && (
            <div className="tl-filter-popover" ref={filterRef}>
              <FilterSheet
                filter={filter}
                onChange={setFilter}
                options={filterOptions}
                counts={filterCounts}
                modeLabel={(m) => t(`timeline.narrativeModes.${m}`, m)}
                eventTypeLabel={(ty) => t(`timeline.eventTypes.${ty}`, ty)}
              />
            </div>
          )}
        </TimelineToolbar>

        {activeTags.length > 0 && (
          <div className="tl-active-filters">
            <span className="tl-active-filters-label">{t('timeline.activeFilters')}</span>
            {activeTags.map((tag) => (
              <button
                key={tag.key}
                type="button"
                className="tl-filter-chip removable"
                onClick={tag.remove}
                aria-label={t('timeline.removeFilter', { label: tag.label })}
              >
                {tag.label}
                <X size={11} aria-hidden="true" />
              </button>
            ))}
          </div>
        )}

        <div className={`tl-main${panelOpen && selectedDatum ? ' with-panel' : ''}`}>
          <div className="tl-canvas">
            {/* 底圖標題 + 對照開關。The switch sits beside the subtitle that
                explains it; its blocked reason is a card right below, the one
                place that says so (the old prompt card said it a second time). */}
            <div className="tl-base-head">
              <div className="tl-base-text">
                <h2 className="tl-base-title">{t('timeline.base.title')}</h2>
                <p className="tl-base-sub">{t('timeline.base.subtitle')}</p>
              </div>
              <div className="tl-compare">
                <button
                  type="button"
                  role="switch"
                  aria-checked={cmpState === 'on'}
                  className={`tl-switch is-${cmpState}`}
                  disabled={cmpState === 'disabled'}
                  onClick={() => setWantsCompare((v) => !v)}
                >
                  <span className="tl-switch-track" aria-hidden="true">
                    <span className="tl-switch-knob" />
                  </span>
                  <span className="tl-switch-label">{t('timeline.compare.label')}</span>
                </button>
                <span className="tl-compare-note">{t('timeline.compare.zeroCost')}</span>
                {comparing && (
                  <div className="ss-seg tl-compare-seg" role="group" aria-label={t('timeline.compare.label')}>
                    {(['stave', 'matrix'] as const).map((v) => (
                      <button
                        type="button"
                        key={v}
                        className={`ss-seg-item${compareView === v ? ' active' : ''}`}
                        aria-pressed={compareView === v}
                        onClick={() => setCompareView(v)}
                      >
                        {t(`timeline.compare.mode.${v}`)}
                      </button>
                    ))}
                  </div>
                )}
              </div>
            </div>

            {cmpState === 'disabled' && (
              <div className="tl-compare-blocked">
                <span className="tl-compare-blocked-title">
                  {t('timeline.compare.blockedTitle')}
                </span>
                <p className="tl-compare-blocked-desc">
                  {t('timeline.noRanked.desc', { n: stats.total })}
                  {/* Zero cost: it only moves focus to the run button on the right. */}
                  <button
                    type="button"
                    className="tl-compare-blocked-hint"
                    onClick={() => {
                      const run = document.querySelector<HTMLButtonElement>(
                        '[data-action="story-order-run"]',
                      );
                      run?.scrollIntoView({ block: 'center', behavior: 'smooth' });
                      run?.focus({ preventScroll: true });
                    }}
                  >
                    {t('timeline.compare.blockedHint')}
                  </button>
                </p>
              </div>
            )}

            <div className="tl-coverage">
              <span className="tl-coverage-label">
                {t('timeline.coverage.prereq', {
                  done: prereq.done,
                  total: prereq.total,
                  pct: prereq.pct,
                })}
              </span>
              <span className="ss-progress tl-coverage-rail" aria-hidden="true">
                <span className="ss-progress-fill" style={{ width: `${prereq.pct}%` }} />
              </span>
              <Link to={`/books/${bookId}/events`} className="tl-link">
                {t('timeline.coverage.toEvents')}
              </Link>
            </div>

            {temporalAnalyzed && temporalIsStale && (
              <div className="tl-stale" role="status">
                <AlertTriangle size={14} aria-hidden="true" />
                <span>
                  {t('timeline.action.displacementStale', {
                    step: staleStep ? tr(`rerun.steps.${staleStep}`) : (data?.temporalStaleReason ?? ''),
                  })}
                </span>
              </div>
            )}

            {noMatch ? (
              <div className="tl-state">
                <h2 className="tl-state-title">{t('timeline.noMatch.title')}</h2>
                <p className="tl-state-desc">{t('timeline.noMatch.desc', { n: filterCount })}</p>
                <button
                  type="button"
                  className="ss-btn ss-btn-sm ss-btn-secondary"
                  onClick={clearFilters}
                >
                  {t('timeline.clearAll')}
                </button>
              </div>
            ) : comparing && compareView === 'matrix' ? (
              <DensityMatrix
                data={visible}
                chapters={chapters}
                dimmedIds={dimmedIds}
                selectedEventId={selectedEventId}
                onSelectEvent={selectEvent}
              />
            ) : (
              <>
                {comparing && (
                  <header className="tl-view-head">
                    <h3 className="tl-view-headline">
                      {t('timeline.stave.headline', {
                        rows: stats.rows,
                        outliers: stats.outliers,
                      })}
                    </h3>
                    <p className="tl-view-meta">
                      {t('timeline.stave.meta', {
                        onLine: stats.onLine,
                        outliers: stats.outliers,
                        unranked: stats.unranked,
                      })}
                    </p>
                  </header>
                )}
                <TimelineStave
                  rows={staveRows}
                  selectedChapter={activeChapter}
                  selectedEventId={selectedEventId}
                  dimmedIds={dimmedIds}
                  onSelectChapter={setSelectedChapter}
                  onSelectEvent={selectEvent}
                />
                {/* Position and analysis state are independent axes, and the
                    unranked strip used to share the hollow mark with 未分析.
                    Each axis gets its own line so neither reads as the other. */}
                <div className="tl-legend">
                  {comparing && <p className="tl-view-legend">{t('timeline.stave.legend')}</p>}
                  <p className="tl-view-legend">
                    <span className="tl-legend-dot" />
                    {t('timeline.legend.analyzed')}
                    <span className="tl-legend-dot unanalyzed" />
                    {t('timeline.legend.unanalyzed')}
                  </p>
                  <p className="tl-view-legend">
                    <span className="tl-legend-dot unranked" />
                    {t('timeline.stave.legendUnranked')}
                  </p>
                </div>
                <ChapterCardBand
                  chapter={activeChapter}
                  chapterTitle={chapterAll[0]?.event.chapterTitle}
                  all={chapterAll}
                  shown={chapterShown}
                  dimmedIds={dimmedIds}
                  selectedEventId={selectedEventId}
                  expanded={expandedChapter === activeChapter}
                  eventTypeLabel={(ty) => t(`timeline.eventTypes.${ty}`, ty)}
                  onSelectEvent={selectEvent}
                  onExpandRest={() => setExpandedChapter(activeChapter)}
                  onClearFilters={clearFilters}
                />
              </>
            )}

            {lanesOn && !noMatch && (
              <CharacterLanes
                data={timelineData}
                chapters={chapters}
                selected={laneCharacters}
                available={filterOptions.characters}
                selectedEventId={selectedEventId}
                onSelectEvent={selectEvent}
                onRemove={(id) => setLaneIds((ids) => ids.filter((x) => x !== id))}
                onAdd={(id) => setLaneIds((ids) => ids.slice(0, MAX_LANES - 1).concat(id))}
                onClear={() => setLaneIds([])}
              />
            )}
          </div>

          {panelOpen && selectedDatum && (
            <EventDetailPanel
              datum={selectedDatum}
              totalEvents={stats.total}
              unanalyzedCount={stats.total - stats.analyzed}
              chapterTitle={selectedDatum.event.chapterTitle}
              eventTypeLabel={(ty) => t(`timeline.eventTypes.${ty}`, ty)}
              sourceJumpPending={pendingKey === selectedDatum.id}
              onClose={() => setPanelOpen(false)}
              onJumpToSource={() => {
                void jump(
                  selectedDatum.id,
                  selectedDatum.event.description || selectedDatum.title,
                  { chapter: selectedDatum.chapter },
                );
              }}
              onOpenGraph={() => navigate(`/books/${bookId}/graph?focus=${selectedDatum.id}`)}
            />
          )}
        </div>
      </div>

      <ConfirmDialog
        open={confirm === 'story'}
        title={t(hasStoryOrder ? 'timeline.confirm.storyTitle' : 'timeline.confirm.storyFirstTitle')}
        message={
          hasStoryOrder
            ? t('timeline.confirm.storyBody', { total: stats.total, ranked: stats.ranked })
            : t('timeline.confirm.storyFirstBody', { total: stats.total })
        }
        confirmLabel={t('timeline.confirm.start')}
        spendsTokens
        onConfirm={() => {
          void runStoryOrder();
        }}
        onCancel={() => setConfirm(null)}
      />
      <ConfirmDialog
        open={confirm === 'displacement'}
        title={t('timeline.confirm.displacementTitle')}
        message={t('timeline.confirm.displacementBody', { total: stats.total })}
        confirmLabel={t('timeline.confirm.start')}
        spendsTokens
        onConfirm={() => {
          void runDisplacement();
        }}
        onCancel={() => setConfirm(null)}
      />
    </div>
  );
}
