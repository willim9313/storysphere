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
import {
  ArrowLeftRight,
  ArrowUpDown,
  RefreshCw,
  Loader2,
  X,
  ChevronDown,
  ChevronRight,
  Filter,
  Search,
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
import type {
  TimelineOrder,
  TimelineEvent,
  TemporalRelation,
  NarrativeMode,
  EventAnalysisDetail,
  EntityType,
} from '@/api/types';

type LayoutDirection = 'horizontal' | 'vertical';

const IMPORTANCE_SIZE: Record<string, number> = {
  KERNEL: 48,
  SATELLITE: 32,
};
const DEFAULT_SIZE = 36;

const NARRATIVE_BADGE: Record<NarrativeMode, string | null> = {
  present: null,
  flashback: '\u23EA',
  flashforward: '\u23E9',
  parallel: '\u23F8',
  unknown: '?',
};

const NARRATIVE_COLORS: Record<NarrativeMode, { border: string; bg: string }> = {
  present:      { border: '#8b5e3c', bg: '#f5ede4' },
  flashback:    { border: '#3b82f6', bg: '#dbeafe' },
  flashforward: { border: '#f59e0b', bg: '#fef3c7' },
  parallel:     { border: '#8b5cf6', bg: '#ede9fe' },
  unknown:      { border: '#8a7a68', bg: '#f0ece6' },
};

const PILL_COLORS: Record<string, string> = {
  character: '#3b82f6',
  location: '#10b981',
  organization: '#f59e0b',
  object: '#8b5cf6',
  concept: '#ec4899',
  other: '#6b7280',
};

function getEventSize(event: TimelineEvent): number {
  return IMPORTANCE_SIZE[event.eventImportance ?? ''] ?? DEFAULT_SIZE;
}

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

/* ── Main component ─────────────────────────────────────────── */

export default function TimelinePage() {
  const { bookId } = useParams<{ bookId: string }>();
  const navigate = useNavigate();
  const queryClient = useQueryClient();
  const { setPageContext } = useChatContext();
  const { data: book } = useBook(bookId);

  const [order, setOrder] = useState<TimelineOrder>('narrative');
  const [layout, setLayout] = useState<LayoutDirection>('horizontal');
  const [computeTaskId, setComputeTaskId] = useState<string | null>(null);
  const [selectedEventId, setSelectedEventId] = useState<string | null>(null);
  const [hoveredEventId, setHoveredEventId] = useState<string | null>(null);
  const [filter, setFilter] = useState<FilterState>(createDefaultFilter);
  const [filterOpen, setFilterOpen] = useState(false);

  const { data, isLoading, error } = useTimeline(bookId, order);
  const { data: computeTask } = useTaskPolling(computeTaskId);

  // Node ref map for SVG lines
  const nodeRefs = useRef<Map<string, HTMLDivElement>>(new Map());
  const canvasRef = useRef<HTMLDivElement>(null);

  // When compute finishes, refresh timeline data
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

  // Chat context
  useEffect(() => {
    setPageContext({ page: 'timeline', bookId, bookTitle: book?.title });
  }, [bookId, book?.title, setPageContext]);

  const handleCompute = useCallback(async () => {
    if (!bookId || isComputing) return;
    const { taskId } = await computeTimeline(bookId);
    setComputeTaskId(taskId);
  }, [bookId, isComputing]);

  // Sort events based on order
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

  // Collect filter options from events
  const filterOptions = useMemo(() => {
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

  // Which events pass the filter
  const passesFilter = useMemo(() => {
    const active = isFilterActive(filter);
    const map = new Map<string, boolean>();
    for (const evt of sortedEvents) {
      map.set(evt.id, !active || eventPassesFilter(evt, filter));
    }
    return map;
  }, [sortedEvents, filter]);

  // Group events by chapter for chapter bands (narrative order only)
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

  // Build event lookup
  const eventMap = useMemo(() => {
    const map = new Map<string, TimelineEvent>();
    for (const evt of sortedEvents) map.set(evt.id, evt);
    return map;
  }, [sortedEvents]);

  // Navigate to event (scroll + select + panel update)
  const jumpToEvent = useCallback(
    (eventId: string) => {
      setSelectedEventId(eventId);
      const node = nodeRefs.current.get(eventId);
      if (node) {
        node.scrollIntoView({ behavior: 'smooth', block: 'center', inline: 'center' });
      }
    },
    [],
  );

  const selectedEvent = selectedEventId ? eventMap.get(selectedEventId) : undefined;
  const highlightedId = selectedEventId ?? hoveredEventId;

  if (isLoading) return <LoadingSpinner />;
  if (error) return <ErrorMessage message={error.message} />;

  const quality = data?.quality;
  const hasRanks = quality?.hasChronologicalRanks ?? false;

  return (
    <div
      className="flex flex-col h-full overflow-hidden"
      style={{ backgroundColor: 'var(--bg-primary)' }}
    >
      {/* Toolbar */}
      <Toolbar
        order={order}
        onOrderChange={setOrder}
        layout={layout}
        onLayoutChange={setLayout}
        quality={quality}
        hasRanks={hasRanks}
        isComputing={isComputing}
        onCompute={handleCompute}
        onGoToAnalysis={() => navigate(`/books/${bookId}/analysis`)}
        filterCount={activeFilterCount(filter)}
        onToggleFilter={() => setFilterOpen((v) => !v)}
      />

      {/* Filter dropdown */}
      {filterOpen && (
        <FilterDropdown
          options={filterOptions}
          filter={filter}
          onChange={setFilter}
          onClose={() => setFilterOpen(false)}
        />
      )}

      {/* Main area: canvas + detail panel */}
      <div className="flex flex-1 overflow-hidden">
        {/* Timeline / Matrix canvas */}
        <div className="flex-1 overflow-auto relative" ref={canvasRef}>
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
              hoveredEventId={hoveredEventId}
              highlightedCharacters={filter.characters}
              passesFilter={passesFilter}
              nodeRefs={nodeRefs}
              canvasRef={canvasRef}
              onSelectEvent={setSelectedEventId}
              onHoverEvent={setHoveredEventId}
            />
          )}
        </div>

        {/* Event detail panel */}
        {selectedEvent && bookId && (
          <EventDetailPanel
            event={selectedEvent}
            bookId={bookId}
            eventMap={eventMap}
            onClose={() => setSelectedEventId(null)}
            onJumpToEvent={jumpToEvent}
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
  onGoToAnalysis: () => void;
  filterCount: number;
  onToggleFilter: () => void;
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
  onGoToAnalysis,
  filterCount,
  onToggleFilter,
}: ToolbarProps) {
  return (
    <div
      className="flex items-center justify-between px-4 py-2 flex-shrink-0 gap-4"
      style={{
        borderBottom: '1px solid var(--border)',
        backgroundColor: 'white',
      }}
    >
      {/* Left: view mode tabs + layout toggle + filter */}
      <div className="flex items-center gap-3">
        {/* View tabs — segmented control */}
        <div
          className="flex items-center gap-0.5 p-0.5 rounded-lg"
          style={{ backgroundColor: 'var(--bg-secondary)' }}
        >
          {(
            [
              { value: 'narrative', label: '章節順序' },
              { value: 'chronological', label: '故事時序', warn: !hasRanks },
              { value: 'matrix', label: '矩陣視圖', warn: !hasRanks },
            ] as { value: TimelineOrder; label: string; warn?: boolean }[]
          ).map((tab) => {
            const isActive = order === tab.value;
            return (
              <button
                key={tab.value}
                onClick={() => onOrderChange(tab.value)}
                className="flex items-center gap-1.5 text-xs px-3 py-1 rounded-md transition-all duration-150"
                title={tab.warn ? '尚未計算時序，請先觸發時序計算' : undefined}
                style={{
                  backgroundColor: isActive ? 'white' : 'transparent',
                  color: isActive ? 'var(--accent)' : 'var(--fg-muted)',
                  fontWeight: isActive ? 500 : 400,
                  boxShadow: isActive
                    ? '0 1px 3px rgba(0,0,0,0.08), 0 0 0 0.5px rgba(0,0,0,0.05)'
                    : undefined,
                }}
              >
                {tab.label}
                {tab.warn && (
                  <span
                    style={{
                      width: 5,
                      height: 5,
                      borderRadius: '50%',
                      backgroundColor: '#f59e0b',
                      display: 'inline-block',
                      flexShrink: 0,
                    }}
                  />
                )}
              </button>
            );
          })}
        </div>

        {order !== 'matrix' && (
          <button
            onClick={() =>
              onLayoutChange(layout === 'horizontal' ? 'vertical' : 'horizontal')
            }
            className="flex items-center justify-center rounded-md transition-colors"
            style={{
              width: 28,
              height: 28,
              border: '1px solid var(--border)',
              backgroundColor: 'var(--bg-primary)',
              color: 'var(--fg-muted)',
            }}
            title={layout === 'horizontal' ? '切換為垂直佈局' : '切換為水平佈局'}
          >
            {layout === 'horizontal' ? (
              <ArrowLeftRight size={13} />
            ) : (
              <ArrowUpDown size={13} />
            )}
          </button>
        )}

        <button
          onClick={onToggleFilter}
          className="flex items-center gap-1 text-xs px-2 py-1 rounded-md"
          style={{
            border: '1px solid var(--border)',
            backgroundColor:
              filterCount > 0 ? 'var(--bg-tertiary)' : 'var(--bg-primary)',
            color:
              filterCount > 0 ? 'var(--accent)' : 'var(--fg-secondary)',
          }}
        >
          <Filter size={12} />
          Filter{filterCount > 0 ? ` (${filterCount})` : ''}
        </button>
      </div>

      {/* Center: quality indicator */}
      {quality && (
        <QualityIndicator quality={quality} onClick={onGoToAnalysis} />
      )}

      {/* Right: compute button */}
      <button
        onClick={onCompute}
        disabled={isComputing}
        className="flex items-center gap-1.5 text-xs px-3 py-1.5 rounded-md transition-colors"
        style={{
          border: '1px solid var(--border)',
          backgroundColor: isComputing
            ? 'var(--bg-tertiary)'
            : 'var(--bg-primary)',
          color: isComputing ? 'var(--fg-muted)' : 'var(--fg-primary)',
          cursor: isComputing ? 'not-allowed' : 'pointer',
        }}
      >
        {isComputing ? (
          <>
            <Loader2 size={12} className="animate-spin" /> 計算中…
          </>
        ) : (
          <>
            <RefreshCw size={12} /> 重新計算時序
          </>
        )}
      </button>
    </div>
  );
}

/* ── Quality Indicator ───────────────────────────────────────── */

function QualityIndicator({
  quality,
  onClick,
}: {
  quality: {
    eepCoverage: number;
    analyzedCount: number;
    totalCount: number;
    hasChronologicalRanks: boolean;
  };
  onClick: () => void;
}) {
  const blocks = 5;
  const filled = Math.round(quality.eepCoverage * blocks);
  const pct = Math.round(quality.eepCoverage * 100);

  return (
    <button
      onClick={onClick}
      className="flex items-center gap-2 text-xs px-2 py-1 rounded-md hover:opacity-80 transition-opacity"
      style={{ color: 'var(--fg-secondary)' }}
      title="分析更多事件可提升時序計算品質。前往深度分析頁 → 事件分析一鍵生成全部 EEP。"
    >
      <span
        className="tracking-wider"
        style={{ fontFamily: 'monospace' }}
      >
        {Array.from({ length: blocks }, (_, i) => (
          <span
            key={i}
            style={{
              color: i < filled ? 'var(--accent)' : 'var(--border)',
            }}
          >
            {'\u25A0'}
          </span>
        ))}
      </span>
      <span>
        {quality.analyzedCount}/{quality.totalCount} 事件已分析 ({pct}%)
      </span>
      <span style={{ color: 'var(--border)' }}>{'\u00B7'}</span>
      <span
        style={{
          color: quality.hasChronologicalRanks
            ? 'var(--accent)'
            : 'var(--fg-muted)',
        }}
      >
        {quality.hasChronologicalRanks ? '時序已計算' : '時序未計算'}
      </span>
    </button>
  );
}

/* ── Filter Dropdown ─────────────────────────────────────────── */

interface FilterDropdownProps {
  options: {
    eventTypes: string[];
    narrativeModes: string[];
    characters: { id: string; name: string }[];
    locations: { id: string; name: string }[];
  };
  filter: FilterState;
  onChange: (f: FilterState) => void;
  onClose: () => void;
}

function FilterDropdown({
  options,
  filter,
  onChange,
  onClose,
}: FilterDropdownProps) {
  const [charSearch, setCharSearch] = useState('');

  const toggleSet = (
    key: keyof FilterState,
    value: string,
  ) => {
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
    <div
      className="absolute left-4 top-12 z-50 rounded-lg shadow-lg overflow-y-auto"
      style={{
        backgroundColor: 'white',
        border: '1px solid var(--border)',
        maxHeight: 480,
        width: 320,
      }}
    >
      <div className="p-3 space-y-3">
        {/* Event types */}
        <FilterGroup title="事件類型">
          {options.eventTypes.map((t) => (
            <FilterCheckbox
              key={t}
              label={t}
              checked={filter.eventTypes.has(t)}
              onChange={() => toggleSet('eventTypes', t)}
            />
          ))}
        </FilterGroup>

        {/* Narrative modes */}
        <FilterGroup title="敘事模式">
          {options.narrativeModes.map((m) => (
            <FilterCheckbox
              key={m}
              label={m}
              checked={filter.narrativeModes.has(m)}
              onChange={() => toggleSet('narrativeModes', m)}
            />
          ))}
        </FilterGroup>

        {/* Characters (searchable) */}
        <FilterGroup title="角色">
          <div className="relative mb-1">
            <Search
              size={12}
              className="absolute left-2 top-1/2 -translate-y-1/2"
              style={{ color: 'var(--fg-muted)' }}
            />
            <input
              type="text"
              value={charSearch}
              onChange={(e) => setCharSearch(e.target.value)}
              placeholder="搜尋角色..."
              className="w-full text-xs pl-6 pr-2 py-1 rounded"
              style={{
                border: '1px solid var(--border)',
                backgroundColor: 'var(--bg-primary)',
                color: 'var(--fg-primary)',
              }}
            />
          </div>
          {filteredChars.map((c) => (
            <FilterCheckbox
              key={c.id}
              label={c.name}
              checked={filter.characters.has(c.id)}
              onChange={() => toggleSet('characters', c.id)}
            />
          ))}
        </FilterGroup>

        {/* Locations */}
        {options.locations.length > 0 && (
          <FilterGroup title="地點">
            {options.locations.map((l) => (
              <FilterCheckbox
                key={l.id}
                label={l.name}
                checked={filter.locations.has(l.id)}
                onChange={() => toggleSet('locations', l.id)}
              />
            ))}
          </FilterGroup>
        )}

        {/* Importance */}
        <FilterGroup title="重要性">
          <FilterCheckbox
            label="KERNEL"
            checked={filter.importance.has('KERNEL')}
            onChange={() => toggleSet('importance', 'KERNEL')}
          />
          <FilterCheckbox
            label="SATELLITE"
            checked={filter.importance.has('SATELLITE')}
            onChange={() => toggleSet('importance', 'SATELLITE')}
          />
        </FilterGroup>

        {/* Actions */}
        <div className="flex items-center justify-end gap-2 pt-2 border-t" style={{ borderColor: 'var(--border)' }}>
          <button
            onClick={reset}
            className="text-xs px-3 py-1 rounded"
            style={{ color: 'var(--fg-muted)' }}
          >
            重置
          </button>
          <button
            onClick={onClose}
            className="text-xs px-3 py-1 rounded"
            style={{
              backgroundColor: 'var(--accent)',
              color: 'white',
            }}
          >
            套用
          </button>
        </div>
      </div>
    </div>
  );
}

function FilterGroup({
  title,
  children,
}: {
  title: string;
  children: React.ReactNode;
}) {
  return (
    <div>
      <p
        className="text-xs font-medium mb-1"
        style={{ color: 'var(--fg-primary)' }}
      >
        {title}
      </p>
      <div className="flex flex-wrap gap-x-3 gap-y-1">{children}</div>
    </div>
  );
}

function FilterCheckbox({
  label,
  checked,
  onChange,
}: {
  label: string;
  checked: boolean;
  onChange: () => void;
}) {
  return (
    <label className="flex items-center gap-1.5 text-xs cursor-pointer" style={{ color: 'var(--fg-secondary)' }}>
      <input
        type="checkbox"
        checked={checked}
        onChange={onChange}
        className="rounded"
        style={{ accentColor: 'var(--accent)' }}
      />
      {label}
    </label>
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
  hoveredEventId: string | null;
  highlightedCharacters: Set<string>;
  passesFilter: Map<string, boolean>;
  nodeRefs: React.MutableRefObject<Map<string, HTMLDivElement>>;
  canvasRef: React.RefObject<HTMLDivElement | null>;
  onSelectEvent: (id: string | null) => void;
  onHoverEvent: (id: string | null) => void;
}

interface LineCoord {
  x1: number;
  y1: number;
  x2: number;
  y2: number;
  type: string;
  confidence: number;
  isNarrative?: boolean;
  isPositional?: boolean; // 故事時序模式底層順序線（無具體文本證據）
}

function TimelineCanvas({
  events,
  chapterGroups,
  layout,
  order,
  temporalRelations,
  selectedEventId,
  hoveredEventId,
  highlightedCharacters,
  passesFilter,
  nodeRefs,
  canvasRef,
  onSelectEvent,
  onHoverEvent,
}: TimelineCanvasProps) {
  const isHorizontal = layout === 'horizontal';
  const showChapterBands = order === 'narrative';
  const showRelationLines = order === 'chronological';
  const showSequentialArrows = order === 'narrative';

  const [lines, setLines] = useState<LineCoord[]>([]);
  const [canvasSize, setCanvasSize] = useState({ w: 0, h: 0 });
  const innerRef = useRef<HTMLDivElement>(null);

  // Compute SVG line coordinates after layout
  useLayoutEffect(() => {
    if ((!showRelationLines && !showSequentialArrows) || !innerRef.current) {
      setLines([]);
      return;
    }
    const container = innerRef.current;
    const rect = container.getBoundingClientRect();
    setCanvasSize({ w: container.scrollWidth, h: container.scrollHeight });

    const computed: LineCoord[] = [];

    if (showRelationLines) {
      // 底層：相鄰事件的順序線（位置推斷，無具體文本證據）
      for (let i = 0; i < events.length - 1; i++) {
        const srcEl = nodeRefs.current.get(events[i].id);
        const tgtEl = nodeRefs.current.get(events[i + 1].id);
        if (!srcEl || !tgtEl) continue;
        const srcRect = srcEl.getBoundingClientRect();
        const tgtRect = tgtEl.getBoundingClientRect();
        computed.push({
          x1: srcRect.left - rect.left + srcRect.width / 2,
          y1: srcRect.top - rect.top + srcRect.height / 2,
          x2: tgtRect.left - rect.left + tgtRect.width / 2,
          y2: tgtRect.top - rect.top + tgtRect.height / 2,
          type: 'POSITIONAL',
          confidence: 0,
          isPositional: true,
        });
      }
      // 上層：有文本證據的 TemporalRelation 邊
      for (const rel of temporalRelations) {
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
          type: rel.type,
          confidence: rel.confidence,
        });
      }
    }

    if (showSequentialArrows) {
      for (let i = 0; i < events.length - 1; i++) {
        const srcEl = nodeRefs.current.get(events[i].id);
        const tgtEl = nodeRefs.current.get(events[i + 1].id);
        if (!srcEl || !tgtEl) continue;
        const srcRect = srcEl.getBoundingClientRect();
        const tgtRect = tgtEl.getBoundingClientRect();
        computed.push({
          x1: srcRect.left - rect.left + srcRect.width / 2,
          y1: srcRect.top - rect.top + srcRect.height / 2,
          x2: tgtRect.left - rect.left + tgtRect.width / 2,
          y2: tgtRect.top - rect.top + tgtRect.height / 2,
          type: 'NARRATIVE',
          confidence: 1,
          isNarrative: true,
        });
      }
    }

    setLines(computed);
  }, [showRelationLines, showSequentialArrows, temporalRelations, events, layout, nodeRefs, selectedEventId]);

  if (events.length === 0) {
    return (
      <div className="flex items-center justify-center h-full">
        <p className="text-sm" style={{ color: 'var(--fg-muted)' }}>
          尚無事件資料。
        </p>
      </div>
    );
  }

  // Compute chapter band positions
  let bandOffset = 0;
  const bands = chapterGroups.map((g) => {
    const start = bandOffset;
    bandOffset += g.count;
    return { ...g, startIdx: start };
  });

  const highlightedId = selectedEventId ?? hoveredEventId;

  return (
    <div ref={innerRef} className="relative min-h-full" style={{ minWidth: '100%' }}>
      {/* SVG overlay for relation lines and narrative sequence arrows */}
      {lines.length > 0 && (
        <svg
          className="absolute inset-0 pointer-events-none"
          width={canvasSize.w}
          height={canvasSize.h}
          style={{ zIndex: 1 }}
        >
          <defs>
            <marker
              id="arrow-accent"
              viewBox="0 0 10 7"
              refX="10"
              refY="3.5"
              markerWidth="8"
              markerHeight="6"
              orient="auto"
            >
              <polygon points="0 0, 10 3.5, 0 7" fill="#8b5e3c" />
            </marker>
            <marker
              id="arrow-default"
              viewBox="0 0 10 7"
              refX="10"
              refY="3.5"
              markerWidth="8"
              markerHeight="6"
              orient="auto"
            >
              <polygon points="0 0, 10 3.5, 0 7" fill="var(--fg-muted)" />
            </marker>
            <marker
              id="arrow-narrative"
              viewBox="0 0 10 7"
              refX="10"
              refY="3.5"
              markerWidth="6"
              markerHeight="5"
              orient="auto"
            >
              <polygon points="0 0, 10 3.5, 0 7" fill="var(--fg-secondary)" />
            </marker>
            <marker
              id="arrow-positional"
              viewBox="0 0 10 7"
              refX="10"
              refY="3.5"
              markerWidth="5"
              markerHeight="4"
              orient="auto"
            >
              <polygon points="0 0, 10 3.5, 0 7" fill="var(--fg-muted)" />
            </marker>
          </defs>
          {/* 底層：positional 順序線（先渲染） */}
          {lines.filter(l => l.isPositional).map((line, i) => (
            <line
              key={`pos-${i}`}
              x1={line.x1}
              y1={line.y1}
              x2={line.x2}
              y2={line.y2}
              stroke="var(--fg-muted)"
              strokeWidth={1}
              strokeDasharray="3,4"
              opacity={0.25}
              markerEnd="url(#arrow-positional)"
            />
          ))}
          {/* 上層：narrative 箭頭 & TemporalRelation 邊 */}
          {lines.filter(l => !l.isPositional).map((line, i) => {
            if (line.isNarrative) {
              return (
                <line
                  key={`narr-${i}`}
                  x1={line.x1}
                  y1={line.y1}
                  x2={line.x2}
                  y2={line.y2}
                  stroke="var(--fg-secondary)"
                  strokeWidth={2}
                  opacity={0.7}
                  markerEnd="url(#arrow-narrative)"
                />
              );
            }
            const isCausal = line.type === 'CAUSES';
            const isHighConf = line.confidence >= 0.8;
            return (
              <line
                key={`rel-${i}`}
                x1={line.x1}
                y1={line.y1}
                x2={line.x2}
                y2={line.y2}
                stroke={isCausal ? '#8b5e3c' : 'var(--fg-muted)'}
                strokeWidth={2}
                strokeDasharray={isHighConf ? undefined : '4,3'}
                opacity={isHighConf ? 0.6 : 0.4}
                markerEnd={
                  isCausal ? 'url(#arrow-accent)' : 'url(#arrow-default)'
                }
              />
            );
          })}
        </svg>
      )}

      {/* Events — centered when fits, scrollable when overflows */}
      <div
        className={`flex ${isHorizontal ? 'flex-row items-start' : 'flex-col items-center'} p-8 relative`}
        style={{ gap: 120, width: 'max-content', margin: '0 auto', zIndex: 2 }}
      >
        {showChapterBands
          ? bands.map((band, bi) => {
              const bandEvents = events.slice(band.startIdx, band.startIdx + band.count);
              const segments = groupIntoSegments(bandEvents);
              return (
                <div
                  key={band.chapter}
                  className="relative flex flex-col"
                  style={{
                    borderLeft: isHorizontal ? '2px solid var(--accent)' : undefined,
                    borderTop: !isHorizontal ? '2px solid var(--accent)' : undefined,
                    paddingLeft: isHorizontal ? 12 : undefined,
                    paddingTop: !isHorizontal ? 8 : undefined,
                    backgroundColor: 'rgba(239,232,216,0.15)',
                    borderRadius: 4,
                  }}
                >
                  <div className="font-medium mb-3" style={{ color: 'var(--fg-secondary)', fontSize: 13 }}>
                    {band.title || `Ch.${band.chapter}`}
                  </div>
                  <div
                    className={`flex ${isHorizontal ? 'flex-row items-start' : 'flex-col items-center'}`}
                    style={{ gap: 80 }}
                  >
                    {segments.map((seg, si) =>
                      seg.type === 'parallel-group' ? (
                        <div
                          key={`pg-${bi}-${si}`}
                          className={`flex ${isHorizontal ? 'flex-col' : 'flex-row'} items-center`}
                          style={{
                            gap: 40,
                            backgroundColor: 'rgba(139,92,246,0.06)',
                            border: '1px dashed rgba(139,92,246,0.3)',
                            borderRadius: 8,
                            padding: 8,
                          }}
                        >
                          {seg.events.map((evt) => (
                            <EventNode
                              key={evt.id}
                              event={evt}
                              isHorizontal={isHorizontal}
                              isSelected={selectedEventId === evt.id}
                              isHighlighted={highlightedId === evt.id}
                              isFiltered={passesFilter.get(evt.id) ?? true}
                              highlightedCharacters={highlightedCharacters}
                              nodeRefs={nodeRefs}
                              onSelect={() => onSelectEvent(evt.id === selectedEventId ? null : evt.id)}
                              onHover={(h) => onHoverEvent(h ? evt.id : null)}
                            />
                          ))}
                        </div>
                      ) : (
                        <EventNode
                          key={seg.event.id}
                          event={seg.event}
                          isHorizontal={isHorizontal}
                          isSelected={selectedEventId === seg.event.id}
                          isHighlighted={highlightedId === seg.event.id}
                          isFiltered={passesFilter.get(seg.event.id) ?? true}
                          highlightedCharacters={highlightedCharacters}
                          nodeRefs={nodeRefs}
                          onSelect={() => onSelectEvent(seg.event.id === selectedEventId ? null : seg.event.id)}
                          onHover={(h) => onHoverEvent(h ? seg.event.id : null)}
                        />
                      )
                    )}
                  </div>
                </div>
              );
            })
          : groupIntoSegments(events).map((seg, si) =>
              seg.type === 'parallel-group' ? (
                <div
                  key={`pg-${si}`}
                  className={`flex ${isHorizontal ? 'flex-col' : 'flex-row'} items-center`}
                  style={{
                    gap: 40,
                    backgroundColor: 'rgba(139,92,246,0.06)',
                    border: '1px dashed rgba(139,92,246,0.3)',
                    borderRadius: 8,
                    padding: 8,
                  }}
                >
                  {seg.events.map((evt) => (
                    <EventNode
                      key={evt.id}
                      event={evt}
                      isHorizontal={isHorizontal}
                      isSelected={selectedEventId === evt.id}
                      isHighlighted={highlightedId === evt.id}
                      isFiltered={passesFilter.get(evt.id) ?? true}
                      highlightedCharacters={highlightedCharacters}
                      nodeRefs={nodeRefs}
                      onSelect={() => onSelectEvent(evt.id === selectedEventId ? null : evt.id)}
                      onHover={(h) => onHoverEvent(h ? evt.id : null)}
                    />
                  ))}
                </div>
              ) : (
                <EventNode
                  key={seg.event.id}
                  event={seg.event}
                  isHorizontal={isHorizontal}
                  isSelected={selectedEventId === seg.event.id}
                  isHighlighted={highlightedId === seg.event.id}
                  isFiltered={passesFilter.get(seg.event.id) ?? true}
                  highlightedCharacters={highlightedCharacters}
                  nodeRefs={nodeRefs}
                  onSelect={() => onSelectEvent(seg.event.id === selectedEventId ? null : seg.event.id)}
                  onHover={(h) => onHoverEvent(h ? seg.event.id : null)}
                />
              )
            )}
      </div>
    </div>
  );
}

/* ── Event Node ──────────────────────────────────────────────── */

interface EventNodeProps {
  event: TimelineEvent;
  isHorizontal: boolean;
  isSelected: boolean;
  isHighlighted: boolean;
  isFiltered: boolean;
  highlightedCharacters: Set<string>;
  nodeRefs: React.MutableRefObject<Map<string, HTMLDivElement>>;
  onSelect: () => void;
  onHover: (hovering: boolean) => void;
}

function EventNode({
  event,
  isHorizontal,
  isSelected,
  isHighlighted,
  isFiltered,
  highlightedCharacters,
  nodeRefs,
  onSelect,
  onHover,
}: EventNodeProps) {
  const size = getEventSize(event);
  const badge = NARRATIVE_BADGE[event.narrativeMode];
  const dimmed = !isFiltered;
  const nodeColor = NARRATIVE_COLORS[event.narrativeMode];

  // Register ref
  const circleRef = useCallback(
    (el: HTMLDivElement | null) => {
      if (el) nodeRefs.current.set(event.id, el);
      else nodeRefs.current.delete(event.id);
    },
    [event.id, nodeRefs],
  );

  // Collect pills
  const pills: { id: string; name: string; type: EntityType }[] = [
    ...event.participants,
    ...(event.location
      ? [{ id: event.location.id, name: event.location.name, type: 'location' as EntityType }]
      : []),
  ];

  const pillHighlight = isHighlighted || isSelected;

  return (
    <div
      className={`flex ${isHorizontal ? 'flex-col items-center' : 'flex-row items-center'} gap-1.5`}
      style={{
        width: isHorizontal ? 120 : undefined,
        minHeight: isHorizontal ? undefined : 80,
        padding: '8px 4px',
        opacity: dimmed ? 0.1 : 1,
        pointerEvents: dimmed ? 'none' : 'auto',
        transition: 'opacity 200ms',
      }}
      onMouseEnter={() => onHover(true)}
      onMouseLeave={() => onHover(false)}
    >
      {/* Pills above/left */}
      <div
        className={`flex ${isHorizontal ? 'flex-row flex-wrap justify-center' : 'flex-col'} gap-0.5`}
        style={{ minHeight: isHorizontal ? 16 : undefined }}
      >
        {pills.map((p) => {
          const isCharHighlighted =
            highlightedCharacters.size > 0 && highlightedCharacters.has(p.id);
          return (
            <span
              key={p.id}
              className="inline-flex items-center gap-0.5 text-xs px-1 rounded-full"
              style={{
                fontSize: 9,
                color: PILL_COLORS[p.type] ?? PILL_COLORS.other,
                backgroundColor: `${PILL_COLORS[p.type] ?? PILL_COLORS.other}10`,
                opacity: pillHighlight || isCharHighlighted ? 1.0 : 0.25,
                transition: 'opacity 200ms',
                whiteSpace: 'nowrap',
              }}
            >
              <span
                style={{
                  width: 5,
                  height: 5,
                  borderRadius: '50%',
                  backgroundColor: PILL_COLORS[p.type] ?? PILL_COLORS.other,
                  display: 'inline-block',
                  flexShrink: 0,
                }}
              />
              {p.name}
            </span>
          );
        })}
      </div>

      {/* Node circle */}
      <div
        ref={circleRef}
        onClick={onSelect}
        className="relative flex items-center justify-center rounded-full flex-shrink-0 cursor-pointer transition-transform hover:scale-110"
        style={{
          width: size,
          height: size,
          backgroundColor: nodeColor.bg,
          border: `2px solid ${isSelected ? 'var(--accent)' : nodeColor.border}`,
          boxShadow: isSelected
            ? '0 0 0 3px rgba(139,94,60,0.3)'
            : undefined,
        }}
      >
        {/* Narrative mode badge */}
        {badge && (
          <span
            className="absolute -top-1 -left-1 text-xs rounded-full flex items-center justify-center"
            style={{
              width: 16,
              height: 16,
              fontSize: 9,
              backgroundColor: `${nodeColor.border}40`,
              color: nodeColor.border,
            }}
          >
            {badge}
          </span>
        )}
      </div>

      {/* Label */}
      <div
        className={`flex flex-col ${isHorizontal ? 'items-center text-center' : 'items-start'}`}
      >
        <span
          className="text-xs font-medium leading-tight"
          style={{
            color: 'var(--fg-primary)',
            maxWidth: isHorizontal ? 110 : 160,
            overflow: 'hidden',
            display: '-webkit-box',
            WebkitLineClamp: 2,
            WebkitBoxOrient: 'vertical',
          }}
          title={event.title}
        >
          {event.title}
        </span>
        <span
          className="text-xs"
          style={{ color: 'var(--fg-muted)', fontSize: 10 }}
        >
          Ch.{event.chapter}
        </span>
      </div>
    </div>
  );
}

/* ── Event Detail Panel (right side, dark surface) ───────────── */

interface EventDetailPanelProps {
  event: TimelineEvent;
  bookId: string;
  eventMap: Map<string, TimelineEvent>;
  onClose: () => void;
  onJumpToEvent: (eventId: string) => void;
}

function EventDetailPanel({
  event,
  bookId,
  eventMap,
  onClose,
  onJumpToEvent,
}: EventDetailPanelProps) {
  const [openSections, setOpenSections] = useState<Set<string>>(
    new Set(['summary', 'temporal']),
  );

  // Fetch EEP analysis for this event
  const { data: analysis, isLoading: analysisLoading } =
    useQuery<EventAnalysisDetail>({
      queryKey: ['books', bookId, 'events', event.id, 'analysis'],
      queryFn: () => fetchEventAnalysisDetail(bookId, event.id),
      retry: false,
    });

  const toggleSection = (key: string) => {
    setOpenSections((prev) => {
      const next = new Set(prev);
      if (next.has(key)) next.delete(key);
      else next.add(key);
      return next;
    });
  };

  const importanceBadge = event.eventImportance ?? '—';
  const modeBadge = event.narrativeMode !== 'present' ? event.narrativeMode : null;

  return (
    <div
      className="flex-shrink-0 h-full overflow-y-auto"
      style={{
        width: 320,
        backgroundColor: 'var(--panel-bg)',
        borderLeft: '1px solid var(--panel-border)',
      }}
    >
      {/* Header */}
      <div
        className="flex items-start justify-between p-4"
        style={{ borderBottom: '1px solid var(--panel-border)' }}
      >
        <div className="flex-1 min-w-0">
          <h3
            className="text-sm font-semibold truncate"
            style={{
              fontFamily: 'var(--font-serif)',
              color: 'var(--panel-fg)',
            }}
          >
            {event.title}
          </h3>
          <p
            className="text-xs mt-0.5"
            style={{ color: 'var(--panel-fg-muted)' }}
          >
            Ch.{event.chapter}
            {modeBadge ? ` · ${modeBadge}` : ''}
            {' · '}
            {importanceBadge}
          </p>
        </div>
        <button
          onClick={onClose}
          className="ml-2 flex-shrink-0"
          style={{ color: 'var(--panel-fg-muted)' }}
        >
          <X size={16} />
        </button>
      </div>

      {/* Accordion sections */}
      <div className="p-2 space-y-1">
        {/* 1. Event summary */}
        <PanelAccordion
          title="事件概要"
          sectionKey="summary"
          isOpen={openSections.has('summary')}
          onToggle={toggleSection}
        >
          <p
            className="text-xs leading-relaxed"
            style={{ color: 'var(--panel-fg)' }}
          >
            {event.description}
          </p>
          {event.storyTimeHint && (
            <p
              className="text-xs mt-1"
              style={{ color: 'var(--panel-fg-muted)' }}
            >
              故事時間：{event.storyTimeHint}
            </p>
          )}
          {/* Participant pills */}
          {event.participants.length > 0 && (
            <div className="flex flex-wrap gap-1 mt-2">
              {event.participants.map((p) => (
                <PillTag key={p.id} name={p.name} type={p.type} />
              ))}
            </div>
          )}
          {/* Location pill */}
          {event.location && (
            <div className="mt-1">
              <PillTag
                name={event.location.name}
                type="location"
              />
            </div>
          )}
        </PanelAccordion>

        {/* 2. Temporal relations */}
        <PanelAccordion
          title="時序關係"
          sectionKey="temporal"
          isOpen={openSections.has('temporal')}
          onToggle={toggleSection}
        >
          {/* Prior events */}
          <EventLinkList
            label="前驅事件"
            eventIds={analysis?.eep.priorEventIds ?? []}
            eventMap={eventMap}
            onJump={onJumpToEvent}
          />
          {/* Subsequent events */}
          <EventLinkList
            label="後續事件"
            eventIds={analysis?.eep.subsequentEventIds ?? []}
            eventMap={eventMap}
            onJump={onJumpToEvent}
          />
          {/* Chronological rank */}
          {event.chronologicalRank != null && (
            <p
              className="text-xs mt-2"
              style={{ color: 'var(--panel-fg-muted)' }}
            >
              時序位置{' '}
              <span style={{ color: 'var(--panel-fg)' }}>
                {event.chronologicalRank.toFixed(2)}
              </span>{' '}
              / 1.0
            </p>
          )}
          {!analysis && !analysisLoading && (
            <p
              className="text-xs mt-1"
              style={{ color: 'var(--panel-fg-muted)' }}
            >
              尚未分析，無前驅/後續資料。
            </p>
          )}
        </PanelAccordion>

        {/* 3. EEP */}
        <PanelAccordion
          title="證據剖析 — EEP"
          sectionKey="eep"
          isOpen={openSections.has('eep')}
          onToggle={toggleSection}
        >
          {analysisLoading ? (
            <div className="flex items-center gap-2">
              <Loader2
                size={12}
                className="animate-spin"
                style={{ color: 'var(--panel-fg-muted)' }}
              />
              <span
                className="text-xs"
                style={{ color: 'var(--panel-fg-muted)' }}
              >
                載入中...
              </span>
            </div>
          ) : analysis ? (
            <div className="space-y-2 text-xs" style={{ color: 'var(--panel-fg)' }}>
              <LabeledField label="狀態前" value={analysis.eep.stateBefore} />
              <LabeledField label="狀態後" value={analysis.eep.stateAfter} />
              {analysis.eep.causalFactors.length > 0 && (
                <div>
                  <span style={{ color: 'var(--panel-fg-muted)' }}>
                    因果因素：
                  </span>
                  <ul className="list-disc list-inside mt-0.5">
                    {analysis.eep.causalFactors.map((f, i) => (
                      <li key={i}>{f}</li>
                    ))}
                  </ul>
                </div>
              )}
              <LabeledField
                label="結構角色"
                value={analysis.eep.structuralRole}
              />
              <LabeledField
                label="重要性"
                value={analysis.eep.eventImportance}
              />
              <LabeledField
                label="主題意義"
                value={analysis.eep.thematicSignificance}
              />
              {analysis.eep.textEvidence.length > 0 && (
                <div>
                  <span style={{ color: 'var(--panel-fg-muted)' }}>
                    文本證據：
                  </span>
                  <ul className="mt-0.5 space-y-1">
                    {analysis.eep.textEvidence.map((t, i) => (
                      <li
                        key={i}
                        className="italic pl-2"
                        style={{
                          borderLeft: '2px solid var(--panel-border)',
                        }}
                      >
                        {t}
                      </li>
                    ))}
                  </ul>
                </div>
              )}
            </div>
          ) : (
            <p
              className="text-xs"
              style={{ color: 'var(--panel-fg-muted)' }}
            >
              尚未進行 EEP 分析。
            </p>
          )}
        </PanelAccordion>

        {/* 4. Causality analysis */}
        <PanelAccordion
          title="因果分析"
          sectionKey="causality"
          isOpen={openSections.has('causality')}
          onToggle={toggleSection}
        >
          {analysis?.causality ? (
            <div className="space-y-2 text-xs" style={{ color: 'var(--panel-fg)' }}>
              <LabeledField
                label="根本原因"
                value={analysis.causality.rootCause}
              />
              {analysis.causality.causalChain.length > 0 && (
                <div>
                  <span style={{ color: 'var(--panel-fg-muted)' }}>
                    因果鏈：
                  </span>
                  <ol className="list-decimal list-inside mt-0.5">
                    {analysis.causality.causalChain.map((c, i) => (
                      <li key={i}>{c}</li>
                    ))}
                  </ol>
                </div>
              )}
              <LabeledField
                label="因果摘要"
                value={analysis.causality.chainSummary}
              />
            </div>
          ) : (
            <p
              className="text-xs"
              style={{ color: 'var(--panel-fg-muted)' }}
            >
              {analysisLoading ? '載入中...' : '尚無因果分析。'}
            </p>
          )}
        </PanelAccordion>

        {/* 5. Impact analysis */}
        <PanelAccordion
          title="影響分析"
          sectionKey="impact"
          isOpen={openSections.has('impact')}
          onToggle={toggleSection}
        >
          {analysis?.impact ? (
            <div className="space-y-2 text-xs" style={{ color: 'var(--panel-fg)' }}>
              {/* Affected participants as pills */}
              {analysis.impact.affectedParticipantIds.length > 0 && (
                <div>
                  <span style={{ color: 'var(--panel-fg-muted)' }}>
                    受影響角色：
                  </span>
                  <div className="flex flex-wrap gap-1 mt-0.5">
                    {analysis.impact.affectedParticipantIds.map((pid) => {
                      const p = event.participants.find(
                        (pp) => pp.id === pid,
                      );
                      return (
                        <PillTag
                          key={pid}
                          name={p?.name ?? pid}
                          type={p?.type ?? 'character'}
                        />
                      );
                    })}
                  </div>
                </div>
              )}
              {analysis.impact.relationChanges.length > 0 && (
                <div>
                  <span style={{ color: 'var(--panel-fg-muted)' }}>
                    關係變化：
                  </span>
                  <ul className="list-disc list-inside mt-0.5">
                    {analysis.impact.relationChanges.map((r, i) => (
                      <li key={i}>{r}</li>
                    ))}
                  </ul>
                </div>
              )}
              <LabeledField
                label="影響摘要"
                value={analysis.impact.impactSummary}
              />
            </div>
          ) : (
            <p
              className="text-xs"
              style={{ color: 'var(--panel-fg-muted)' }}
            >
              {analysisLoading ? '載入中...' : '尚無影響分析。'}
            </p>
          )}
        </PanelAccordion>
      </div>
    </div>
  );
}

/* ── Panel sub-components ────────────────────────────────────── */

function PanelAccordion({
  title,
  sectionKey,
  isOpen,
  onToggle,
  children,
}: {
  title: string;
  sectionKey: string;
  isOpen: boolean;
  onToggle: (key: string) => void;
  children: React.ReactNode;
}) {
  return (
    <div
      className="rounded-md overflow-hidden"
      style={{ backgroundColor: 'var(--panel-bg-card)' }}
    >
      <button
        className="flex items-center gap-2 w-full px-3 py-2 text-left"
        onClick={() => onToggle(sectionKey)}
      >
        {isOpen ? (
          <ChevronDown
            size={12}
            style={{ color: 'var(--panel-fg-muted)' }}
          />
        ) : (
          <ChevronRight
            size={12}
            style={{ color: 'var(--panel-fg-muted)' }}
          />
        )}
        <span
          className="text-xs font-medium"
          style={{ color: 'var(--panel-fg)' }}
        >
          {title}
        </span>
      </button>
      {isOpen && <div className="px-3 pb-3">{children}</div>}
    </div>
  );
}

function PillTag({ name, type }: { name: string; type: string }) {
  const color = PILL_COLORS[type] ?? PILL_COLORS.other;
  return (
    <span
      className="inline-flex items-center gap-1 text-xs px-1.5 py-0.5 rounded-full"
      style={{
        fontSize: 10,
        color,
        backgroundColor: `${color}15`,
      }}
    >
      <span
        style={{
          width: 5,
          height: 5,
          borderRadius: '50%',
          backgroundColor: color,
          display: 'inline-block',
          flexShrink: 0,
        }}
      />
      {name}
    </span>
  );
}

function LabeledField({
  label,
  value,
}: {
  label: string;
  value: string;
}) {
  if (!value) return null;
  return (
    <div>
      <span style={{ color: 'var(--panel-fg-muted)' }}>{label}：</span>
      <span>{value}</span>
    </div>
  );
}

function EventLinkList({
  label,
  eventIds,
  eventMap,
  onJump,
}: {
  label: string;
  eventIds: string[];
  eventMap: Map<string, TimelineEvent>;
  onJump: (id: string) => void;
}) {
  if (eventIds.length === 0) return null;
  return (
    <div className="text-xs">
      <span style={{ color: 'var(--panel-fg-muted)' }}>{label}：</span>
      <ul className="mt-0.5 space-y-0.5">
        {eventIds.map((eid) => {
          const evt = eventMap.get(eid);
          return (
            <li key={eid}>
              <button
                onClick={() => onJump(eid)}
                className="underline hover:opacity-80"
                style={{ color: 'var(--accent)' }}
              >
                {evt?.title ?? eid}
              </button>
            </li>
          );
        })}
      </ul>
    </div>
  );
}
