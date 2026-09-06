/**
 * Timeline page — 章節順序 / 故事時序 / 矩陣視圖.
 *
 * Rebuilt from the Claude Design decision canvas
 * (`docs/handoff/20260725-timeline-page`). Three deviations from that canvas
 * are deliberate and recorded in `docs/plans/20260725-timeline-page-enhancements.md`:
 *
 *  1. The 倒敘與預敘 action is gated on the real `storyTimeHint` coverage
 *     (`coverage_sufficient`), not on "the story-order run finished". The two
 *     draw on different data, so running story order does not unblock it —
 *     the canvas assumed otherwise and would have promised something the
 *     backend cannot deliver.
 *  2. Filtering keeps both display modes (dim / only). The canvas dropped
 *     dim; position on the stave is exactly the context dimming preserves.
 *  3. All headline prose is computed. The canvas hardcoded its sample book's
 *     counts and chapter references.
 *
 * The horizontal/vertical layout toggle is gone: the stave is a fixed-width
 * multi-row chart, so "arrangement direction" no longer denotes anything.
 */

import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { useNavigate, useParams, useSearchParams } from 'react-router-dom';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { useTranslation } from 'react-i18next';
import { AlertTriangle, Loader2, Sparkles, X } from 'lucide-react';
import { useChatDispatch } from '@/contexts/ChatContext';
import { useToast } from '@/contexts/ToastContext';
import { useBook } from '@/hooks/useBook';
import { useTimeline } from '@/hooks/useTimeline';
import { useTaskPolling } from '@/hooks/useTaskPolling';
import { useSourceJump } from '@/hooks/useSourceJump';
import { computeTimeline } from '@/api/timeline';
import { fetchTemporalCoverage, triggerTemporalAnalysis } from '@/api/narrative';
import { triggerBatchEventAnalysis } from '@/api/analysis';
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
import { TimelineOnboardingHero } from '@/components/timeline/TimelineOnboardingHero';
import { TimelineToolbar, type ActionRowState } from '@/components/timeline/TimelineToolbar';
import { FilterSheet } from '@/components/timeline/FilterSheet';
import { TimelineStave } from '@/components/timeline/TimelineStave';
import { ChapterCardBand } from '@/components/timeline/ChapterCardBand';
import { StoryOrderView } from '@/components/timeline/StoryOrderView';
import { MatrixCanvas } from '@/components/timeline/MatrixCanvas';
import { CharacterLanes } from '@/components/timeline/CharacterLanes';
import { EventDetailPanel } from '@/components/timeline/EventDetailPanel';
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
import type { TimelineOrder } from '@/api/types';
import '@/styles/timeline.css';
import { qk } from '@/api/queryKeys';

type ViewKey = 'chapter' | 'story' | 'matrix';

const VIEW_TO_ORDER: Record<ViewKey, TimelineOrder> = {
  chapter: 'narrative',
  story: 'chronological',
  matrix: 'matrix',
};

const VIEWS: ViewKey[] = ['chapter', 'story', 'matrix'];

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
  const { push } = useToast();
  const [searchParams, setSearchParams] = useSearchParams();

  /* ── State ─────────────────────────────────────────────────── */

  const view = (searchParams.get('view') as ViewKey) ?? 'chapter';
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
  const [confirm, setConfirm] = useState<'story' | 'displacement' | 'events' | null>(null);
  const [computeTaskId, setComputeTaskId] = useState<string | null>(null);
  const [displacementTaskId, setDisplacementTaskId] = useState<string | null>(null);
  const [eventsTaskId, setEventsTaskId] = useState<string | null>(null);

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
  /* Always fetch narrative order. Every view is derived from it client-side
     (story order sorts by rank, the matrix reads rank as its Y axis), and
     `index` — which the stave and the character lanes position by — has to
     mean "position in the book" identically across all three. Fetching
     `order=chronological` returns the same events sorted by rank, which
     silently redefines that index and shifts the lanes. */
  const { data, isLoading, isPlaceholderData, error, refetch } = useTimeline(
    bookId,
    'narrative',
  );
  const { data: computeTask } = useTaskPolling(computeTaskId);
  const { data: displacementTask } = useTaskPolling(displacementTaskId);
  const { data: eventsTask } = useTaskPolling(eventsTaskId);
  /** Read off the task result, not the coverage query: the run reports what it
   *  actually saw, and the query may be stale by the time it finishes. */
  const displacementCoverageOk = displacementTask?.result?.coverage_sufficient === true;
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

  /** Narrative-order data is the basis for every view: deviation only means
   *  something relative to the order the book tells things in. */
  const timelineData = useMemo(() => buildTimelineData(events), [events]);
  const stats = useMemo(() => timelineStats(timelineData), [timelineData]);
  const chapters = useMemo(() => chapterList(timelineData), [timelineData]);
  const filterOptions = useMemo(() => buildFilterOptions(events), [events]);

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
      }
      if (d.event.location) bump(`locations:${d.event.location.id}`);
    }
    return counts;
  }, [timelineData]);

  const staveRows = useMemo(
    () =>
      buildStaveRows(timelineData, (d) =>
        anyFilter && filterMode === 'only' ? matches.has(d.id) : true,
      ),
    [timelineData, matches, anyFilter, filterMode],
  );

  const activeChapter = selectedChapter ?? chapters[0] ?? 1;
  const selectedDatum = useMemo(
    () => timelineData.find((d) => d.id === selectedEventId) ?? null,
    [timelineData, selectedEventId],
  );

  const rankedVisible = useMemo(
    () =>
      visible
        .filter((d) => d.chronologicalRank !== null)
        .slice()
        .sort((a, b) => a.chronologicalRank! - b.chronologicalRank!),
    [visible],
  );
  const unrankedVisible = useMemo(
    () => visible.filter((d) => d.chronologicalRank === null),
    [visible],
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
         coverage without calling the LLM. Reporting that as success is how a
         run that analyzed nothing came to look like one that worked. */
      const analyzed = displacementCoverageOk;
      push(
        analyzed
          ? { type: 'success', title: t('timeline.toast.displacementDone') }
          : {
              type: 'warning',
              title: t('timeline.toast.displacementSkipped'),
              body: t('timeline.toast.displacementSkippedDesc'),
            },
      );
    } else if (displacementTask?.status === 'error') {
      setDisplacementTaskId(null);
      push({ type: 'error', title: t('timeline.toast.displacementFailed') });
    }
  }, [displacementTask?.status, displacementCoverageOk, bookId, queryClient, push, t]);

  useEffect(() => {
    if (eventsTask?.status === 'done') {
      setEventsTaskId(null);
      queryClient.invalidateQueries({ queryKey: qk.timeline.all(bookId) });
      push({ type: 'success', title: t('timeline.toast.eventsDone') });
    } else if (eventsTask?.status === 'error') {
      setEventsTaskId(null);
      push({ type: 'error', title: t('timeline.toast.eventsFailed') });
    }
  }, [eventsTask?.status, bookId, queryClient, push, t]);

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

  const runStoryOrder = useCallback(async () => {
    if (!bookId || isComputing) return;
    setConfirm(null);
    const { taskId } = await computeTimeline(bookId);
    setComputeTaskId(taskId);
  }, [bookId, isComputing]);

  const runEventAnalysis = useCallback(async () => {
    if (!bookId || eventsTaskId) return;
    setConfirm(null);
    const { taskId } = await triggerBatchEventAnalysis(bookId);
    setEventsTaskId(taskId);
  }, [bookId, eventsTaskId]);

  const runDisplacement = useCallback(async () => {
    if (!bookId || isRunningDisplacement) return;
    setConfirm(null);
    const task = await triggerTemporalAnalysis(bookId, book?.language ?? 'en');
    setDisplacementTaskId(task.taskId);
  }, [bookId, book?.language, isRunningDisplacement]);

  /** What #21h actually produced for this book — the signal that was missing
   *  when 倒敘與預敘 could not tell a first run from a re-run. */
  const temporalAnalyzed = data?.temporalAnalyzed === true;
  /** A pipeline step re-ran after this analysis was cached, so its verdicts
   *  describe events that no longer exist. Reported on the action row rather
   *  than a separate banner — the re-run button is already right there. */
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

  const coveragePct = Math.round((coverage?.coverage ?? 0) * 100);
  /** The real gate — story-time hints, which the story-order run does not
   *  produce. Running story order will NOT unblock this. */
  const displacementReady = coverage?.coverage_sufficient === true;

  const isAnalyzingEvents = eventsTaskId !== null;
  const analyzedPct =
    stats.total > 0 ? Math.round((stats.analyzed / stats.total) * 100) : 0;
  const eventsProgressPct = Math.round(eventsTask?.progress ?? 0);

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
        ? temporalIsStale
          ? t('timeline.action.displacementStale', {
              step: data?.temporalStaleReason ?? '',
            })
          : t('timeline.action.displacementDone', {
              analepsis: verdictCounts.analepsis,
              prolepsis: verdictCounts.prolepsis,
            })
        : displacementReady
          ? t('timeline.action.displacementReady', { pct: coveragePct })
          : t('timeline.action.displacementBlocked', { pct: coveragePct }),
    sub: isRunningDisplacement
      ? t('timeline.action.leavePageOk')
      : displacementReady
        ? t(
            temporalAnalyzed
              ? 'timeline.action.displacementCostRerun'
              : 'timeline.action.displacementCost',
          )
        : t('timeline.action.displacementUnblock'),
    runLabel: t(
      temporalAnalyzed
        ? 'timeline.action.displacementRerun'
        : 'timeline.action.displacementRun',
    ),
    blocked: !displacementReady && !isRunningDisplacement,
    onSubClick:
      !displacementReady && !isRunningDisplacement
        ? () => navigate(`/books/${bookId}/events`)
        : undefined,
  };

  /* ── Render ────────────────────────────────────────────────── */

  if (error) {
    return (
      <div className="tl tl-centered">
        <AlertTriangle size={28} className="tl-state-icon" />
        <h2 className="tl-state-title">{t('timeline.error.title')}</h2>
        <p className="tl-state-desc">{t('timeline.error.desc')}</p>
        <button
          type="button"
          className="tl-btn tl-btn-primary"
          onClick={() => {
            void refetch();
          }}
        >
          {t('timeline.error.retry')}
        </button>
      </div>
    );
  }

  if (isLoading && !data) {
    return (
      <div className="tl tl-centered">
        <Loader2 className="tl-spinner" size={22} />
        <span className="tl-loading-text">{t(`timeline.loadingBy.${view}`)}</span>
        <div className="tl-skeletons">
          {[78, 92, 60].map((w) => (
            <div className="tl-skeleton" key={w} style={{ width: `${w}%` }} />
          ))}
        </div>
      </div>
    );
  }

  if (events.length === 0 && bookId) {
    return (
      <div className="tl">
        <TimelineOnboardingHero bookId={bookId} />
      </div>
    );
  }

  const noMatch = visible.length === 0;
  const noRanked = view !== 'chapter' && rankedVisible.length === 0 && visible.length > 0;
  /** Nothing in the *book* is ranked — deliberately not filter-aware, so a
   *  filter that happens to exclude every ranked event does not read as
   *  "story order was never computed". */
  const storyOrderMissing = stats.total > 0 && stats.ranked === 0;

  const chapterAll = timelineData.filter((d) => d.chapter === activeChapter);
  const chapterShown = visible.filter((d) => d.chapter === activeChapter);

  const clearFilters = () => {
    setFilter(createDefaultFilter());
    setOnlyAnalyzed(false);
  };

  /* The dot marks say which *events* were analyzed; this says how much of the
     book was — the number the marks add up to and the legend cannot carry.
     Rendered outside the header/prompt branch on purpose: EEP coverage is what
     the story-order run reads from, so the state that offers "compute story
     order" is exactly the one that must also show how little there is to read
     (`POST /timeline/compute` is documented as needing EEP first). Shown at
     full coverage too — "it has run" is the other half of the distinction. */
  const coverageRow = (
    <div className="tl-coverage">
      <div className="tl-coverage-text">
        <span className="tl-coverage-label">{t('timeline.coverage.label')}</span>
        <span className="tl-coverage-count">
          {isAnalyzingEvents
            ? t('timeline.coverage.running')
            : t('timeline.coverage.count', {
                done: stats.analyzed,
                total: stats.total,
                pct: analyzedPct,
              })}
        </span>
      </div>
      <div className="tl-coverage-rail">
        <div
          className="tl-coverage-fill"
          style={{ width: `${isAnalyzingEvents ? eventsProgressPct : analyzedPct}%` }}
        />
      </div>
      {stats.analyzed < stats.total && (
        <button
          type="button"
          className="tl-btn tl-btn-accent"
          onClick={() => setConfirm('events')}
          disabled={isAnalyzingEvents}
        >
          <Sparkles size={12} className="tl-btn-ai" aria-hidden="true" />
          {t(
            isAnalyzingEvents
              ? 'timeline.coverage.actionRunning'
              : 'timeline.coverage.action',
            { n: stats.total - stats.analyzed },
          )}
        </button>
      )}
    </div>
  );

  return (
    <div className="tl">
      <nav className="tl-tabs" aria-label={t('timeline.viewTabs')}>
        {VIEWS.map((v) => (
          <button
            type="button"
            key={v}
            className={`tl-tab${view === v ? ' active' : ''}`}
            onClick={() => setParam('view', v)}
            aria-current={view === v}
          >
            <span className="tl-tab-name">{t(`timeline.tabs.${VIEW_TO_ORDER[v]}`)}</span>
            <span className="tl-tab-sub">{t(`timeline.modeSub.${VIEW_TO_ORDER[v]}`)}</span>
          </button>
        ))}
        <span className="tl-tabs-keys">{t('timeline.keyHint')}</span>
      </nav>

      <TimelineToolbar
        totalCount={stats.total}
        analyzedCount={stats.analyzed}
        matchCount={matches.size}
        onlyAnalyzed={onlyAnalyzed}
        onOnlyAnalyzedChange={setOnlyAnalyzed}
        filterCount={filterCount}
        filterMode={filterMode}
        filterOpen={filterOpen}
        onToggleFilter={() => setFilterOpen((v) => !v)}
        lanesOn={lanesOn}
        onToggleLanes={() => setLanesOn((v) => !v)}
        storyOrder={storyOrderState}
        onRunStoryOrder={() => setConfirm('story')}
        onCancelStoryOrder={() => setComputeTaskId(null)}
        displacement={displacementState}
        onRunDisplacement={() => setConfirm('displacement')}
        onCancelDisplacement={() => setDisplacementTaskId(null)}
      >
        {filterOpen && (
          <div className="tl-filter-popover" ref={filterRef}>
            <FilterSheet
              filter={filter}
              onChange={setFilter}
              onClose={() => setFilterOpen(false)}
              options={filterOptions}
              counts={filterCounts}
              mode={filterMode}
              onModeChange={setFilterMode}
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
          {isPlaceholderData && (
            <div className="tl-refreshing">
              <Loader2 className="tl-spinner" size={13} />
              {t(`timeline.loadingBy.${view}`)}
            </div>
          )}

          {noMatch ? (
            <div className="tl-state">
              <AlertTriangle size={26} className="tl-state-icon" />
              <h2 className="tl-state-title">{t('timeline.noMatch.title')}</h2>
              <p className="tl-state-desc">{t('timeline.noMatch.desc', { n: filterCount })}</p>
              <button type="button" className="tl-btn tl-btn-accent" onClick={clearFilters}>
                {t('timeline.clearAll')}
              </button>
            </div>
          ) : noRanked ? (
            /* Every matching event lacks a rank, so this view has no axis to
               place them on. Listing them beats rendering an empty plot. */
            <div className="tl-state">
              <h2 className="tl-state-title">
                {t(view === 'matrix' ? 'timeline.noRanked.matrix' : 'timeline.noRanked.story')}
              </h2>
              <p className="tl-state-desc">
                {t('timeline.noRanked.desc', { n: visible.length })}
              </p>
              <div className="tl-state-chips">
                {visible.map((d) => (
                  <button
                    type="button"
                    key={d.id}
                    className="tl-story-chip"
                    onClick={() => selectEvent(d)}
                  >
                    <span className="tl-story-chip-ch">Ch.{d.chapter}</span>
                    {d.title}
                  </button>
                ))}
              </div>
              <div className="tl-state-actions">
                <button type="button" className="tl-btn" onClick={clearFilters}>
                  {t('timeline.clearAll')}
                </button>
                <button
                  type="button"
                  className="tl-btn tl-btn-accent"
                  onClick={() => setConfirm('story')}
                >
                  <Sparkles size={12} className="tl-btn-ai" aria-hidden="true" />
                  {t(
                    hasStoryOrder
                      ? 'timeline.action.storyOrderRun'
                      : 'timeline.action.storyOrderRunFirst',
                  )}
                </button>
              </div>
            </div>
          ) : view === 'chapter' ? (
            <>
              {/* Before the story-order run there is no rank to deviate from,
                  so the stave draws no dots at all. The default headline reads
                  "0 次掉出去" there, which is indistinguishable from a book
                  that simply tells events in order — say instead that nothing
                  has been computed, and put the run where the dots are
                  missing. */}
              {storyOrderMissing ? (
                <div className="tl-prompt">
                  <h2 className="tl-prompt-title">{t('timeline.storyOrderPrompt.title')}</h2>
                  <p className="tl-prompt-desc">
                    {t('timeline.storyOrderPrompt.desc', { n: stats.total })}
                  </p>
                  <button
                    type="button"
                    className="tl-btn tl-btn-accent"
                    onClick={() => setConfirm('story')}
                    disabled={isComputing}
                  >
                    <Sparkles size={12} className="tl-btn-ai" aria-hidden="true" />
                    {t(
                      isComputing
                        ? 'timeline.storyOrderPrompt.running'
                        : 'timeline.storyOrderPrompt.action',
                    )}
                  </button>
                </div>
              ) : (
                <header className="tl-view-head">
                  <h2 className="tl-view-headline">
                    {t('timeline.stave.headline', {
                      rows: stats.rows,
                      outliers: stats.outliers,
                    })}
                  </h2>
                  <p className="tl-view-meta">
                    {t('timeline.stave.meta', {
                      onLine: stats.onLine,
                      outliers: stats.outliers,
                      unranked: stats.unranked,
                    })}
                  </p>
                  <p className="tl-view-legend">{t('timeline.stave.legend')}</p>
                  {/* Position and analysis state are independent axes, and the
                      unranked strip used to share the hollow mark with 未分析.
                      Each axis gets its own line so neither reads as the other. */}
                  <p className="tl-view-legend">
                    <span className="tl-legend-dot" />
                    {t('timeline.legend.analyzed')}
                    <span className="tl-legend-dot unanalyzed" />
                    {t('timeline.legend.unanalyzed')}
                  </p>
                  {stats.unranked > 0 && (
                    <p className="tl-view-legend">
                      <span className="tl-legend-dot unranked" />
                      {t('timeline.stave.legendUnranked')}
                    </p>
                  )}
                </header>
              )}
              {coverageRow}
              <TimelineStave
                rows={staveRows}
                selectedChapter={activeChapter}
                selectedEventId={selectedEventId}
                dimmedIds={dimmedIds}
                onSelectChapter={setSelectedChapter}
                onSelectEvent={selectEvent}
              />
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
                onAnalyzeChapter={() => navigate(`/books/${bookId}/events`)}
              />
            </>
          ) : view === 'story' ? (
            <StoryOrderView
              ranked={rankedVisible}
              unranked={unrankedVisible}
              dimmedIds={dimmedIds}
              selectedEventId={selectedEventId}
              onSelectEvent={selectEvent}
              onShowAllUnranked={() => setFilterMode('only')}
            />
          ) : (
            <MatrixCanvas
              data={visible}
              chapters={chapters}
              dimmedIds={dimmedIds}
              selectedChapter={activeChapter}
              selectedEventId={selectedEventId}
              outlierCount={stats.outliers}
              onSelectChapter={setSelectedChapter}
              onSelectEvent={selectEvent}
            />
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

      <ConfirmDialog
        open={confirm === 'story'}
        title={t(hasStoryOrder ? 'timeline.confirm.storyTitle' : 'timeline.confirm.storyFirstTitle')}
        message={
          hasStoryOrder
            ? t('timeline.confirm.storyBody', { total: stats.total, ranked: stats.ranked })
            : t('timeline.confirm.storyFirstBody', { total: stats.total })
        }
        confirmLabel={t('timeline.confirm.start')}
        onConfirm={() => {
          void runStoryOrder();
        }}
        onCancel={() => setConfirm(null)}
      />
      <ConfirmDialog
        open={confirm === 'events'}
        title={t('timeline.confirm.eventsTitle')}
        message={t('timeline.confirm.eventsBody', { n: stats.total - stats.analyzed })}
        confirmLabel={t('timeline.confirm.start')}
        onConfirm={() => {
          void runEventAnalysis();
        }}
        onCancel={() => setConfirm(null)}
      />
      <ConfirmDialog
        open={confirm === 'displacement'}
        title={t('timeline.confirm.displacementTitle')}
        message={t('timeline.confirm.displacementBody', { total: stats.total })}
        confirmLabel={t('timeline.confirm.start')}
        onConfirm={() => {
          void runDisplacement();
        }}
        onCancel={() => setConfirm(null)}
      />
    </div>
  );
}
