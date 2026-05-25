import { useMemo } from 'react';
import { useTranslation } from 'react-i18next';
import { Search } from 'lucide-react';
import type { ImageryEntity, SymbolInterpretation } from '@/api/symbols';
import { SYMBOL_TYPES, POLARITY_STYLE, typeStyle } from './tokens';
import { ReviewBadge } from './Badges';
import { DensityStrip } from './DensityStrip';

export type SymbolSort = 'freq' | 'firstCh' | 'review';

interface Props {
  entities: ImageryEntity[];
  interpretations: Record<string, SymbolInterpretation | undefined>;
  selectedId: string | null;
  onSelect: (id: string) => void;
  typeFilter: string | null;
  setTypeFilter: (v: string | null) => void;
  sort: SymbolSort;
  setSort: (v: SymbolSort) => void;
  search: string;
  setSearch: (v: string) => void;
  totalChapters: number;
}

const REVIEW_ORDER: Record<string, number> = { pending: 0, modified: 1, approved: 2, rejected: 3 };

export function SymbolList({
  entities,
  interpretations,
  selectedId,
  onSelect,
  typeFilter,
  setTypeFilter,
  sort,
  setSort,
  search,
  setSearch,
  totalChapters,
}: Props) {
  const { t } = useTranslation('analysis');

  const counts = useMemo(() => {
    const c: Record<string, number> = {};
    entities.forEach((e) => {
      c[e.imagery_type] = (c[e.imagery_type] ?? 0) + 1;
    });
    return c;
  }, [entities]);

  const filtered = useMemo(() => {
    let xs = entities;
    if (typeFilter) xs = xs.filter((e) => e.imagery_type === typeFilter);
    if (search) {
      const q = search.toLowerCase();
      xs = xs.filter(
        (e) =>
          e.term.toLowerCase().includes(q) || e.aliases.some((a) => a.toLowerCase().includes(q)),
      );
    }
    if (sort === 'freq') xs = [...xs].sort((a, b) => b.frequency - a.frequency);
    else if (sort === 'firstCh') xs = [...xs].sort((a, b) => (a.first_chapter ?? 99) - (b.first_chapter ?? 99));
    else if (sort === 'review') {
      xs = [...xs].sort((a, b) => {
        const sa = interpretations[a.id]?.review_status;
        const sb = interpretations[b.id]?.review_status;
        return (sa ? REVIEW_ORDER[sa] : 9) - (sb ? REVIEW_ORDER[sb] : 9);
      });
    }
    return xs;
  }, [entities, typeFilter, search, sort, interpretations]);

  return (
    <aside className="sym-list">
      <div className="sym-list-section">
        <div className="sym-list-label">{t('symbol.typeLabel')}</div>
        <div className="sym-chip-row">
          <button
            type="button"
            className={'sym-chip-all' + (typeFilter === null ? ' is-active' : '')}
            onClick={() => setTypeFilter(null)}
          >
            {t('symbol.all')} <span className="sym-chip-count">{entities.length}</span>
          </button>
          {SYMBOL_TYPES.filter((tp) => counts[tp]).map((tp) => {
            const s = typeStyle(tp);
            const active = typeFilter === tp;
            return (
              <button
                key={tp}
                type="button"
                className={'sym-chip-type' + (active ? ' is-active' : '')}
                onClick={() => setTypeFilter(active ? null : tp)}
                style={{
                  background: active ? s.dot : s.bg,
                  color: active ? 'var(--bg-primary)' : s.fg,
                }}
              >
                {t(`symbol.types.${tp}`)} <span className="sym-chip-count">{counts[tp]}</span>
              </button>
            );
          })}
        </div>
      </div>

      <div className="sym-list-section sym-list-tools">
        <div className="sym-search">
          <Search size={12} style={{ color: 'var(--fg-muted)' }} />
          <input
            type="text"
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            placeholder={t('symbol.searchPlaceholder')}
          />
        </div>
        <div className="sym-sort">
          <span className="sym-sort-label">{t('symbol.sort')}</span>
          {(['freq', 'firstCh', 'review'] as SymbolSort[]).map((k) => (
            <button
              key={k}
              type="button"
              className={'sym-sort-btn' + (sort === k ? ' is-active' : '')}
              onClick={() => setSort(k)}
            >
              {t(`symbol.sortBy.${k}`)}
            </button>
          ))}
        </div>
      </div>

      <div className="sym-list-body">
        {filtered.length === 0 ? (
          <p className="sym-list-empty">
            {entities.length === 0 ? t('symbol.noData') : t('symbol.noResults')}
          </p>
        ) : (
          filtered.map((e) => {
            const interp = interpretations[e.id];
            const s = typeStyle(e.imagery_type);
            const active = selectedId === e.id;
            const polStyle = interp ? POLARITY_STYLE[interp.polarity] : null;
            return (
              <button
                key={e.id}
                type="button"
                className={'sym-row' + (active ? ' is-active' : '')}
                onClick={() => onSelect(e.id)}
              >
                <span className="sym-row-dot" style={{ background: s.dot }} />
                <div className="sym-row-main">
                  <div className="sym-row-line1">
                    <span className="sym-row-term">{e.term}</span>
                    {polStyle && (
                      <span
                        className="sym-row-pol-dot"
                        style={{ background: polStyle.dot }}
                        title={interp ? interp.polarity : undefined}
                      />
                    )}
                  </div>
                  {e.aliases.length > 0 && (
                    <div className="sym-row-aliases">{e.aliases.slice(0, 2).join(' · ')}</div>
                  )}
                  <DensityStrip distribution={e.chapter_distribution} totalChapters={totalChapters} height={3} />
                </div>
                <div className="sym-row-end">
                  <span className="sym-row-freq">{e.frequency}</span>
                  {interp && <ReviewBadge status={interp.review_status} />}
                </div>
              </button>
            );
          })
        )}
      </div>
    </aside>
  );
}
