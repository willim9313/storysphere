import { useState, useEffect } from 'react';
import { useParams } from 'react-router-dom';
import { useChatContext } from '@/contexts/ChatContext';
import { useBook } from '@/hooks/useBook';
import { useQuery } from '@tanstack/react-query';
import { Telescope, Search, BookOpen, Link2 } from 'lucide-react';
import { useTranslation } from 'react-i18next';
import { LoadingSpinner } from '@/components/ui/LoadingSpinner';
import {
  fetchSymbols,
  fetchSymbolTimeline,
  fetchCoOccurrences,
  type ImageryEntity,
} from '@/api/symbols';

const TYPE_STYLE: Record<string, { bg: string; fg: string; dot: string }> = {
  object:  { bg: 'var(--symbol-object-bg)',  fg: 'var(--symbol-object-fg)',  dot: 'var(--symbol-object-dot)'  },
  nature:  { bg: 'var(--symbol-nature-bg)',  fg: 'var(--symbol-nature-fg)',  dot: 'var(--symbol-nature-dot)'  },
  spatial: { bg: 'var(--symbol-spatial-bg)', fg: 'var(--symbol-spatial-fg)', dot: 'var(--symbol-spatial-dot)' },
  body:    { bg: 'var(--symbol-body-bg)',    fg: 'var(--symbol-body-fg)',    dot: 'var(--symbol-body-dot)'    },
  color:   { bg: 'var(--symbol-color-bg)',   fg: 'var(--symbol-color-fg)',   dot: 'var(--symbol-color-dot)'   },
  other:   { bg: 'var(--symbol-other-bg)',   fg: 'var(--symbol-other-fg)',   dot: 'var(--symbol-other-dot)'   },
};

const ALL_TYPES = Object.keys(TYPE_STYLE);

function typeStyle(type: string) {
  return TYPE_STYLE[type] ?? TYPE_STYLE.other;
}

function ChapterDistChart({ distribution }: { distribution: Record<string, number> }) {
  const entries = Object.entries(distribution)
    .map(([ch, cnt]) => ({ ch: Number(ch), cnt }))
    .sort((a, b) => a.ch - b.ch);

  if (entries.length === 0) return null;

  const maxCnt = Math.max(...entries.map((e) => e.cnt), 1);
  const BAR_W = 18, GAP = 3, MAX_H = 48, LABEL_H = 14;
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
            <rect x={x} y={y} width={BAR_W} height={barH} rx={3} fill="var(--accent)" opacity={0.75} />
            <text x={x + BAR_W / 2} y={svgH - 1} textAnchor="middle" fontSize={9} fill="var(--fg-muted)">{ch}</text>
            {cnt > 1 && (
              <text x={x + BAR_W / 2} y={y - 2} textAnchor="middle" fontSize={9} fill="var(--fg-secondary)">{cnt}</text>
            )}
          </g>
        );
      })}
    </svg>
  );
}

function ImageryItem({ entity, isSelected, onSelect }: {
  entity: ImageryEntity; isSelected: boolean; onSelect: () => void;
}) {
  const style = typeStyle(entity.imagery_type);
  return (
    <button
      onClick={onSelect}
      className="w-full flex items-center gap-2 px-2 py-2 rounded-md text-left transition-colors"
      style={{ backgroundColor: isSelected ? 'var(--bg-tertiary)' : 'transparent' }}
    >
      <span className="w-2 h-2 rounded-full flex-shrink-0" style={{ backgroundColor: style.dot }} />
      <div className="flex-1 min-w-0">
        <div className="text-xs font-medium truncate" style={{ color: 'var(--fg-primary)' }}>{entity.term}</div>
        {entity.aliases.length > 0 && (
          <div className="text-xs truncate" style={{ color: 'var(--fg-muted)' }}>{entity.aliases.join(' · ')}</div>
        )}
      </div>
      <span className="text-xs font-semibold px-1.5 py-0.5 rounded flex-shrink-0" style={{ background: 'var(--bg-tertiary)', color: 'var(--fg-secondary)' }}>
        {entity.frequency}
      </span>
    </button>
  );
}

function TimelineRow({ entry }: { entry: { chapter_number: number; position: number; context_window: string; co_occurring_terms: string[] } }) {
  return (
    <div className="px-4 py-3 flex gap-3" style={{ borderBottom: '1px solid var(--border)' }}>
      <div className="flex-shrink-0 flex flex-col items-center gap-0.5" style={{ width: 40 }}>
        <span className="text-xs font-semibold" style={{ color: 'var(--accent)' }}>Ch{entry.chapter_number}</span>
        <span className="text-xs" style={{ color: 'var(--fg-muted)' }}>#{entry.position}</span>
      </div>
      <div className="flex-1 min-w-0">
        <p className="text-xs leading-relaxed" style={{ color: 'var(--fg-secondary)' }}>
          {entry.context_window || <span style={{ color: 'var(--fg-muted)', fontStyle: 'italic' }}>（無前後文）</span>}
        </p>
        {entry.co_occurring_terms.length > 0 && (
          <div className="flex flex-wrap gap-1 mt-1.5">
            {entry.co_occurring_terms.map((t) => (
              <span key={t} className="text-xs px-1.5 py-0.5 rounded" style={{ background: 'var(--bg-tertiary)', color: 'var(--fg-muted)' }}>{t}</span>
            ))}
          </div>
        )}
      </div>
    </div>
  );
}

export default function SymbolsPage() {
  const { bookId } = useParams<{ bookId: string }>();
  const { setPageContext } = useChatContext();
  const { data: book } = useBook(bookId);
  const { t } = useTranslation('settings');

  useEffect(() => {
    if (book) setPageContext({ page: 'analysis', bookId: bookId!, bookTitle: book.title });
    return () => setPageContext({ page: 'other' });
  }, [book, bookId, setPageContext]);

  const [search, setSearch] = useState('');
  const [typeFilter, setTypeFilter] = useState<string | null>(null);
  const [selectedId, setSelectedId] = useState<string | null>(null);

  const { data: listData, isLoading: listLoading } = useQuery({
    queryKey: ['books', bookId, 'symbols', typeFilter],
    queryFn: () => fetchSymbols(bookId!, { imageryType: typeFilter ?? undefined, limit: 200 }),
    enabled: !!bookId,
  });

  const { data: timeline = [], isLoading: timelineLoading } = useQuery({
    queryKey: ['books', bookId, 'symbols', selectedId, 'timeline'],
    queryFn: () => fetchSymbolTimeline(selectedId!),
    enabled: !!selectedId,
  });

  const { data: coOccurrences = [], isLoading: coLoading } = useQuery({
    queryKey: ['books', bookId, 'symbols', selectedId, 'co-occurrences'],
    queryFn: () => fetchCoOccurrences(selectedId!, 12),
    enabled: !!selectedId,
  });

  const entities = listData?.items ?? [];
  const filtered = entities.filter((e) => !search || e.term.toLowerCase().includes(search.toLowerCase()));
  const selected = entities.find((e) => e.id === selectedId) ?? null;
  const typeCounts = entities.reduce<Record<string, number>>((acc, e) => {
    acc[e.imagery_type] = (acc[e.imagery_type] ?? 0) + 1;
    return acc;
  }, {});

  return (
    <div className="flex h-full" style={{ background: 'var(--bg-primary)' }}>
      {/* Left sidebar */}
      <div
        className="flex-shrink-0 flex flex-col overflow-hidden"
        style={{ width: 240, borderRight: '1px solid var(--border)', background: 'var(--bg-secondary)' }}
      >
        <div className="px-3 pt-3 pb-2 flex flex-wrap gap-1">
          <button
            onClick={() => setTypeFilter(null)}
            className="text-xs px-2 py-0.5 rounded-full"
            style={{ background: typeFilter === null ? 'var(--accent)' : 'var(--bg-tertiary)', color: typeFilter === null ? 'white' : 'var(--fg-secondary)' }}
          >
            {t('symbols.all')} {entities.length > 0 ? `(${entities.length})` : ''}
          </button>
          {ALL_TYPES.filter((tp) => typeCounts[tp]).map((tp) => {
            const style = typeStyle(tp);
            const active = typeFilter === tp;
            return (
              <button
                key={tp}
                onClick={() => setTypeFilter(active ? null : tp)}
                className="text-xs px-2 py-0.5 rounded-full"
                style={{ background: active ? style.dot : style.bg, color: active ? 'white' : style.fg }}
              >
                {t(`symbols.types.${tp}`)} {typeCounts[tp]}
              </button>
            );
          })}
        </div>

        <div className="px-3 pb-2">
          <div className="flex items-center gap-2 px-2 py-1 rounded-md" style={{ background: 'var(--bg-tertiary)' }}>
            <Search size={12} style={{ color: 'var(--fg-muted)' }} />
            <input
              type="text"
              placeholder={t('symbols.searchPlaceholder')}
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              className="bg-transparent text-xs flex-1 outline-none"
              style={{ color: 'var(--fg-primary)' }}
            />
          </div>
        </div>

        <div className="flex-1 overflow-y-auto px-1 pb-2">
          {listLoading ? (
            <div className="flex justify-center py-8"><LoadingSpinner /></div>
          ) : filtered.length === 0 ? (
            <p className="text-xs text-center py-8" style={{ color: 'var(--fg-muted)' }}>
              {entities.length === 0 ? t('symbols.noData') : t('symbols.noResults')}
            </p>
          ) : (
            filtered.map((e) => (
              <ImageryItem key={e.id} entity={e} isSelected={selectedId === e.id} onSelect={() => setSelectedId(e.id)} />
            ))
          )}
        </div>
      </div>

      {/* Right content */}
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

function SymbolDetail({
  entity, timeline, timelineLoading, coOccurrences, coLoading, onSelectCo,
}: {
  entity: ImageryEntity;
  timeline: { chapter_number: number; position: number; context_window: string; co_occurring_terms: string[]; occurrence_id: string }[];
  timelineLoading: boolean;
  coOccurrences: { term: string; imagery_id: string; co_occurrence_count: number; imagery_type: string }[];
  coLoading: boolean;
  onSelectCo: (id: string) => void;
}) {
  const { t } = useTranslation('settings');
  const style = typeStyle(entity.imagery_type);

  return (
    <div style={{ maxWidth: 720, margin: '0 auto', padding: '24px 20px' }}>
      <div className="flex items-start gap-3 mb-6">
        <div>
          <div className="flex items-center gap-2 mb-1">
            <h1 className="text-xl font-bold" style={{ fontFamily: 'var(--font-serif)', color: 'var(--fg-primary)' }}>
              {entity.term}
            </h1>
            <span className="text-xs px-2 py-0.5 rounded-full font-medium" style={{ background: style.bg, color: style.fg }}>
              {t(`symbols.types.${entity.imagery_type}`)}
            </span>
            <span className="text-xs" style={{ color: 'var(--fg-muted)' }}>
              {t('symbols.frequency', { count: entity.frequency })}
            </span>
          </div>
          {entity.aliases.length > 0 && (
            <p className="text-sm" style={{ color: 'var(--fg-muted)' }}>
              {t('symbols.aliases')}{entity.aliases.join('、')}
            </p>
          )}
        </div>
      </div>

      {Object.keys(entity.chapter_distribution).length > 0 && (
        <div className="mb-6 p-4 rounded-lg" style={{ border: '1px solid var(--border)', background: 'var(--bg-secondary)' }}>
          <div className="flex items-center gap-2 mb-3">
            <BookOpen size={13} style={{ color: 'var(--accent)' }} />
            <span className="text-xs font-medium" style={{ color: 'var(--fg-secondary)' }}>{t('symbols.chapterDist')}</span>
            <span className="text-xs ml-auto" style={{ color: 'var(--fg-muted)' }}>
              {t('symbols.firstSeen', { chapter: entity.first_chapter ?? '?' })}
            </span>
          </div>
          <div style={{ overflowX: 'auto' }}>
            <ChapterDistChart distribution={entity.chapter_distribution} />
          </div>
        </div>
      )}

      <div className="mb-6 p-4 rounded-lg" style={{ border: '1px solid var(--border)', background: 'var(--bg-secondary)' }}>
        <div className="flex items-center gap-2 mb-3">
          <Link2 size={13} style={{ color: 'var(--accent)' }} />
          <span className="text-xs font-medium" style={{ color: 'var(--fg-secondary)' }}>{t('symbols.coOccurrences')}</span>
        </div>
        {coLoading ? (
          <LoadingSpinner />
        ) : coOccurrences.length === 0 ? (
          <p className="text-xs" style={{ color: 'var(--fg-muted)' }}>{t('symbols.noCoOccurrences')}</p>
        ) : (
          <div className="flex flex-wrap gap-2">
            {coOccurrences.map((co) => {
              const coStyle = typeStyle(co.imagery_type);
              return (
                <button
                  key={co.imagery_id}
                  onClick={() => onSelectCo(co.imagery_id)}
                  className="flex items-center gap-1.5 px-2.5 py-1 rounded-full text-xs transition-opacity hover:opacity-80"
                  style={{ background: coStyle.bg, color: coStyle.fg }}
                >
                  <span>{co.term}</span>
                  <span className="font-semibold px-1 rounded-full text-xs" style={{ background: coStyle.bg, color: coStyle.fg }}>
                    {co.co_occurrence_count}
                  </span>
                </button>
              );
            })}
          </div>
        )}
      </div>

      <div className="rounded-lg overflow-hidden" style={{ border: '1px solid var(--border)' }}>
        <div className="flex items-center gap-2 px-4 py-3" style={{ borderBottom: '1px solid var(--border)', background: 'var(--bg-secondary)' }}>
          <Telescope size={13} style={{ color: 'var(--accent)' }} />
          <span className="text-xs font-medium" style={{ color: 'var(--fg-secondary)' }}>{t('symbols.occurrences')}</span>
          <span className="text-xs ml-auto" style={{ color: 'var(--fg-muted)' }}>
            {t('symbols.occurrenceCount', { count: timeline.length })}
          </span>
        </div>
        {timelineLoading ? (
          <div className="py-8 flex justify-center"><LoadingSpinner /></div>
        ) : timeline.length === 0 ? (
          <p className="text-xs text-center py-8" style={{ color: 'var(--fg-muted)' }}>{t('symbols.noOccurrences')}</p>
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

function EmptyState({ hasData }: { hasData: boolean }) {
  const { t } = useTranslation('settings');
  return (
    <div className="flex flex-col items-center justify-center h-full gap-3" style={{ color: 'var(--fg-muted)' }}>
      <Telescope size={40} style={{ opacity: 0.25 }} />
      {hasData ? (
        <p className="text-sm">{t('symbols.selectPrompt')}</p>
      ) : (
        <>
          <p className="text-sm">{t('symbols.emptyTitle')}</p>
          <p className="text-xs">{t('symbols.emptyHint')}</p>
        </>
      )}
    </div>
  );
}
