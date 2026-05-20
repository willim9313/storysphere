import {
  useState,
  useMemo,
  useCallback,
  useEffect,
  useRef,
  useLayoutEffect,
} from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { useTranslation } from 'react-i18next';
import {
  ArrowLeftRight,
  ArrowUpDown,
  RefreshCw,
  Loader2,
  X,
  ChevronDown,
  ChevronRight,
  SlidersHorizontal,
  Search,
  AlertTriangle,
  List,
  TrendingUp,
  LayoutGrid,
} from 'lucide-react';
import { useChatContext } from '@/contexts/ChatContext';
import { useBook } from '@/hooks/useBook';
import { useTimeline } from '@/hooks/useTimeline';
import { useTaskPolling } from '@/hooks/useTaskPolling';
import { computeTimeline } from '@/api/timeline';
import { fetchEventAnalysisDetail } from '@/api/analysis';
import { LoadingSpinner } from '@/components/ui/LoadingSpinner';
import { ErrorMessage } from '@/components/ui/ErrorMessage';
import { MatrixCanvas } from '@/components/timeline/MatrixCanvas';
import { NarrativeIcon } from '@/components/timeline/NarrativeIcon';
import type {
  TimelineOrder,
  TimelineEvent,
  TemporalRelation,
  EventAnalysisDetail,
  EntityType,
} from '@/api/types';
import '@/styles/timeline.css';

type LayoutDirection = 'horizontal' | 'vertical';

/* ── Filter state ───────────────────────────────────────────── */

interface FilterState {
  eventTypes: Set<string>;
  narrativeModes: Set<string>;
  characters: Set<string>;
  locations: Set<string>;
  importance: Set<string>;
}

function createDefaultFilter(): FilterState {
  return {
    eventTypes: new Set(),
    narrativeModes: new Set(),
    characters: new Set(),
    locations: new Set(),
    importance: new Set(),
  };
}

function isFilterActive(f: FilterState): boolean {
  return (
    f.eventTypes.size > 0 ||
    f.narrativeModes.size > 0 ||
    f.characters.size > 0 ||
    f.locations.size > 0 ||
    f.importance.size > 0
  );
}

function activeFilterCount(f: FilterState): number {
  let count = 0;
  if (f.eventTypes.size > 0) count++;
  if (f.narrativeModes.size > 0) count++;
  if (f.characters.size > 0) count++;
  if (f.locations.size > 0) count++;
  if (f.importance.size > 0) count++;
  return count;
}

function eventPassesFilter(event: TimelineEvent, filter: FilterState): boolean {
  if (filter.eventTypes.size > 0 && !filter.eventTypes.has(event.eventType)) return false;
  if (filter.narrativeModes.size > 0 && !filter.narrativeModes.has(event.narrativeMode)) return false;
  if (filter.importance.size > 0 && !filter.importance.has(event.eventImportance ?? '')) return false;
  if (filter.characters.size > 0) {
    const hasMatch = event.participants.some(
      (p) => p.type === 'character' && filter.characters.has(p.id),
    );
    if (!hasMatch) return false;
  }
  if (filter.locations.size > 0) {
    if (!event.location || !filter.locations.has(event.location.id)) return false;
  }
  return true;
}

interface ActiveFilterTag {
  key: string;
  label: string;
  remove: () => void;
}

function buildActiveFilterTags(
  filter: FilterState,
  onChange: (f: FilterState) => void,
  options: FilterOptions,
  modeLabel: (mode: string) => string,
): ActiveFilterTag[] {
  const tags: ActiveFilterTag[] = [];
  const removeFrom = (key: keyof FilterState, value: string) => {
    const next = { ...filter, [key]: new Set(filter[key]) };
    next[key].delete(value);
    onChange(next);
  };
  filter.eventTypes.forEach((v) =>
    tags.push({ key: `et-${v}`, label: v, remove: () => removeFrom('eventTypes', v) }),
  );
  filter.narrativeModes.forEach((v) =>
    tags.push({ key: `nm-${v}`, label: modeLabel(v), remove: () => removeFrom('narrativeModes', v) }),
  );
  filter.characters.forEach((id) => {
    const name = options.characters.find((c) => c.id === id)?.name ?? id;
    tags.push({ key: `ch-${id}`, label: name, remove: () => removeFrom('characters', id) });
  });
  filter.locations.forEach((id) => {
    const name = options.locations.find((l) => l.id === id)?.name ?? id;
    tags.push({ key: `lo-${id}`, label: name, remove: () => removeFrom('locations', id) });
  });
  filter.importance.forEach((v) =>
    tags.push({ key: `im-${v}`, label: v, remove: () => removeFrom('importance', v) }),
  );
  return tags;
}

interface FilterOptions {
  eventTypes: string[];
  narrativeModes: string[];
  characters: { id: string; name: string }[];
  locations: { id: string; name: string }[];
}

/* ── Helpers ────────────────────────────────────────────────── */

function chapterLabel(ch: number): string {
  return `Ch.${ch}`;
}

function pillTypeClass(type: EntityType): string {
  return `tl-pill tl-pill-${type}`;
}

/* ── Main component ─────────────────────────────────────────── */

export default function TimelinePage() {
  const { bookId } = useParams<{ bookId: string }>();
  const navigate = useNavigate();
  const queryClient = useQueryClient();
  const [order, setOrder] = useState<TimelineOrder>('narrative');
  const [layout, setLayout] = useState<LayoutDirection>('horizontal');
  const [computeTaskId, setComputeTaskId] = useState<string | null>(null);
  const [selectedEventId, setSelectedEventId] = useState<string | null>(null);
  const [filter, setFilter] = useState<FilterState>(createDefaultFilter);
  const [filterOpen, setFilterOpen] = useState(false);
  const { t } = useTranslation('analysis');

  const modeLabel = useCallback(
    (mode: string) => t(`timeline.narrativeModes.${mode}`, mode),
    [t],
  );

  const { setPageContext } = useChatContext();
  const { data: book } = useBook(bookId);
  const { data, isLoading, error } = useTimeline(bookId, order);
  const { data: computeTask } = useTaskPolling(computeTaskId);

  useEffect(() => {
    setPageContext({ page: 'timeline', bookId, bookTitle: book?.title });
  }, [bookId, book?.title, setPageContext]);

  useEffect(() => {
    if (selectedEventId && data?.events) {
      const event = data.events.find((e) => e.id === selectedEventId);
      if (event) {
        setPageContext({ selectedEntity: { id: event.id, name: event.title, type: 'event' } });
        return;
      }
    }
    setPageContext({ selectedEntity: undefined });
  }, [selectedEventId, data?.events, setPageContext]);

  const nodeRefs = useRef<Map<string, HTMLDivElement>>(new Map());
  const canvasRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (computeTask?.status === 'done') {
      setComputeTaskId(null);
      queryClient.invalidateQueries({ queryKey: ['books', bookId, 'timeline'] });
    }
  }, [computeTask?.status, bookId, queryClient]);

  const isComputing =
    computeTaskId !== null &&
    computeTask?.status !== 'done' &&
    computeTask?.status !== 'error';

  const handleCompute = useCallback(async () => {
    if (!bookId || isComputing) return;
    const { taskId } = await computeTimeline(bookId);
    setComputeTaskId(taskId);
  }, [bookId, isComputing]);

  const sortedEvents = useMemo(() => {
    if (!data?.events) return [];
    const events = [...data.events];
    if (order === 'chronological') {
      events.sort(
        (a, b) => (a.chronologicalRank ?? 0) - (b.chronologicalRank ?? 0),
      );
    }
    return events;
  }, [data?.events, order]);

  const temporalRelations = data?.temporalRelations ?? [];

  const filterOptions: FilterOptions = useMemo(() => {
    const eventTypes = new Set<string>();
    const narrativeModes = new Set<string>();
    const characters = new Map<string, string>();
    const locations = new Map<string, string>();
    for (const evt of sortedEvents) {
      eventTypes.add(evt.eventType);
      narrativeModes.add(evt.narrativeMode);
      for (const p of evt.participants) {
        if (p.type === 'character') characters.set(p.id, p.name);
      }
      if (evt.location) locations.set(evt.location.id, evt.location.name);
    }
    return {
      eventTypes: [...eventTypes],
      narrativeModes: [...narrativeModes],
      characters: [...characters.entries()].map(([id, name]) => ({ id, name })),
      locations: [...locations.entries()].map(([id, name]) => ({ id, name })),
    };
  }, [sortedEvents]);

  const passesFilter = useMemo(() => {
    const active = isFilterActive(filter);
    const map = new Map<string, boolean>();
    for (const evt of sortedEvents) {
      map.set(evt.id, !active || eventPassesFilter(evt, filter));
    }
    return map;
  }, [sortedEvents, filter]);

  const chapterGroups = useMemo(() => {
    if (order !== 'narrative') return [];
    const groups: { chapter: number; title?: string; count: number }[] = [];
    let current: (typeof groups)[0] | null = null;
    for (const evt of sortedEvents) {
      if (!current || current.chapter !== evt.chapter) {
        current = { chapter: evt.chapter, title: evt.chapterTitle, count: 1 };
        groups.push(current);
      } else {
        current.count++;
      }
    }
    return groups;
  }, [sortedEvents, order]);

  const eventMap = useMemo(() => {
    const map = new Map<string, TimelineEvent>();
    for (const evt of sortedEvents) map.set(evt.id, evt);
    return map;
  }, [sortedEvents]);

  const jumpToEvent = useCallback((eventId: string) => {
    setSelectedEventId(eventId);
    const node = nodeRefs.current.get(eventId);
    if (node) {
      node.scrollIntoView({ behavior: 'smooth', block: 'center', inline: 'center' });
    }
  }, []);

  const selectedEvent = selectedEventId ? eventMap.get(selectedEventId) : undefined;

  if (isLoading) return <LoadingSpinner />;
  if (error) return <ErrorMessage message={error.message} />;

  const quality = data?.quality;
  const hasRanks = quality?.hasChronologicalRanks ?? false;

  const activeTags = buildActiveFilterTags(filter, setFilter, filterOptions, modeLabel);

  return (
    <div className="tl">
      <Toolbar
        order={order}
        onOrderChange={setOrder}
        layout={layout}
        onLayoutChange={setLayout}
        quality={quality}
        hasRanks={hasRanks}
        isComputing={isComputing}
        onCompute={handleCompute}
        filterCount={activeFilterCount(filter)}
        filterOpen={filterOpen}
        onToggleFilter={() => setFilterOpen((v) => !v)}
        onCloseFilter={() => setFilterOpen(false)}
        filter={filter}
        onFilterChange={setFilter}
        filterOptions={filterOptions}
        modeLabel={modeLabel}
        activeTags={activeTags}
        onClearFilters={() => setFilter(createDefaultFilter())}
      />

      <div className="tl-main">
        <div className="tl-canvas" ref={canvasRef}>
          {order === 'matrix' ? (
            <MatrixCanvas
              events={sortedEvents}
              passesFilter={passesFilter}
              selectedEventId={selectedEventId}
              onSelectEvent={setSelectedEventId}
            />
          ) : (
            <TimelineCanvas
              events={sortedEvents}
              chapterGroups={chapterGroups}
              layout={layout}
              order={order}
              temporalRelations={temporalRelations}
              selectedEventId={selectedEventId}
              passesFilter={passesFilter}
              nodeRefs={nodeRefs}
              canvasRef={canvasRef}
              onSelectEvent={setSelectedEventId}
            />
          )}
        </div>

        {selectedEvent && bookId && (
          <EventDetailPanel
            event={selectedEvent}
            bookId={bookId}
            eventMap={eventMap}
            onClose={() => setSelectedEventId(null)}
            onJumpToEvent={jumpToEvent}
            onGoToAnalysis={() => navigate(`/books/${bookId}/analysis`)}
            modeLabel={modeLabel}
          />
        )}
      </div>
    </div>
  );
}

/* ── Toolbar ─────────────────────────────────────────────────── */

interface ToolbarProps {
  order: TimelineOrder;
  onOrderChange: (o: TimelineOrder) => void;
  layout: LayoutDirection;
  onLayoutChange: (d: LayoutDirection) => void;
  quality:
    | {
        eepCoverage: number;
        analyzedCount: number;
        totalCount: number;
        hasChronologicalRanks: boolean;
      }
    | undefined;
  hasRanks: boolean;
  isComputing: boolean;
  onCompute: () => void;
  filterCount: number;
  filterOpen: boolean;
  onToggleFilter: () => void;
  onCloseFilter: () => void;
  filter: FilterState;
  onFilterChange: (f: FilterState) => void;
  filterOptions: FilterOptions;
  modeLabel: (mode: string) => string;
  activeTags: ActiveFilterTag[];
  onClearFilters: () => void;
}

function Toolbar({
  order,
  onOrderChange,
  layout,
  onLayoutChange,
  quality,
  hasRanks,
  isComputing,
  onCompute,
  filterCount,
  filterOpen,
  onToggleFilter,
  onCloseFilter,
  filter,
  onFilterChange,
  filterOptions,
  modeLabel,
  activeTags,
  onClearFilters,
}: ToolbarProps) {
  const { t } = useTranslation('analysis');
  const noRanks = !hasRanks;
  const coverage = quality?.eepCoverage ?? 0;
  const lowCoverage = coverage < 0.5;

  const modes: {
    value: TimelineOrder;
    icon: React.ReactNode;
    title: string;
    sub: string;
    warn: boolean;
  }[] = [
    {
      value: 'narrative',
      icon: <List size={14} />,
      title: t('timeline.tabs.narrative'),
      sub: t('timeline.modeSub.narrative'),
      warn: false,
    },
    {
      value: 'chronological',
      icon: <TrendingUp size={14} />,
      title: t('timeline.tabs.chronological'),
      sub: t('timeline.modeSub.chronological'),
      warn: noRanks,
    },
    {
      value: 'matrix',
      icon: <LayoutGrid size={14} />,
      title: t('timeline.tabs.matrix'),
      sub: t('timeline.modeSub.matrix'),
      warn: noRanks,
    },
  ];

  return (
    <div className="tl-toolbar" style={{ position: 'relative' }}>
      <div className="tl-tb-row">
        <div className="tl-mode-rail">
          {modes.map((m) => (
            <button
              key={m.value}
              type="button"
              className="tl-mode-card"
              aria-selected={order === m.value}
              onClick={() => onOrderChange(m.value)}
            >
              {m.warn && <span className="tl-warn-dot" title={t('timeline.noRanksTooltip')} />}
              <div className="tl-mode-card-title">
                <span className="tl-mode-card-icon">{m.icon}</span>
                {m.title}
              </div>
              <div className="tl-mode-card-sub">{m.sub}</div>
            </button>
          ))}
        </div>

        <div className="tl-tb-actions">
          {order !== 'matrix' && (
            <div className="tl-layout-toggle" role="group" aria-label={t('timeline.layoutToggle')}>
              <button
                type="button"
                aria-selected={layout === 'horizontal'}
                onClick={() => onLayoutChange('horizontal')}
                title={t('timeline.switchToHorizontal')}
              >
                <ArrowLeftRight size={13} />
              </button>
              <button
                type="button"
                aria-selected={layout === 'vertical'}
                onClick={() => onLayoutChange('vertical')}
                title={t('timeline.switchToVertical')}
              >
                <ArrowUpDown size={13} />
              </button>
            </div>
          )}

          <button type="button" className="tl-btn" onClick={onToggleFilter}>
            <SlidersHorizontal size={13} />
            {t('timeline.filter')}
            {filterCount > 0 && <span className="tl-badge">{filterCount}</span>}
          </button>

          {!noRanks && quality && (
            <button
              type="button"
              className="tl-quality-chip"
              title={t('timeline.qualityTooltip')}
            >
              <div className="tl-quality-bar">
                <div
                  className={`tl-quality-bar-fill${lowCoverage ? ' low' : ''}`}
                  style={{ width: `${coverage * 100}%` }}
                />
              </div>
              <span className="tl-quality-pct">{Math.round(coverage * 100)}%</span>
              <span className="tl-muted">{t('timeline.analyzedShort')}</span>
            </button>
          )}

          <button
            type="button"
            className="tl-btn"
            onClick={onCompute}
            disabled={isComputing}
          >
            {isComputing ? (
              <>
                <Loader2 size={12} className="tl-spin" /> {t('timeline.computing')}
              </>
            ) : (
              <>
                <RefreshCw size={12} /> {t('timeline.recompute')}
              </>
            )}
          </button>
        </div>
      </div>

      {noRanks && quality && (
        <div className="tl-quality-banner">
          <div className="tl-quality-banner-icon">
            <AlertTriangle size={16} />
          </div>
          <div className="tl-quality-banner-text">
            <div className="tl-quality-banner-title">{t('timeline.banner.title')}</div>
            <div className="tl-quality-banner-sub">
              {t('timeline.banner.sub', {
                analyzed: quality.analyzedCount,
                total: quality.totalCount,
                pct: Math.round(coverage * 100),
              })}
            </div>
          </div>
          <button
            type="button"
            className="tl-btn tl-btn-warning"
            onClick={onCompute}
            disabled={isComputing}
          >
            {isComputing ? (
              <>
                <Loader2 size={13} className="tl-spin" /> {t('timeline.computing')}
              </>
            ) : (
              <>
                <RefreshCw size={13} /> {t('timeline.recompute')}
              </>
            )}
          </button>
        </div>
      )}

      {activeTags.length > 0 && (
        <div className="tl-active-filters">
          <span className="tl-muted">{t('timeline.appliedPrefix')}</span>
          {activeTags.map((tag) => (
            <span key={tag.key} className="tl-active-filter">
              {tag.label}
              <button type="button" onClick={tag.remove} aria-label={t('timeline.removeFilter')}>
                <X size={10} />
              </button>
            </span>
          ))}
          <button type="button" className="tl-active-clear" onClick={onClearFilters}>
            {t('timeline.clearAll')}
          </button>
        </div>
      )}

      {filterOpen && (
        <FilterSheet
          filter={filter}
          onChange={onFilterChange}
          onClose={onCloseFilter}
          options={filterOptions}
          modeLabel={modeLabel}
        />
      )}
    </div>
  );
}

/* ── Filter Sheet (dropdown) ─────────────────────────────────── */

interface FilterSheetProps {
  filter: FilterState;
  onChange: (f: FilterState) => void;
  onClose: () => void;
  options: FilterOptions;
  modeLabel: (mode: string) => string;
}

function FilterChip({
  active,
  onClick,
  label,
}: {
  active: boolean;
  onClick: () => void;
  label: React.ReactNode;
}) {
  return (
    <button
      type="button"
      className={`tl-filter-chip${active ? ' active' : ''}`}
      onClick={onClick}
    >
      {label}
    </button>
  );
}

function FilterSheet({ filter, onChange, onClose, options, modeLabel }: FilterSheetProps) {
  const { t } = useTranslation('analysis');
  const [charSearch, setCharSearch] = useState('');

  const toggleSet = (key: keyof FilterState, value: string) => {
    const next = { ...filter, [key]: new Set(filter[key]) };
    const set = next[key];
    if (set.has(value)) set.delete(value);
    else set.add(value);
    onChange(next);
  };

  const reset = () => onChange(createDefaultFilter());

  const filteredChars = options.characters.filter((c) =>
    c.name.toLowerCase().includes(charSearch.toLowerCase()),
  );

  return (
    <div className="tl-filter-sheet">
      <div className="tl-filter-sheet-section">
        <div className="tl-filter-sheet-label">{t('timeline.filterSections.eventTypes')}</div>
        <div className="tl-filter-chips">
          {options.eventTypes.map((v) => (
            <FilterChip
              key={v}
              label={v}
              active={filter.eventTypes.has(v)}
              onClick={() => toggleSet('eventTypes', v)}
            />
          ))}
        </div>
      </div>

      <div className="tl-filter-sheet-section">
        <div className="tl-filter-sheet-label">{t('timeline.filterSections.narrativeModes')}</div>
        <div className="tl-filter-chips">
          {options.narrativeModes.map((v) => (
            <FilterChip
              key={v}
              label={modeLabel(v)}
              active={filter.narrativeModes.has(v)}
              onClick={() => toggleSet('narrativeModes', v)}
            />
          ))}
        </div>
      </div>

      <div className="tl-filter-sheet-section">
        <div className="tl-filter-sheet-label">{t('timeline.filterSections.importance')}</div>
        <div className="tl-filter-chips">
          <FilterChip
            label="KERNEL"
            active={filter.importance.has('KERNEL')}
            onClick={() => toggleSet('importance', 'KERNEL')}
          />
          <FilterChip
            label="SATELLITE"
            active={filter.importance.has('SATELLITE')}
            onClick={() => toggleSet('importance', 'SATELLITE')}
          />
        </div>
      </div>

      <div className="tl-filter-sheet-section">
        <div className="tl-filter-sheet-label">{t('timeline.filterSections.characters')}</div>
        <div className="tl-filter-search">
          <span className="tl-filter-search-icon">
            <Search size={12} />
          </span>
          <input
            type="text"
            value={charSearch}
            onChange={(e) => setCharSearch(e.target.value)}
            placeholder={t('timeline.charSearch')}
          />
        </div>
        <div className="tl-filter-chips" style={{ maxHeight: 120, overflowY: 'auto' }}>
          {filteredChars.map((c) => (
            <FilterChip
              key={c.id}
              label={c.name}
              active={filter.characters.has(c.id)}
              onClick={() => toggleSet('characters', c.id)}
            />
          ))}
        </div>
      </div>

      {options.locations.length > 0 && (
        <div className="tl-filter-sheet-section">
          <div className="tl-filter-sheet-label">{t('timeline.filterSections.locations')}</div>
          <div className="tl-filter-chips">
            {options.locations.map((l) => (
              <FilterChip
                key={l.id}
                label={l.name}
                active={filter.locations.has(l.id)}
                onClick={() => toggleSet('locations', l.id)}
              />
            ))}
          </div>
        </div>
      )}

      <div className="tl-filter-sheet-foot">
        <button type="button" className="tl-btn" onClick={reset}>
          {t('timeline.reset')}
        </button>
        <button type="button" className="tl-btn tl-btn-primary" onClick={onClose}>
          {t('timeline.apply')}
        </button>
      </div>
    </div>
  );
}

/* ── Parallel group helpers ──────────────────────────────────── */

type EventSegment =
  | { type: 'single'; event: TimelineEvent }
  | { type: 'parallel-group'; events: TimelineEvent[] };

function groupIntoSegments(events: TimelineEvent[]): EventSegment[] {
  const segments: EventSegment[] = [];
  let i = 0;
  while (i < events.length) {
    if (events[i].narrativeMode === 'parallel') {
      const group: TimelineEvent[] = [];
      while (i < events.length && events[i].narrativeMode === 'parallel') {
        group.push(events[i]);
        i++;
      }
      segments.push({ type: 'parallel-group', events: group });
    } else {
      segments.push({ type: 'single', event: events[i] });
      i++;
    }
  }
  return segments;
}

/* ── Timeline Canvas ─────────────────────────────────────────── */

interface TimelineCanvasProps {
  events: TimelineEvent[];
  chapterGroups: { chapter: number; title?: string; count: number }[];
  layout: LayoutDirection;
  order: TimelineOrder;
  temporalRelations: TemporalRelation[];
  selectedEventId: string | null;
  passesFilter: Map<string, boolean>;
  nodeRefs: React.MutableRefObject<Map<string, HTMLDivElement>>;
  canvasRef: React.RefObject<HTMLDivElement | null>;
  onSelectEvent: (id: string | null) => void;
}

interface LineCoord {
  x1: number;
  y1: number;
  x2: number;
  y2: number;
  confidence: number;
}

function TimelineCanvas({
  events,
  chapterGroups,
  layout,
  order,
  temporalRelations,
  selectedEventId,
  passesFilter,
  nodeRefs,
  onSelectEvent,
}: TimelineCanvasProps) {
  const { t } = useTranslation('analysis');
  const isHorizontal = layout === 'horizontal';
  const showChapterBands = order === 'narrative';

  const [lines, setLines] = useState<LineCoord[]>([]);
  const [spinePoints, setSpinePoints] = useState<{ x: number; y: number }[]>([]);
  const [canvasSize, setCanvasSize] = useState({ w: 0, h: 0 });
  const innerRef = useRef<HTMLDivElement>(null);

  useLayoutEffect(() => {
    if (!innerRef.current) {
      setLines([]);
      setSpinePoints([]);
      return;
    }
    const container = innerRef.current;
    const rect = container.getBoundingClientRect();
    setCanvasSize({ w: container.scrollWidth, h: container.scrollHeight });

    const pts: { x: number; y: number }[] = [];
    for (const evt of events) {
      const el = nodeRefs.current.get(evt.id);
      if (el) {
        const r = el.getBoundingClientRect();
        pts.push({
          x: r.left - rect.left + r.width / 2,
          y: r.top - rect.top + r.height / 2,
        });
      }
    }
    setSpinePoints(pts);

    const computed: LineCoord[] = [];
    for (const rel of temporalRelations) {
      if (rel.type.toUpperCase() !== 'CAUSES') continue;
      if (rel.confidence < 0.5) continue;
      const srcEl = nodeRefs.current.get(rel.source);
      const tgtEl = nodeRefs.current.get(rel.target);
      if (!srcEl || !tgtEl) continue;
      const srcRect = srcEl.getBoundingClientRect();
      const tgtRect = tgtEl.getBoundingClientRect();
      computed.push({
        x1: srcRect.left - rect.left + srcRect.width / 2,
        y1: srcRect.top - rect.top + srcRect.height / 2,
        x2: tgtRect.left - rect.left + tgtRect.width / 2,
        y2: tgtRect.top - rect.top + tgtRect.height / 2,
        confidence: rel.confidence,
      });
    }
    setLines(computed);
  }, [temporalRelations, events, layout, nodeRefs]);

  if (events.length === 0) {
    return (
      <div className="tl-state-center">
        <div className="tl-state-icon">
          <List size={26} />
        </div>
        <div className="tl-state-title">{t('timeline.empty.title')}</div>
        <div className="tl-state-body">{t('timeline.empty.body')}</div>
      </div>
    );
  }

  let bandOffset = 0;
  const bands = chapterGroups.map((g) => {
    const start = bandOffset;
    bandOffset += g.count;
    return { ...g, startIdx: start };
  });

  return (
    <div className="tl-canvas-inner" ref={innerRef}>
      {(spinePoints.length > 1 || lines.length > 0) && (
        <svg
          className="tl-svg-overlay"
          width={canvasSize.w}
          height={canvasSize.h}
        >
          <defs>
            <marker
              id="tl-arrow-v2"
              viewBox="0 0 10 7"
              refX="9"
              refY="3.5"
              markerWidth="6"
              markerHeight="5"
              orient="auto"
            >
              <polygon points="0 0, 10 3.5, 0 7" fill="var(--timeline-causal-stroke)" />
            </marker>
          </defs>
          {spinePoints.length > 1 && (
            <polyline
              className="tl-spine"
              points={spinePoints.map((p) => `${p.x},${p.y}`).join(' ')}
            />
          )}
          {lines.map((line, i) => (
            <path
              key={`rel-${i}`}
              className={`tl-causal-edge ${line.confidence >= 0.8 ? 'high' : 'low'}`}
              d={curvedPath(line)}
              markerEnd="url(#tl-arrow-v2)"
            />
          ))}
        </svg>
      )}

      <div className={`tl-canvas-row${isHorizontal ? '' : ' vertical'}`}>
        {showChapterBands
          ? bands.map((band, bi) => {
              const bandEvents = events.slice(band.startIdx, band.startIdx + band.count);
              const segments = groupIntoSegments(bandEvents);
              return (
                <ChapterBand
                  key={`band-${bi}`}
                  label={band.title}
                  chapter={band.chapter}
                  count={band.count}
                  isHorizontal={isHorizontal}
                >
                  {segments.map((seg, si) =>
                    seg.type === 'parallel-group' ? (
                      <ParallelGroup
                        key={`pg-${bi}-${si}`}
                        events={seg.events}
                        isHorizontal={isHorizontal}
                        selectedEventId={selectedEventId}
                        passesFilter={passesFilter}
                        nodeRefs={nodeRefs}
                        onSelectEvent={onSelectEvent}
                      />
                    ) : (
                      <EventCard
                        key={seg.event.id}
                        event={seg.event}
                        selected={selectedEventId === seg.event.id}
                        dim={!(passesFilter.get(seg.event.id) ?? true)}
                        nodeRefs={nodeRefs}
                        onSelect={() =>
                          onSelectEvent(seg.event.id === selectedEventId ? null : seg.event.id)
                        }
                      />
                    ),
                  )}
                </ChapterBand>
              );
            })
          : groupIntoSegments(events).map((seg, si) =>
              seg.type === 'parallel-group' ? (
                <ParallelGroup
                  key={`pg-${si}`}
                  events={seg.events}
                  isHorizontal={isHorizontal}
                  selectedEventId={selectedEventId}
                  passesFilter={passesFilter}
                  nodeRefs={nodeRefs}
                  onSelectEvent={onSelectEvent}
                />
              ) : (
                <EventCard
                  key={seg.event.id}
                  event={seg.event}
                  selected={selectedEventId === seg.event.id}
                  dim={!(passesFilter.get(seg.event.id) ?? true)}
                  nodeRefs={nodeRefs}
                  onSelect={() =>
                    onSelectEvent(seg.event.id === selectedEventId ? null : seg.event.id)
                  }
                />
              ),
            )}
      </div>
    </div>
  );
}

function curvedPath(line: { x1: number; y1: number; x2: number; y2: number }): string {
  const dx = line.x2 - line.x1;
  const dy = line.y2 - line.y1;
  if (Math.abs(dx) > Math.abs(dy)) {
    const mid = (line.x1 + line.x2) / 2;
    const ctrl = -Math.min(48, Math.abs(dx) * 0.22);
    return `M ${line.x1} ${line.y1} Q ${mid} ${line.y1 + ctrl} ${line.x2} ${line.y2}`;
  }
  const mid = (line.y1 + line.y2) / 2;
  return `M ${line.x1} ${line.y1} Q ${line.x1 + 30} ${mid} ${line.x2} ${line.y2}`;
}

function ChapterBand({
  label,
  chapter,
  count,
  isHorizontal,
  children,
}: {
  label?: string;
  chapter: number;
  count: number;
  isHorizontal: boolean;
  children: React.ReactNode;
}) {
  return (
    <div className={`tl-chapter-band${isHorizontal ? '' : ' vertical'}`}>
      <div className="tl-chapter-label">
        <strong>{chapterLabel(chapter)}</strong>
        {label && <span>· {label}</span>}
        <span className="tl-chapter-count">{count}</span>
      </div>
      {children}
    </div>
  );
}

function ParallelGroup({
  events,
  isHorizontal,
  selectedEventId,
  passesFilter,
  nodeRefs,
  onSelectEvent,
}: {
  events: TimelineEvent[];
  isHorizontal: boolean;
  selectedEventId: string | null;
  passesFilter: Map<string, boolean>;
  nodeRefs: React.MutableRefObject<Map<string, HTMLDivElement>>;
  onSelectEvent: (id: string | null) => void;
}) {
  return (
    <div className={`tl-parallel-group${isHorizontal ? ' horizontal' : ' vertical'}`}>
      {events.map((evt) => (
        <EventCard
          key={evt.id}
          event={evt}
          selected={selectedEventId === evt.id}
          dim={!(passesFilter.get(evt.id) ?? true)}
          nodeRefs={nodeRefs}
          onSelect={() => onSelectEvent(evt.id === selectedEventId ? null : evt.id)}
        />
      ))}
    </div>
  );
}

/* ── Event Card ──────────────────────────────────────────────── */

function EventCard({
  event,
  selected,
  dim,
  nodeRefs,
  onSelect,
}: {
  event: TimelineEvent;
  selected: boolean;
  dim: boolean;
  nodeRefs: React.MutableRefObject<Map<string, HTMLDivElement>>;
  onSelect: () => void;
}) {
  const { t } = useTranslation('analysis');
  const importance = event.eventImportance;
  const cardRef = useCallback(
    (el: HTMLDivElement | null) => {
      if (el) nodeRefs.current.set(event.id, el);
      else nodeRefs.current.delete(event.id);
    },
    [event.id, nodeRefs],
  );

  const pills: { id: string; name: string; type: EntityType }[] = [
    ...event.participants.slice(0, 2),
    ...(event.location
      ? [
          {
            id: event.location.id,
            name: event.location.name,
            type: 'location' as EntityType,
          },
        ]
      : []),
  ];
  const totalPillCount = event.participants.length + (event.location ? 1 : 0);
  const overflowCount = totalPillCount - pills.length;

  return (
    <div
      ref={cardRef}
      className={`tl-card${importance === 'KERNEL' ? ' kernel' : ''}${selected ? ' selected' : ''}${dim ? ' dim' : ''}`}
      style={{ ['--card-narrative' as string]: `var(--narrative-${event.narrativeMode}-border)` }}
      onClick={onSelect}
      role="button"
      tabIndex={0}
      onKeyDown={(e) => {
        if (e.key === 'Enter' || e.key === ' ') {
          e.preventDefault();
          onSelect();
        }
      }}
    >
      <div className="tl-card-head">
        <span
          className="tl-card-mode-icon"
          title={t(`timeline.narrativeModes.${event.narrativeMode}`, event.narrativeMode)}
        >
          <NarrativeIcon mode={event.narrativeMode} size={13} />
        </span>
        <span
          className={`tl-card-importance${importance === 'KERNEL' ? ' kernel' : ''}`}
        >
          {importance === 'KERNEL' ? 'K' : importance === 'SATELLITE' ? 'S' : '·'}
        </span>
        <span className="tl-card-ch">{chapterLabel(event.chapter)}</span>
      </div>
      <div className="tl-card-title" title={event.title}>
        {event.title}
      </div>
      {pills.length > 0 && (
        <div className="tl-card-pills">
          {pills.map((p) => (
            <span key={p.id} className={pillTypeClass(p.type)}>
              <span className="tl-pill-dot" />
              {p.name}
            </span>
          ))}
          {overflowCount > 0 && (
            <span className="tl-pill tl-pill-overflow">+{overflowCount}</span>
          )}
        </div>
      )}
    </div>
  );
}

/* ── Event Detail Panel ──────────────────────────────────────── */

interface EventDetailPanelProps {
  event: TimelineEvent;
  bookId: string;
  eventMap: Map<string, TimelineEvent>;
  onClose: () => void;
  onJumpToEvent: (eventId: string) => void;
  onGoToAnalysis: () => void;
  modeLabel: (mode: string) => string;
}

function EventDetailPanel({
  event,
  bookId,
  eventMap,
  onClose,
  onJumpToEvent,
  onGoToAnalysis,
  modeLabel,
}: EventDetailPanelProps) {
  const { t } = useTranslation('analysis');
  const [open, setOpen] = useState({ eep: true, causality: false, impact: false });
  const toggle = (k: keyof typeof open) => setOpen((o) => ({ ...o, [k]: !o[k] }));

  const { data: analysis, isLoading: analysisLoading } = useQuery<EventAnalysisDetail>({
    queryKey: ['books', bookId, 'events', event.id, 'analysis'],
    queryFn: () => fetchEventAnalysisDetail(bookId, event.id),
    retry: false,
  });

  const isKernel = event.eventImportance === 'KERNEL';

  return (
    <div className="tl-panel">
      <div className="tl-panel-header">
        <button
          type="button"
          className="tl-panel-close"
          onClick={onClose}
          aria-label={t('timeline.closePanel')}
        >
          <X size={14} />
        </button>
        <div className="tl-panel-meta-row">
          <span className={`tl-panel-importance-chip${isKernel ? '' : ' satellite'}`}>
            <NarrativeIcon mode={event.narrativeMode} size={12} />
            <span style={{ marginLeft: 2 }}>
              {isKernel
                ? t('timeline.importanceKernel')
                : event.eventImportance === 'SATELLITE'
                  ? t('timeline.importanceSatellite')
                  : '—'}
            </span>
          </span>
          <span className="tl-panel-mode-text">· {modeLabel(event.narrativeMode)}</span>
          <span className="tl-panel-ch">{chapterLabel(event.chapter)}</span>
        </div>
        <div className="tl-panel-title">{event.title}</div>
        <div className="tl-panel-subtitle">
          {event.chapterTitle && <span>{event.chapterTitle}</span>}
          {event.storyTimeHint && (
            <>
              <span className="tl-dot" />
              <span>{event.storyTimeHint}</span>
            </>
          )}
        </div>
        {analysis?.eep.thematicSignificance && (
          <div className="tl-panel-thematic">
            <span className="tl-panel-thematic-label">
              {t('timeline.eep.thematicSignificance')}
            </span>
            {analysis.eep.thematicSignificance}
          </div>
        )}
      </div>

      <div className="tl-panel-body">
        <div className="tl-panel-body-section">
          <div className="tl-field-label">{t('timeline.panel.summary')}</div>
          <p className="tl-description" style={{ marginTop: 6 }}>
            {event.description}
          </p>
          {(event.participants.length > 0 || event.location) && (
            <div className="tl-pill-group">
              {event.participants.map((p) => (
                <span key={p.id} className={pillTypeClass(p.type)}>
                  <span className="tl-pill-dot" />
                  {p.name}
                </span>
              ))}
              {event.location && (
                <span className={pillTypeClass('location')}>
                  <span className="tl-pill-dot" />
                  {event.location.name}
                </span>
              )}
            </div>
          )}
        </div>

        <MiniTimeline
          event={event}
          analysis={analysis ?? null}
          analysisLoading={analysisLoading}
          eventMap={eventMap}
          onJumpToEvent={onJumpToEvent}
          modeLabel={modeLabel}
        />

        {!analysis && !analysisLoading && (
          <div style={{ padding: '0 20px 10px' }}>
            <button
              type="button"
              className="tl-btn"
              onClick={onGoToAnalysis}
              style={{ width: '100%', justifyContent: 'center' }}
            >
              {t('timeline.gotoAnalysis')}
            </button>
          </div>
        )}

        <AccordionSection
          title={t('timeline.panel.eep')}
          open={open.eep}
          onToggle={() => toggle('eep')}
        >
          {analysisLoading ? (
            <PanelLoading />
          ) : analysis ? (
            <EepBody analysis={analysis} />
          ) : (
            <span className="tl-muted">{t('timeline.eep.noEep')}</span>
          )}
        </AccordionSection>

        <AccordionSection
          title={t('timeline.panel.causality')}
          open={open.causality}
          onToggle={() => toggle('causality')}
        >
          {analysisLoading ? (
            <PanelLoading />
          ) : analysis?.causality ? (
            <CausalityBody analysis={analysis} />
          ) : (
            <span className="tl-muted">{t('timeline.causality.noCausality')}</span>
          )}
        </AccordionSection>

        <AccordionSection
          title={t('timeline.panel.impact')}
          open={open.impact}
          onToggle={() => toggle('impact')}
        >
          {analysisLoading ? (
            <PanelLoading />
          ) : analysis?.impact ? (
            <ImpactBody analysis={analysis} event={event} />
          ) : (
            <span className="tl-muted">{t('timeline.impact.noImpact')}</span>
          )}
        </AccordionSection>
      </div>
    </div>
  );
}

function MiniTimeline({
  event,
  analysis,
  analysisLoading,
  eventMap,
  onJumpToEvent,
  modeLabel,
}: {
  event: TimelineEvent;
  analysis: EventAnalysisDetail | null;
  analysisLoading: boolean;
  eventMap: Map<string, TimelineEvent>;
  onJumpToEvent: (id: string) => void;
  modeLabel: (mode: string) => string;
}) {
  const { t } = useTranslation('analysis');
  const priors = (analysis?.eep.priorEventIds ?? [])
    .map((id) => eventMap.get(id))
    .filter((e): e is TimelineEvent => !!e);
  const subsequents = (analysis?.eep.subsequentEventIds ?? [])
    .map((id) => eventMap.get(id))
    .filter((e): e is TimelineEvent => !!e);
  const showSection = priors.length > 0 || subsequents.length > 0 || event.chronologicalRank != null;

  return (
    <div>
      <div className="tl-panel-body-section">
        <div className="tl-field-label">{t('timeline.panel.temporal')}</div>
      </div>
      {!showSection && analysisLoading && <PanelLoading />}
      {!showSection && !analysisLoading && (
        <div style={{ padding: '0 20px 12px' }}>
          <span className="tl-muted" style={{ fontSize: 12 }}>
            {t('timeline.noAnalysisData')}
          </span>
        </div>
      )}
      {showSection && (
        <div className="tl-mini-timeline">
          {priors.map((e) => (
            <MiniRow
              key={`prior-${e.id}`}
              role="prior"
              label={t('timeline.priorEvents')}
              event={e}
              onJump={() => onJumpToEvent(e.id)}
              modeLabel={modeLabel}
            />
          ))}
          <MiniRow
            role="current"
            label={t('timeline.currentEvent')}
            event={event}
            current
            modeLabel={modeLabel}
          />
          {subsequents.map((e) => (
            <MiniRow
              key={`sub-${e.id}`}
              role="subsequent"
              label={t('timeline.subsequentEvents')}
              event={e}
              onJump={() => onJumpToEvent(e.id)}
              modeLabel={modeLabel}
            />
          ))}
        </div>
      )}
    </div>
  );
}

function MiniRow({
  role,
  label,
  event,
  current,
  onJump,
  modeLabel,
}: {
  role: 'prior' | 'current' | 'subsequent';
  label: string;
  event: TimelineEvent;
  current?: boolean;
  onJump?: () => void;
  modeLabel: (mode: string) => string;
}) {
  const meta = current
    ? `${chapterLabel(event.chapter)} · rank ${event.chronologicalRank?.toFixed(2) ?? '—'}`
    : `${chapterLabel(event.chapter)} · ${modeLabel(event.narrativeMode)}`;
  return (
    <div className={`tl-mini-row ${role}`}>
      <div className="tl-mini-marker">
        <div className="tl-mini-dot" />
        <div className="tl-mini-stem" />
      </div>
      <div className="tl-mini-content">
        <div className="tl-mini-label">{label}</div>
        <div
          className={`tl-mini-title${current ? ' current' : ''}`}
          onClick={onJump}
          role={onJump ? 'button' : undefined}
          tabIndex={onJump ? 0 : undefined}
          onKeyDown={(e) => {
            if (onJump && (e.key === 'Enter' || e.key === ' ')) {
              e.preventDefault();
              onJump();
            }
          }}
        >
          {event.title}
        </div>
        <div className="tl-mini-meta">{meta}</div>
      </div>
    </div>
  );
}

function AccordionSection({
  title,
  open,
  onToggle,
  children,
}: {
  title: string;
  open: boolean;
  onToggle: () => void;
  children: React.ReactNode;
}) {
  return (
    <div className="tl-acc">
      <button type="button" className="tl-acc-header" onClick={onToggle}>
        <span className="tl-acc-chev">
          {open ? <ChevronDown size={12} /> : <ChevronRight size={12} />}
        </span>
        {title}
      </button>
      {open && <div className="tl-acc-body">{children}</div>}
    </div>
  );
}

function PanelLoading() {
  const { t } = useTranslation('analysis');
  return (
    <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
      <Loader2 size={12} className="tl-spin" />
      <span className="tl-muted">{t('timeline.loading')}</span>
    </div>
  );
}

function EepBody({ analysis }: { analysis: EventAnalysisDetail }) {
  const { t } = useTranslation('analysis');
  const eep = analysis.eep;
  return (
    <>
      {eep.stateBefore && (
        <div className="tl-field">
          <div className="tl-field-label">{t('timeline.eep.stateBefore')}</div>
          <div className="tl-field-value">{eep.stateBefore}</div>
        </div>
      )}
      {eep.stateAfter && (
        <div className="tl-field">
          <div className="tl-field-label">{t('timeline.eep.stateAfter')}</div>
          <div className="tl-field-value">{eep.stateAfter}</div>
        </div>
      )}
      {eep.causalFactors.length > 0 && (
        <div className="tl-field">
          <div className="tl-field-label">{t('timeline.eep.causalFactors')}</div>
          <ul className="tl-field-list">
            {eep.causalFactors.map((f, i) => (
              <li key={i}>{f}</li>
            ))}
          </ul>
        </div>
      )}
      {eep.participantRoles.length > 0 && (
        <div className="tl-field">
          <div className="tl-field-label">{t('timeline.eep.participantRoles')}</div>
          <ul className="tl-field-list">
            {eep.participantRoles.map((r, i) => (
              <li key={i}>
                <strong>{r.entityName}</strong>
                <span className="tl-muted"> ({r.role})</span>
                {r.impactDescription && <div className="tl-muted">{r.impactDescription}</div>}
              </li>
            ))}
          </ul>
        </div>
      )}
      {eep.consequences.length > 0 && (
        <div className="tl-field">
          <div className="tl-field-label">{t('timeline.eep.consequences')}</div>
          <ul className="tl-field-list">
            {eep.consequences.map((c, i) => (
              <li key={i}>{c}</li>
            ))}
          </ul>
        </div>
      )}
      {eep.structuralRole && (
        <div className="tl-field">
          <div className="tl-field-label">{t('timeline.eep.structuralRole')}</div>
          <div className="tl-field-value">{eep.structuralRole}</div>
        </div>
      )}
      {eep.keyQuotes.length > 0 && (
        <div className="tl-field">
          <div className="tl-field-label">{t('timeline.eep.keyQuotes')}</div>
          {eep.keyQuotes.map((q, i) => (
            <div key={i} className="tl-field-quote">
              「{q}」
            </div>
          ))}
        </div>
      )}
      {Object.keys(eep.topTerms ?? {}).length > 0 && (
        <div className="tl-field">
          <div className="tl-field-label">{t('timeline.eep.topTerms')}</div>
          <div style={{ display: 'flex', flexWrap: 'wrap', gap: 4 }}>
            {Object.entries(eep.topTerms)
              .sort(([, a], [, b]) => b - a)
              .slice(0, 8)
              .map(([term]) => (
                <span key={term} className="tl-field-term">
                  {term}
                </span>
              ))}
          </div>
        </div>
      )}
    </>
  );
}

function CausalityBody({ analysis }: { analysis: EventAnalysisDetail }) {
  const { t } = useTranslation('analysis');
  const c = analysis.causality;
  return (
    <>
      {c.rootCause && (
        <div className="tl-field">
          <div className="tl-field-label">{t('timeline.causality.rootCause')}</div>
          <div className="tl-field-value">{c.rootCause}</div>
        </div>
      )}
      {c.causalChain.length > 0 && (
        <div className="tl-field">
          <div className="tl-field-label">{t('timeline.causality.causalChain')}</div>
          <ol className="tl-field-list" style={{ listStyleType: 'decimal' }}>
            {c.causalChain.map((step, i) => (
              <li key={i}>{step}</li>
            ))}
          </ol>
        </div>
      )}
      {c.chainSummary && (
        <div className="tl-field">
          <div className="tl-field-label">{t('timeline.causality.chainSummary')}</div>
          <div className="tl-field-value">{c.chainSummary}</div>
        </div>
      )}
    </>
  );
}

function ImpactBody({
  analysis,
  event,
}: {
  analysis: EventAnalysisDetail;
  event: TimelineEvent;
}) {
  const { t } = useTranslation('analysis');
  const imp = analysis.impact;
  return (
    <>
      {imp.affectedParticipantIds.length > 0 && (
        <div className="tl-field">
          <div className="tl-field-label">{t('timeline.impact.affectedParticipants')}</div>
          <div style={{ display: 'flex', flexWrap: 'wrap', gap: 4 }}>
            {imp.affectedParticipantIds.map((pid) => {
              const p = event.participants.find((pp) => pp.id === pid);
              const type: EntityType = (p?.type ?? 'character') as EntityType;
              return (
                <span key={pid} className={pillTypeClass(type)}>
                  <span className="tl-pill-dot" />
                  {p?.name ?? pid}
                </span>
              );
            })}
          </div>
        </div>
      )}
      {imp.participantImpacts.length > 0 && (
        <div className="tl-field">
          <div className="tl-field-label">{t('timeline.impact.participantImpacts')}</div>
          {imp.participantImpacts.map((p, i) => (
            <div key={i} className="tl-field-quote" style={{ borderColor: 'var(--panel-border)' }}>
              {p}
            </div>
          ))}
        </div>
      )}
      {imp.relationChanges.length > 0 && (
        <div className="tl-field">
          <div className="tl-field-label">{t('timeline.impact.relationChanges')}</div>
          <ul className="tl-field-list">
            {imp.relationChanges.map((r, i) => (
              <li key={i}>{r}</li>
            ))}
          </ul>
        </div>
      )}
      {imp.impactSummary && (
        <div className="tl-field">
          <div className="tl-field-label">{t('timeline.impact.impactSummary')}</div>
          <div className="tl-field-value">{imp.impactSummary}</div>
        </div>
      )}
    </>
  );
}

