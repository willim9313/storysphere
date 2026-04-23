import { useState } from 'react';
import { useParams } from 'react-router-dom';
import { useQuery } from '@tanstack/react-query';
import { Telescope, Search, BookOpen, Link2 } from 'lucide-react';
import { LoadingSpinner } from '@/components/ui/LoadingSpinner';
import {
  fetchSymbols,
  fetchSymbolTimeline,
  fetchCoOccurrences,
  type ImageryEntity,
} from '@/api/symbols';

// ── Type palette ──────────────────────────────────────────────────

const TYPE_META: Record<string, { label: string; bg: string; fg: string; dot: string }> = {
  object:  { label: '物件', bg: '#dbeafe', fg: '#1e40af', dot: '#3b82f6' },
  nature:  { label: '自然', bg: '#dcfce7', fg: '#166534', dot: '#22c55e' },
  spatial: { label: '空間', bg: '#fef9c3', fg: '#713f12', dot: '#eab308' },
  body:    { label: '身體', bg: '#fee2e2', fg: '#991b1b', dot: '#ef4444' },
  color:   { label: '色彩', bg: '#ede9fe', fg: '#4c1d95', dot: '#8b5cf6' },
  other:   { label: '其他', bg: '#f1f5f9', fg: '#475569', dot: '#94a3b8' },
};

const ALL_TYPES = Object.keys(TYPE_META);

function typeMeta(type: string) {
  return TYPE_META[type] ?? TYPE_META.other;
}

// ── Chapter distribution mini-chart ──────────────────────────────

function ChapterDistChart({
  distribution,
}: {
  distribution: Record<string, number>;
}) {
  const entries = Object.entries(distribution)
    .map(([ch, cnt]) => ({ ch: Number(ch), cnt }))
    .sort((a, b) => a.ch - b.ch);

  if (entries.length === 0) return null;

  const maxCnt = Math.max(...entries.map((e) => e.cnt), 1);
  const BAR_W = 18;
  const GAP = 3;
  const MAX_H = 48;
  const LABEL_H = 14;
  const svgW = entries.length * (BAR_W + GAP);
  const svgH = MAX_H + LABEL_H;

  return (
    <svg width={svgW} height={svgH} style={{ display: 'block', overflow: 'visible' }}>
      {entries.map(({ ch, cnt }, i) => {
        const barH = Math.max(3, (cnt / maxCnt) * MAX_H);
        const x = i * (BAR_W + GAP);
        const y = MAX_H - barH;
        return (
          <g key={ch}>
            <rect
              x={x} y={y}
              width={BAR_W} height={barH}
              rx={3}
              fill="var(--accent)"
              opacity={0.75}
            />
            <text
              x={x + BAR_W / 2} y={svgH - 1}
              textAnchor="middle"
              fontSize={9}
              fill="var(--fg-muted)"
            >
              {ch}
            </text>
            {cnt > 1 && (
              <text
                x={x + BAR_W / 2} y={y - 2}
                textAnchor="middle"
                fontSize={9}
                fill="var(--fg-secondary)"
              >
                {cnt}
              </text>
            )}
          </g>
        );
      })}
    </svg>
  );
}

// ── Imagery list item ─────────────────────────────────────────────

function ImageryItem({
  entity,
  isSelected,
  onSelect,
}: {
  entity: ImageryEntity;
  isSelected: boolean;
  onSelect: () => void;
}) {
  const meta = typeMeta(entity.imagery_type);
  return (
    <button
      onClick={onSelect}
      className="w-full flex items-center gap-2 px-2 py-2 rounded-md text-left transition-colors"
      style={{
        backgroundColor: isSelected ? 'var(--bg-tertiary)' : 'transparent',
      }}
    >
      <span
        className="w-2 h-2 rounded-full flex-shrink-0"
        style={{ backgroundColor: meta.dot }}
      />
      <div className="flex-1 min-w-0">
        <div className="text-xs font-medium truncate" style={{ color: 'var(--fg-primary)' }}>
          {entity.term}
        </div>
        {entity.aliases.length > 0 && (
          <div className="text-xs truncate" style={{ color: 'var(--fg-muted)' }}>
            {entity.aliases.join(' · ')}
          </div>
        )}
      </div>
      <span
        className="text-xs font-semibold px-1.5 py-0.5 rounded flex-shrink-0"
        style={{ background: 'var(--bg-tertiary)', color: 'var(--fg-secondary)' }}
      >
        {entity.frequency}
      </span>
    </button>
  );
}

// ── Timeline entry ────────────────────────────────────────────────

function TimelineRow({ entry }: { entry: { chapter_number: number; position: number; context_window: string; co_occurring_terms: string[] } }) {
  return (
    <div
      className="px-4 py-3 flex gap-3"
      style={{ borderBottom: '1px solid var(--border)' }}
    >
      <div
        className="flex-shrink-0 flex flex-col items-center gap-0.5"
        style={{ width: 40 }}
      >
        <span className="text-xs font-semibold" style={{ color: 'var(--accent)' }}>
          Ch{entry.chapter_number}
        </span>
        <span className="text-xs" style={{ color: 'var(--fg-muted)' }}>
          #{entry.position}
        </span>
      </div>
      <div className="flex-1 min-w-0">
        <p className="text-xs leading-relaxed" style={{ color: 'var(--fg-secondary)' }}>
          {entry.context_window || <span style={{ color: 'var(--fg-muted)', fontStyle: 'italic' }}>（無前後文）</span>}
        </p>
        {entry.co_occurring_terms.length > 0 && (
          <div className="flex flex-wrap gap-1 mt-1.5">
            {entry.co_occurring_terms.map((t) => (
              <span
                key={t}
                className="text-xs px-1.5 py-0.5 rounded"
                style={{ background: 'var(--bg-tertiary)', color: 'var(--fg-muted)' }}
              >
                {t}
              </span>
            ))}
          </div>
        )}
      </div>
    </div>
  );
}

// ── Main Page ─────────────────────────────────────────────────────

export default function SymbolsPage() {
  const { bookId } = useParams<{ bookId: string }>();

  const [search, setSearch] = useState('');
  const [typeFilter, setTypeFilter] = useState<string | null>(null);
  const [selectedId, setSelectedId] = useState<string | null>(null);

  // Imagery list
  const { data: listData, isLoading: listLoading } = useQuery({
    queryKey: ['books', bookId, 'symbols', typeFilter],
    queryFn: () =>
      fetchSymbols(bookId!, {
        imageryType: typeFilter ?? undefined,
        limit: 200,
      }),
    enabled: !!bookId,
  });

  // Timeline for selected
  const { data: timeline = [], isLoading: timelineLoading } = useQuery({
    queryKey: ['books', bookId, 'symbols', selectedId, 'timeline'],
    queryFn: () => fetchSymbolTimeline(selectedId!),
    enabled: !!selectedId,
  });

  // Co-occurrences for selected
  const { data: coOccurrences = [], isLoading: coLoading } = useQuery({
    queryKey: ['books', bookId, 'symbols', selectedId, 'co-occurrences'],
    queryFn: () => fetchCoOccurrences(selectedId!, 12),
    enabled: !!selectedId,
  });

  const entities = listData?.items ?? [];
  const filtered = entities.filter(
    (e) => !search || e.term.toLowerCase().includes(search.toLowerCase()),
  );
  const selected = entities.find((e) => e.id === selectedId) ?? null;

  // Count by type for filter badges
  const typeCounts = entities.reduce<Record<string, number>>((acc, e) => {
    acc[e.imagery_type] = (acc[e.imagery_type] ?? 0) + 1;
    return acc;
  }, {});

  return (
    <div className="flex h-full" style={{ background: 'var(--bg-primary)' }}>

      {/* ── Left sidebar ─────────────────────────────────────── */}
      <div
        className="flex-shrink-0 flex flex-col overflow-hidden"
        style={{
          width: 240,
          borderRight: '1px solid var(--border)',
          background: 'var(--bg-secondary)',
        }}
      >
        {/* Type filter chips */}
        <div className="px-3 pt-3 pb-2 flex flex-wrap gap-1">
          <button
            onClick={() => setTypeFilter(null)}
            className="text-xs px-2 py-0.5 rounded-full"
            style={{
              background: typeFilter === null ? 'var(--accent)' : 'var(--bg-tertiary)',
              color: typeFilter === null ? 'white' : 'var(--fg-secondary)',
            }}
          >
            全部 {entities.length > 0 ? `(${entities.length})` : ''}
          </button>
          {ALL_TYPES.filter((t) => typeCounts[t]).map((t) => {
            const meta = typeMeta(t);
            const active = typeFilter === t;
            return (
              <button
                key={t}
                onClick={() => setTypeFilter(active ? null : t)}
                className="text-xs px-2 py-0.5 rounded-full"
                style={{
                  background: active ? meta.dot : meta.bg,
                  color: active ? 'white' : meta.fg,
                }}
              >
                {meta.label} {typeCounts[t]}
              </button>
            );
          })}
        </div>

        {/* Search */}
        <div className="px-3 pb-2">
          <div
            className="flex items-center gap-2 px-2 py-1 rounded-md"
            style={{ background: 'var(--bg-tertiary)' }}
          >
            <Search size={12} style={{ color: 'var(--fg-muted)' }} />
            <input
              type="text"
              placeholder="搜尋意象..."
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              className="bg-transparent text-xs flex-1 outline-none"
              style={{ color: 'var(--fg-primary)' }}
            />
          </div>
        </div>

        {/* List */}
        <div className="flex-1 overflow-y-auto px-1 pb-2">
          {listLoading ? (
            <div className="flex justify-center py-8"><LoadingSpinner /></div>
          ) : filtered.length === 0 ? (
            <p className="text-xs text-center py-8" style={{ color: 'var(--fg-muted)' }}>
              {entities.length === 0 ? '尚無意象資料' : '無符合結果'}
            </p>
          ) : (
            filtered.map((e) => (
              <ImageryItem
                key={e.id}
                entity={e}
                isSelected={selectedId === e.id}
                onSelect={() => setSelectedId(e.id)}
              />
            ))
          )}
        </div>
      </div>

      {/* ── Right content ─────────────────────────────────────── */}
      <div className="flex-1 overflow-y-auto">
        {selected ? (
          <SymbolDetail
            entity={selected}
            timeline={timeline}
            timelineLoading={timelineLoading}
            coOccurrences={coOccurrences}
            coLoading={coLoading}
            onSelectCo={(id) => setSelectedId(id)}
          />
        ) : (
          <EmptyState hasData={entities.length > 0} />
        )}
      </div>
    </div>
  );
}

// ── Symbol detail pane ────────────────────────────────────────────

function SymbolDetail({
  entity,
  timeline,
  timelineLoading,
  coOccurrences,
  coLoading,
  onSelectCo,
}: {
  entity: ImageryEntity;
  timeline: { chapter_number: number; position: number; context_window: string; co_occurring_terms: string[]; occurrence_id: string }[];
  timelineLoading: boolean;
  coOccurrences: { term: string; imagery_id: string; co_occurrence_count: number; imagery_type: string }[];
  coLoading: boolean;
  onSelectCo: (id: string) => void;
}) {
  const meta = typeMeta(entity.imagery_type);

  return (
    <div style={{ maxWidth: 720, margin: '0 auto', padding: '24px 20px' }}>
      {/* Header */}
      <div className="flex items-start gap-3 mb-6">
        <div>
          <div className="flex items-center gap-2 mb-1">
            <h1
              className="text-xl font-bold"
              style={{ fontFamily: 'var(--font-serif)', color: 'var(--fg-primary)' }}
            >
              {entity.term}
            </h1>
            <span
              className="text-xs px-2 py-0.5 rounded-full font-medium"
              style={{ background: meta.bg, color: meta.fg }}
            >
              {meta.label}
            </span>
            <span className="text-xs" style={{ color: 'var(--fg-muted)' }}>
              出現 {entity.frequency} 次
            </span>
          </div>
          {entity.aliases.length > 0 && (
            <p className="text-sm" style={{ color: 'var(--fg-muted)' }}>
              異體：{entity.aliases.join('、')}
            </p>
          )}
        </div>
      </div>

      {/* Chapter distribution */}
      {Object.keys(entity.chapter_distribution).length > 0 && (
        <div
          className="mb-6 p-4 rounded-lg"
          style={{ border: '1px solid var(--border)', background: 'var(--bg-secondary)' }}
        >
          <div className="flex items-center gap-2 mb-3">
            <BookOpen size={13} style={{ color: 'var(--accent)' }} />
            <span className="text-xs font-medium" style={{ color: 'var(--fg-secondary)' }}>
              章節分布
            </span>
            <span className="text-xs ml-auto" style={{ color: 'var(--fg-muted)' }}>
              首見第 {entity.first_chapter ?? '?'} 章
            </span>
          </div>
          <div style={{ overflowX: 'auto' }}>
            <ChapterDistChart distribution={entity.chapter_distribution} />
          </div>
        </div>
      )}

      {/* Co-occurrences */}
      <div
        className="mb-6 p-4 rounded-lg"
        style={{ border: '1px solid var(--border)', background: 'var(--bg-secondary)' }}
      >
        <div className="flex items-center gap-2 mb-3">
          <Link2 size={13} style={{ color: 'var(--accent)' }} />
          <span className="text-xs font-medium" style={{ color: 'var(--fg-secondary)' }}>
            共現意象
          </span>
        </div>
        {coLoading ? (
          <LoadingSpinner />
        ) : coOccurrences.length === 0 ? (
          <p className="text-xs" style={{ color: 'var(--fg-muted)' }}>尚無共現資料</p>
        ) : (
          <div className="flex flex-wrap gap-2">
            {coOccurrences.map((co) => {
              const coMeta = typeMeta(co.imagery_type);
              return (
                <button
                  key={co.imagery_id}
                  onClick={() => onSelectCo(co.imagery_id)}
                  className="flex items-center gap-1.5 px-2.5 py-1 rounded-full text-xs transition-opacity hover:opacity-80"
                  style={{ background: coMeta.bg, color: coMeta.fg }}
                >
                  <span>{co.term}</span>
                  <span
                    className="font-semibold px-1 rounded-full text-xs"
                    style={{ background: coMeta.dot + '33', color: coMeta.fg }}
                  >
                    {co.co_occurrence_count}
                  </span>
                </button>
              );
            })}
          </div>
        )}
      </div>

      {/* Timeline */}
      <div
        className="rounded-lg overflow-hidden"
        style={{ border: '1px solid var(--border)' }}
      >
        <div
          className="flex items-center gap-2 px-4 py-3"
          style={{
            borderBottom: '1px solid var(--border)',
            background: 'var(--bg-secondary)',
          }}
        >
          <Telescope size={13} style={{ color: 'var(--accent)' }} />
          <span className="text-xs font-medium" style={{ color: 'var(--fg-secondary)' }}>
            出現紀錄
          </span>
          <span className="text-xs ml-auto" style={{ color: 'var(--fg-muted)' }}>
            {timeline.length} 筆
          </span>
        </div>
        {timelineLoading ? (
          <div className="py-8 flex justify-center"><LoadingSpinner /></div>
        ) : timeline.length === 0 ? (
          <p className="text-xs text-center py-8" style={{ color: 'var(--fg-muted)' }}>
            尚無出現紀錄
          </p>
        ) : (
          <div>
            {timeline.map((entry) => (
              <TimelineRow key={entry.occurrence_id} entry={entry} />
            ))}
          </div>
        )}
      </div>
    </div>
  );
}

// ── Empty state ───────────────────────────────────────────────────

function EmptyState({ hasData }: { hasData: boolean }) {
  return (
    <div
      className="flex flex-col items-center justify-center h-full gap-3"
      style={{ color: 'var(--fg-muted)' }}
    >
      <Telescope size={40} style={{ opacity: 0.25 }} />
      {hasData ? (
        <p className="text-sm">選擇左側意象以查看詳細資訊</p>
      ) : (
        <>
          <p className="text-sm">尚無符號意象資料</p>
          <p className="text-xs">重新上傳書籍後將自動執行意象萃取</p>
        </>
      )}
    </div>
  );
}
