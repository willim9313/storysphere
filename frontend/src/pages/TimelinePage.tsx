import { useState, useMemo, useCallback, useEffect } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import { useQueryClient } from '@tanstack/react-query';
import {
  ArrowLeftRight,
  ArrowUpDown,
  RefreshCw,
  Loader2,
} from 'lucide-react';
import { useChatContext } from '@/contexts/ChatContext';
import { useBook } from '@/hooks/useBook';
import { useTimeline } from '@/hooks/useTimeline';
import { useTaskPolling } from '@/hooks/useTaskPolling';
import { computeTimeline } from '@/api/timeline';
import { LoadingSpinner } from '@/components/ui/LoadingSpinner';
import { ErrorMessage } from '@/components/ui/ErrorMessage';
import type { TimelineOrder, TimelineEvent, NarrativeMode } from '@/api/types';

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

function getEventSize(event: TimelineEvent): number {
  return IMPORTANCE_SIZE[event.eventImportance ?? ''] ?? DEFAULT_SIZE;
}

export default function TimelinePage() {
  const { bookId } = useParams<{ bookId: string }>();
  const navigate = useNavigate();
  const queryClient = useQueryClient();
  const { setPageContext } = useChatContext();
  const { data: book } = useBook(bookId);

  const [order, setOrder] = useState<TimelineOrder>('narrative');
  const [layout, setLayout] = useState<LayoutDirection>('horizontal');
  const [computeTaskId, setComputeTaskId] = useState<string | null>(null);

  const { data, isLoading, error } = useTimeline(bookId, order);
  const { data: computeTask } = useTaskPolling(computeTaskId);

  // When compute finishes, refresh timeline data
  useEffect(() => {
    if (computeTask?.status === 'done') {
      setComputeTaskId(null);
      queryClient.invalidateQueries({ queryKey: ['books', bookId, 'timeline'] });
    }
  }, [computeTask?.status, bookId, queryClient]);

  const isComputing = computeTaskId !== null && computeTask?.status !== 'done' && computeTask?.status !== 'error';

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
      events.sort((a, b) => (a.chronologicalRank ?? 0) - (b.chronologicalRank ?? 0));
    }
    return events;
  }, [data?.events, order]);

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

  if (isLoading) return <LoadingSpinner />;
  if (error) return <ErrorMessage message={error.message} />;

  const quality = data?.quality;
  const hasRanks = quality?.hasChronologicalRanks ?? false;

  return (
    <div className="flex flex-col h-full overflow-hidden" style={{ backgroundColor: 'var(--bg-primary)' }}>
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
      />

      {/* Timeline main area */}
      <div className="flex-1 overflow-auto">
        <TimelineCanvas
          events={sortedEvents}
          chapterGroups={chapterGroups}
          layout={layout}
          order={order}
        />
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
  quality: { eepCoverage: number; analyzedCount: number; totalCount: number; hasChronologicalRanks: boolean } | undefined;
  hasRanks: boolean;
  isComputing: boolean;
  onCompute: () => void;
  onGoToAnalysis: () => void;
}

function Toolbar({
  order, onOrderChange, layout, onLayoutChange,
  quality, hasRanks, isComputing, onCompute, onGoToAnalysis,
}: ToolbarProps) {
  return (
    <div
      className="flex items-center justify-between px-4 py-2 flex-shrink-0 gap-4"
      style={{ borderBottom: '1px solid var(--border)', backgroundColor: 'white' }}
    >
      {/* Left: order select + layout toggle */}
      <div className="flex items-center gap-3">
        <select
          value={order}
          onChange={(e) => onOrderChange(e.target.value as TimelineOrder)}
          className="text-xs px-2 py-1 rounded-md"
          style={{
            border: '1px solid var(--border)',
            backgroundColor: 'var(--bg-primary)',
            color: 'var(--fg-primary)',
          }}
        >
          <option value="narrative">章節順序</option>
          <option value="chronological">
            故事時序{!hasRanks ? ' \u26A0\uFE0F' : ''}
          </option>
        </select>

        <button
          onClick={() => onLayoutChange(layout === 'horizontal' ? 'vertical' : 'horizontal')}
          className="flex items-center gap-1 text-xs px-2 py-1 rounded-md"
          style={{
            border: '1px solid var(--border)',
            backgroundColor: 'var(--bg-primary)',
            color: 'var(--fg-secondary)',
          }}
          title={layout === 'horizontal' ? '切換為垂直佈局' : '切換為水平佈局'}
        >
          {layout === 'horizontal' ? (
            <><ArrowLeftRight size={12} /> 水平</>
          ) : (
            <><ArrowUpDown size={12} /> 垂直</>
          )}
        </button>
      </div>

      {/* Center: quality indicator */}
      {quality && (
        <QualityIndicator
          quality={quality}
          onClick={onGoToAnalysis}
        />
      )}

      {/* Right: compute button */}
      <button
        onClick={onCompute}
        disabled={isComputing}
        className="flex items-center gap-1.5 text-xs px-3 py-1.5 rounded-md transition-colors"
        style={{
          border: '1px solid var(--border)',
          backgroundColor: isComputing ? 'var(--bg-tertiary)' : 'var(--bg-primary)',
          color: isComputing ? 'var(--fg-muted)' : 'var(--fg-primary)',
          cursor: isComputing ? 'not-allowed' : 'pointer',
        }}
      >
        {isComputing ? (
          <><Loader2 size={12} className="animate-spin" /> 計算中…</>
        ) : (
          <><RefreshCw size={12} /> 重新計算時序</>
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
  quality: { eepCoverage: number; analyzedCount: number; totalCount: number; hasChronologicalRanks: boolean };
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
      <span className="tracking-wider" style={{ fontFamily: 'monospace' }}>
        {Array.from({ length: blocks }, (_, i) => (
          <span key={i} style={{ color: i < filled ? 'var(--accent)' : 'var(--border)' }}>
            {'\u25A0'}
          </span>
        ))}
      </span>
      <span>
        {quality.analyzedCount}/{quality.totalCount} 事件已分析 ({pct}%)
      </span>
      <span style={{ color: 'var(--border)' }}>{'\u00B7'}</span>
      <span style={{ color: quality.hasChronologicalRanks ? 'var(--accent)' : 'var(--fg-muted)' }}>
        {quality.hasChronologicalRanks ? '時序已計算' : '時序未計算'}
      </span>
    </button>
  );
}

/* ── Timeline Canvas ─────────────────────────────────────────── */

interface TimelineCanvasProps {
  events: TimelineEvent[];
  chapterGroups: { chapter: number; title?: string; count: number }[];
  layout: LayoutDirection;
  order: TimelineOrder;
}

function TimelineCanvas({ events, chapterGroups, layout, order }: TimelineCanvasProps) {
  const isHorizontal = layout === 'horizontal';
  const showChapterBands = order === 'narrative';

  if (events.length === 0) {
    return (
      <div className="flex items-center justify-center h-full">
        <p className="text-sm" style={{ color: 'var(--fg-muted)' }}>尚無事件資料。</p>
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

  return (
    <div
      className={`flex ${isHorizontal ? 'flex-row items-start' : 'flex-col items-start'} p-6 gap-0`}
      style={{ minWidth: isHorizontal ? `${events.length * 140 + 80}px` : undefined }}
    >
      {showChapterBands
        ? bands.map((band, bi) => {
            const bandEvents = events.slice(band.startIdx, band.startIdx + band.count);
            return (
              <div
                key={band.chapter}
                className={`relative ${isHorizontal ? 'flex flex-row' : 'flex flex-col'}`}
                style={{
                  backgroundColor: bi % 2 === 0 ? 'transparent' : 'var(--bg-secondary)',
                  borderRadius: 8,
                  padding: isHorizontal ? '8px 0' : '0 8px',
                }}
              >
                {/* Chapter label */}
                <div
                  className={`text-xs ${isHorizontal ? 'absolute -top-0.5 left-2' : 'mb-2 ml-2'}`}
                  style={{ color: 'var(--fg-muted)', fontSize: 10 }}
                >
                  {band.title || `Ch.${band.chapter}`}
                </div>
                <div className={`flex ${isHorizontal ? 'flex-row items-center' : 'flex-col items-center'} gap-2 ${isHorizontal ? 'pt-4' : 'pl-4'}`}>
                  {bandEvents.map((evt) => (
                    <EventNode key={evt.id} event={evt} isHorizontal={isHorizontal} />
                  ))}
                </div>
              </div>
            );
          })
        : events.map((evt) => (
            <EventNode key={evt.id} event={evt} isHorizontal={isHorizontal} />
          ))
      }
    </div>
  );
}

/* ── Event Node ──────────────────────────────────────────────── */

function EventNode({ event, isHorizontal }: { event: TimelineEvent; isHorizontal: boolean }) {
  const size = getEventSize(event);
  const badge = NARRATIVE_BADGE[event.narrativeMode];

  return (
    <div
      className={`flex ${isHorizontal ? 'flex-col items-center' : 'flex-row items-center'} gap-1.5`}
      style={{
        width: isHorizontal ? 120 : undefined,
        minHeight: isHorizontal ? undefined : 80,
        padding: '8px 4px',
      }}
    >
      {/* Node circle */}
      <div
        className="relative flex items-center justify-center rounded-full flex-shrink-0 cursor-pointer
                   transition-transform hover:scale-110"
        style={{
          width: size,
          height: size,
          backgroundColor: '#fee2e2',
          border: '2px solid #ef4444',
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
              backgroundColor: event.narrativeMode === 'unknown'
                ? 'rgba(156,163,175,0.6)'
                : 'rgba(239,68,68,0.3)',
              color: 'white',
            }}
          >
            {badge}
          </span>
        )}
      </div>

      {/* Label */}
      <div className={`flex flex-col ${isHorizontal ? 'items-center text-center' : 'items-start'}`}>
        <span
          className="text-xs font-medium leading-tight"
          style={{
            color: 'var(--fg-primary)',
            maxWidth: isHorizontal ? 110 : 160,
            overflow: 'hidden',
            textOverflow: 'ellipsis',
            whiteSpace: 'nowrap',
          }}
          title={event.title}
        >
          {event.title.length > 20 ? event.title.slice(0, 20) + '…' : event.title}
        </span>
        <span className="text-xs" style={{ color: 'var(--fg-muted)', fontSize: 10 }}>
          Ch.{event.chapter}
        </span>
      </div>
    </div>
  );
}
