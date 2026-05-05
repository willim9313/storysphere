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
  present:      { border: 'var(--narrative-present-border)',      bg: 'var(--narrative-present-bg)'      },
  flashback:    { border: 'var(--narrative-flashback-border)',    bg: 'var(--narrative-flashback-bg)'    },
  flashforward: { border: 'var(--narrative-flashforward-border)', bg: 'var(--narrative-flashforward-bg)' },
  parallel:     { border: 'var(--narrative-parallel-border)',     bg: 'var(--narrative-parallel-bg)'     },
  unknown:      { border: 'var(--narrative-unknown-border)',      bg: 'var(--narrative-unknown-bg)'      },
};

const PILL_STYLE: Record<string, { color: string; bg: string }> = {
  character:    { color: 'var(--entity-char-dot)',  bg: 'var(--entity-char-bg)'  },
  location:     { color: 'var(--entity-loc-dot)',   bg: 'var(--entity-loc-bg)'   },
  organization: { color: 'var(--entity-org-dot)',   bg: 'var(--entity-org-bg)'   },
  object:       { color: 'var(--entity-obj-dot)',   bg: 'var(--entity-obj-bg)'   },
  concept:      { color: 'var(--entity-con-dot)',   bg: 'var(--entity-con-bg)'   },
  other:        { color: 'var(--entity-other-dot)', bg: 'var(--entity-other-bg)' },
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
  const [order, setOrder] = useState<TimelineOrder>('narrative');
  const [layout, setLayout] = useState<LayoutDirection>('horizontal');
  const [computeTaskId, setComputeTaskId] = useState<string | null>(null);
  const [selectedEventId, setSelectedEventId] = useState<string | null>(null);
  const [hoveredEventId, setHoveredEventId] = useState<string | null>(null);
  const [filter, setFilter] = useState<FilterState>(createDefaultFilter);
  const [filterOpen, setFilterOpen] = useState(false);

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
  const { t } = useTranslation('analysis');
  const tabs = [
    { value: 'narrative' as TimelineOrder, label: t('timeline.tabs.narrative') },
    { value: 'chronological' as TimelineOrder, label: t('timeline.tabs.chronological'), warn: !hasRanks },
    { value: 'matrix' as TimelineOrder, label: t('timeline.tabs.matrix'), warn: !hasRanks },
  ];

  return (
    <div
      className="flex items-center justify-between px-4 py-2 flex-shrink-0 gap-4"
      style={{
        borderBottom: '1px solid var(--border)',
        backgroundColor: 'var(--bg-primary)',
      }}
    >
      {/* Left: view mode tabs + layout toggle + filter */}
      <div className="flex items-center gap-3">
        {/* View tabs — segmented control */}
        <div
          className="flex items-center gap-0.5 p-0.5 rounded-lg"
          style={{ backgroundColor: 'var(--bg-secondary)' }}
        >
          {tabs.map((tab) => {
            const isActive = order === tab.value;
            return (
              <button
                key={tab.value}
                onClick={() => onOrderChange(tab.value)}
                className="flex items-center gap-1.5 text-xs px-3 py-1 rounded-md transition-all duration-150"
                title={tab.warn ? t('timeline.noRanksTooltip') : undefined}
                style={{
                  backgroundColor: isActive ? 'var(--bg-primary)' : 'transparent',
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
                      backgroundColor: 'var(--color-warning)',
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
            title={layout === 'horizontal' ? t('timeline.switchToVertical') : t('timeline.switchToHorizontal')}
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
          {t('timeline.filter')}{filterCount > 0 ? ` (${filterCount})` : ''}
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
            <Loader2 size={12} className="animate-spin" /> {t('timeline.computing')}
          </>
        ) : (
          <>
            <RefreshCw size={12} /> {t('timeline.recompute')}
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
  const { t } = useTranslation('analysis');
  const blocks = 5;
  const filled = Math.round(quality.eepCoverage * blocks);
  const pct = Math.round(quality.eepCoverage * 100);

  return (
    <button
      onClick={onClick}
      className="flex items-center gap-2 text-xs px-2 py-1 rounded-md hover:opacity-80 transition-opacity"
      style={{ color: 'var(--fg-secondary)' }}
      title={t('timeline.qualityTooltip')}
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
        {t('timeline.qualityText', { analyzed: quality.analyzedCount, total: quality.totalCount, pct })}
      </span>
      <span style={{ color: 'var(--border)' }}>{'\u00B7'}</span>
      <span
        style={{
          color: quality.hasChronologicalRanks
            ? 'var(--accent)'
            : 'var(--fg-muted)',
        }}
      >
        {quality.hasChronologicalRanks ? t('timeline.ranked') : t('timeline.notRanked')}
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
  const { t } = useTranslation('analysis');
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
        backgroundColor: 'var(--bg-primary)',
        border: '1px solid var(--border)',
        maxHeight: 480,
        width: 320,
      }}
    >
      <div className="p-3 space-y-3">
        {/* Event types */}
        <FilterGroup title={t('timeline.filterSections.eventTypes')}>
          {options.eventTypes.map((et) => (
            <FilterCheckbox
              key={et}
              label={et}
              checked={filter.eventTypes.has(et)}
              onChange={() => toggleSet('eventTypes', et)}
            />
          ))}
        </FilterGroup>

        {/* Narrative modes */}
        <FilterGroup title={t('timeline.filterSections.narrativeModes')}>
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
        <FilterGroup title={t('timeline.filterSections.characters')}>
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
              placeholder={t('timeline.charSearch')}
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
          <FilterGroup title={t('timeline.filterSections.locations')}>
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
        <FilterGroup title={t('timeline.filterSections.importance')}>
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
            {t('timeline.reset')}
          </button>
          <button
            onClick={onClose}
            className="text-xs px-3 py-1 rounded"
            style={{
              backgroundColor: 'var(--accent)',
              color: 'white',
            }}
          >
            {t('timeline.apply')}
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
  // Show CAUSES edges in both modes; BEFORE/SIMULTANEOUS/DURING are redundant with visual order
  const showRelationLines = order === 'chronological' || order === 'narrative';

  const [lines, setLines] = useState<LineCoord[]>([]);
  const [canvasSize, setCanvasSize] = useState({ w: 0, h: 0 });
  const [spinePoints, setSpinePoints] = useState<{ x: number; y: number }[]>([]);
  const innerRef = useRef<HTMLDivElement>(null);

  // Compute SVG line coordinates after layout
  useLayoutEffect(() => {
    if (!innerRef.current) {
      setLines([]);
      setSpinePoints([]);
      return;
    }
    const container = innerRef.current;
    const rect = container.getBoundingClientRect();
    setCanvasSize({ w: container.scrollWidth, h: container.scrollHeight });

    // Compute spine polyline through each node center in order
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

    // Only draw CAUSES edges — BEFORE/SIMULTANEOUS/DURING are already
    // implied by visual ordering and would just create a noisy bundle.
    if (!showRelationLines) {
      setLines([]);
      return;
    }

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
        type: rel.type,
        confidence: rel.confidence,
      });
    }
    setLines(computed);
  }, [showRelationLines, temporalRelations, events, layout, isHorizontal, nodeRefs, selectedEventId]);

  const { t } = useTranslation('analysis');

  if (events.length === 0) {
    return (
      <div className="flex items-center justify-center h-full">
        <p className="text-sm" style={{ color: 'var(--fg-muted)' }}>
          {t('timeline.noEvents')}
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
      {/* SVG overlay — spine polyline + meaningful TemporalRelation edges */}
      {(spinePoints.length > 1 || lines.length > 0) && (
        <svg
          className="absolute inset-0 pointer-events-none"
          width={canvasSize.w}
          height={canvasSize.h}
          style={{ zIndex: 1 }}
        >
          {spinePoints.length > 1 && (
            <polyline
              points={spinePoints.map((p) => `${p.x},${p.y}`).join(' ')}
              fill="none"
              stroke="var(--fg-muted)"
              strokeWidth={1}
              opacity={0.3}
            />
          )}
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
              <polygon points="0 0, 10 3.5, 0 7" style={{ fill: 'var(--timeline-causal-stroke)' }} />
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
              <polygon points="0 0, 10 3.5, 0 7" style={{ fill: 'var(--fg-muted)' }} />
            </marker>
          </defs>
          {lines.map((line, i) => {
            const isCausal = line.type === 'CAUSES';
            const isHighConf = line.confidence >= 0.8;
            return (
              <line
                key={`rel-${i}`}
                x1={line.x1}
                y1={line.y1}
                x2={line.x2}
                y2={line.y2}
                stroke={isCausal ? 'var(--timeline-causal-stroke)' : 'var(--fg-muted)'}
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
                    backgroundColor: 'var(--timeline-chapter-bg)',
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
                            backgroundColor: 'var(--timeline-parallel-bg)',
                            border: '1px dashed var(--timeline-parallel-border)',
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
                    backgroundColor: 'var(--timeline-parallel-bg)',
                    border: '1px dashed var(--timeline-parallel-border)',
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
          const ps = PILL_STYLE[p.type] ?? PILL_STYLE.other;
          return (
            <span
              key={p.id}
              className="inline-flex items-center gap-0.5 text-xs px-1 rounded-full"
              style={{
                fontSize: 9,
                color: ps.color,
                backgroundColor: ps.bg,
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
                  backgroundColor: ps.color,
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
            ? `0 0 0 3px var(--timeline-selected-ring)`
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
  const { t } = useTranslation('analysis');
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
          title={t('timeline.panel.summary')}
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
              {t('timeline.storyTime')}{event.storyTimeHint}
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
          title={t('timeline.panel.temporal')}
          sectionKey="temporal"
          isOpen={openSections.has('temporal')}
          onToggle={toggleSection}
        >
          {/* Prior events */}
          <EventLinkList
            label={t('timeline.priorEvents')}
            eventIds={analysis?.eep.priorEventIds ?? []}
            eventMap={eventMap}
            onJump={onJumpToEvent}
          />
          {/* Subsequent events */}
          <EventLinkList
            label={t('timeline.subsequentEvents')}
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
              {t('timeline.chronologicalPosition')}{' '}
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
              {t('timeline.noAnalysisData')}
            </p>
          )}
        </PanelAccordion>

        {/* 3. EEP */}
        <PanelAccordion
          title={t('timeline.panel.eep')}
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
                {t('timeline.loading')}
              </span>
            </div>
          ) : analysis ? (
            <div className="space-y-2 text-xs" style={{ color: 'var(--panel-fg)' }}>
              <LabeledField label={t('timeline.eep.stateBefore')} value={analysis.eep.stateBefore} />
              <LabeledField label={t('timeline.eep.stateAfter')} value={analysis.eep.stateAfter} />
              {analysis.eep.causalFactors.length > 0 && (
                <div>
                  <span style={{ color: 'var(--panel-fg-muted)' }}>
                    {t('timeline.eep.causalFactors')}
                  </span>
                  <ul className="list-disc list-inside mt-0.5">
                    {analysis.eep.causalFactors.map((f, i) => (
                      <li key={i}>{f}</li>
                    ))}
                  </ul>
                </div>
              )}
              {/* Participant roles with impact */}
              {analysis.eep.participantRoles.length > 0 && (
                <div>
                  <span style={{ color: 'var(--panel-fg-muted)' }}>
                    {t('timeline.eep.participantRoles')}
                  </span>
                  <ul className="mt-0.5 space-y-1">
                    {analysis.eep.participantRoles.map((r, i) => (
                      <li key={i}>
                        <span className="font-medium">{r.entityName}</span>
                        <span style={{ color: 'var(--panel-fg-muted)' }}> ({r.role})</span>
                        {r.impactDescription && (
                          <p className="mt-0.5 pl-2" style={{ color: 'var(--panel-fg-muted)' }}>
                            {r.impactDescription}
                          </p>
                        )}
                      </li>
                    ))}
                  </ul>
                </div>
              )}
              {/* Consequences */}
              {analysis.eep.consequences.length > 0 && (
                <div>
                  <span style={{ color: 'var(--panel-fg-muted)' }}>
                    {t('timeline.eep.consequences')}
                  </span>
                  <ul className="list-disc list-inside mt-0.5">
                    {analysis.eep.consequences.map((c, i) => (
                      <li key={i}>{c}</li>
                    ))}
                  </ul>
                </div>
              )}
              <LabeledField
                label={t('timeline.eep.structuralRole')}
                value={analysis.eep.structuralRole}
              />
              <LabeledField
                label={t('timeline.eep.importance')}
                value={analysis.eep.eventImportance}
              />
              <LabeledField
                label={t('timeline.eep.thematicSignificance')}
                value={analysis.eep.thematicSignificance}
              />
              {/* Key quotes */}
              {analysis.eep.keyQuotes?.length > 0 && (
                <div>
                  <span style={{ color: 'var(--panel-fg-muted)' }}>
                    {t('timeline.eep.keyQuotes')}
                  </span>
                  <ul className="mt-0.5 space-y-1">
                    {analysis.eep.keyQuotes.map((q, i) => (
                      <li
                        key={i}
                        className="italic pl-2"
                        style={{
                          borderLeft: '2px solid var(--panel-border)',
                        }}
                      >
                        「{q}」
                      </li>
                    ))}
                  </ul>
                </div>
              )}
              {/* Top terms as keyword tags */}
              {Object.keys(analysis.eep.topTerms).length > 0 && (
                <div>
                  <span style={{ color: 'var(--panel-fg-muted)' }}>
                    {t('timeline.eep.topTerms')}
                  </span>
                  <div className="flex flex-wrap gap-1 mt-0.5">
                    {Object.entries(analysis.eep.topTerms)
                      .sort(([, a], [, b]) => b - a)
                      .slice(0, 8)
                      .map(([term]) => (
                        <span
                          key={term}
                          className="px-1.5 py-0.5 rounded text-xs"
                          style={{
                            backgroundColor: 'var(--bg-tertiary)',
                            color: 'var(--panel-fg)',
                          }}
                        >
                          {term}
                        </span>
                      ))}
                  </div>
                </div>
              )}
            </div>
          ) : (
            <p
              className="text-xs"
              style={{ color: 'var(--panel-fg-muted)' }}
            >
              {t('timeline.eep.noEep')}
            </p>
          )}
        </PanelAccordion>

        {/* 4. Causality analysis */}
        <PanelAccordion
          title={t('timeline.panel.causality')}
          sectionKey="causality"
          isOpen={openSections.has('causality')}
          onToggle={toggleSection}
        >
          {analysis?.causality ? (
            <div className="space-y-2 text-xs" style={{ color: 'var(--panel-fg)' }}>
              <LabeledField
                label={t('timeline.causality.rootCause')}
                value={analysis.causality.rootCause}
              />
              {analysis.causality.causalChain.length > 0 && (
                <div>
                  <span style={{ color: 'var(--panel-fg-muted)' }}>
                    {t('timeline.causality.causalChain')}
                  </span>
                  <ol className="list-decimal list-inside mt-0.5">
                    {analysis.causality.causalChain.map((c, i) => (
                      <li key={i}>{c}</li>
                    ))}
                  </ol>
                </div>
              )}
              <LabeledField
                label={t('timeline.causality.chainSummary')}
                value={analysis.causality.chainSummary}
              />
            </div>
          ) : (
            <p
              className="text-xs"
              style={{ color: 'var(--panel-fg-muted)' }}
            >
              {analysisLoading ? t('timeline.loading') : t('timeline.causality.noCausality')}
            </p>
          )}
        </PanelAccordion>

        {/* 5. Impact analysis */}
        <PanelAccordion
          title={t('timeline.panel.impact')}
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
                    {t('timeline.impact.affectedParticipants')}
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
              {/* Per-participant impact descriptions */}
              {analysis.impact.participantImpacts.length > 0 && (
                <div>
                  <span style={{ color: 'var(--panel-fg-muted)' }}>
                    {t('timeline.impact.participantImpacts')}
                  </span>
                  <ul className="mt-0.5 space-y-1">
                    {analysis.impact.participantImpacts.map((p, i) => (
                      <li
                        key={i}
                        className="pl-2"
                        style={{
                          borderLeft: '2px solid var(--panel-border)',
                        }}
                      >
                        {p}
                      </li>
                    ))}
                  </ul>
                </div>
              )}
              {analysis.impact.relationChanges.length > 0 && (
                <div>
                  <span style={{ color: 'var(--panel-fg-muted)' }}>
                    {t('timeline.impact.relationChanges')}
                  </span>
                  <ul className="list-disc list-inside mt-0.5">
                    {analysis.impact.relationChanges.map((r, i) => (
                      <li key={i}>{r}</li>
                    ))}
                  </ul>
                </div>
              )}
              <LabeledField
                label={t('timeline.impact.impactSummary')}
                value={analysis.impact.impactSummary}
              />
            </div>
          ) : (
            <p
              className="text-xs"
              style={{ color: 'var(--panel-fg-muted)' }}
            >
              {analysisLoading ? t('timeline.loading') : t('timeline.impact.noImpact')}
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
  const ps = PILL_STYLE[type] ?? PILL_STYLE.other;
  return (
    <span
      className="inline-flex items-center gap-1 text-xs px-1.5 py-0.5 rounded-full"
      style={{
        fontSize: 10,
        color: ps.color,
        backgroundColor: ps.bg,
      }}
    >
      <span
        style={{
          width: 5,
          height: 5,
          borderRadius: '50%',
          backgroundColor: ps.color,
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
