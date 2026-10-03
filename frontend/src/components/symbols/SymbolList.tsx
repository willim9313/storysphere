import { useMemo } from 'react';
import { useTranslation } from 'react-i18next';
import type { TFunction } from 'i18next';
import { ChevronDown, Search } from 'lucide-react';

import { EmptyState } from '@/components/ui/EmptyState';
import { Tooltip } from '@/components/ui/Tooltip';
import { SYMBOL_TYPES, POLARITY_STYLE, densityStep, typeStyle } from './tokens';
import { BlockBadge, ReviewBadge } from './Badges';
import { OUTSIDE_CELL_FLEX, type ChapterAxis } from './chapterAxis';
import type { SymbolCheck } from './hooks/useSymbolCheck';
import { behaviourLine } from './symbolPhrases';
import { analyzedCount, isBelowTrustFloor, trustPct } from './symbolViewModel';
import {
  rankSymbols,
  type DistributionShape,
  type SortAxis,
  type SymbolAnalysis,
  type SymbolSignals,
} from './symbolSignals';

/** Order of the rank-by menu. Load first — it is the answer to "which one?". */
const SORT_AXES: SortAxis[] = ['load', 'attach', 'span', 'events', 'freq', 'first', 'review'];

interface Props {
  /** Null until the overview has loaded — and stays null if it failed. */
  analysis: SymbolAnalysis | null;
  selectedId: string | null;
  onSelect: (id: string | null) => void;
  check: SymbolCheck;
  sortAxis: SortAxis;
  setSortAxis: (v: SortAxis) => void;
  typeFilter: string | null;
  setTypeFilter: (v: string | null) => void;
  /** Behaviour group picked on the map. Screen-local, deliberately not in the URL. */
  shapeFilter: DistributionShape | null;
  setShapeFilter: (v: DistributionShape | null) => void;
  search: string;
  setSearch: (v: string) => void;
}

/** The figure in the right-hand column, which follows whatever axis is selected. */
function metricOf(
  t: TFunction<'analysis'>,
  s: SymbolSignals,
  axis: SortAxis,
  bodyChapters: number,
): string {
  switch (axis) {
    case 'attach':
      return s.attachment
        ? t('symbol.list.metric.attach', { value: s.attachment.lift.toFixed(1) })
        : t('symbol.list.metric.attachNone');
    case 'span':
      return t('symbol.list.metric.span', {
        hit: s.distribution.bodyChapters.length,
        total: bodyChapters,
      });
    case 'events':
      return t('symbol.list.metric.events', { count: s.eventCount });
    case 'freq':
      return t('symbol.list.metric.freq', { count: s.distribution.body });
    case 'first':
      return s.distribution.firstBodyChapter === null
        ? t('symbol.list.metric.firstNone')
        : t('symbol.list.metric.first', { chapter: s.distribution.firstBodyChapter });
    case 'review':
      return s.reviewStatus
        ? t(`symbol.review.${s.reviewStatus}`)
        : t('symbol.list.metric.reviewNone');
    default:
      return t('symbol.list.metric.load', { value: s.load.toFixed(2) });
  }
}

/**
 * One cell per axis slot: front matter, the body, then back matter.
 *
 * The scale is shared with every other row, so colour means "how often here" and
 * rows can be compared down the list. Normalising each row against its own maximum
 * made the book's dominant image the palest thing on the page and every
 * single-occurrence word the darkest.
 *
 * Cells outside the body are narrower and always dashed-edged — whether or not
 * they hold anything — so the edge says "not the story" without a colour. They are
 * filled by count like any other cell: evidence kept, not shape.
 */
function DensityStrip({ signals, axis }: Readonly<{ signals: SymbolSignals; axis: ChapterAxis }>) {
  const distribution = signals.item.chapter_distribution ?? {};
  return (
    <div className="sym-strip" aria-hidden="true">
      {axis.slots.map((slot) => {
        const count = distribution[String(slot.chapter)] ?? 0;
        const isBody = slot.segment === 'body';
        return (
          <span
            key={slot.chapter}
            className={'sym-strip-cell' + (isBody ? '' : ' is-outside')}
            style={{
              flex: isBody ? 1 : OUTSIDE_CELL_FLEX,
              background: count > 0 ? densityStep(count) : undefined,
            }}
          />
        );
      })}
    </div>
  );
}

function axisLabel(t: TFunction<'analysis'>, axis: SortAxis): string {
  if (axis === 'load') return t('symbol.list.axisDefault');
  if (axis === 'freq') return t('symbol.list.axisFreqAside');
  return t(`symbol.list.axis.${axis}`);
}

export function SymbolList({
  analysis,
  selectedId,
  onSelect,
  check,
  sortAxis,
  setSortAxis,
  typeFilter,
  setTypeFilter,
  shapeFilter,
  setShapeFilter,
  search,
  setSearch,
}: Readonly<Props>) {
  const { t } = useTranslation('analysis');

  const typeCounts = useMemo(() => {
    const counts: Record<string, number> = {};
    for (const s of analysis?.all ?? []) counts[s.imageryType] = (counts[s.imageryType] ?? 0) + 1;
    return counts;
  }, [analysis]);

  const rows = useMemo(() => {
    if (!analysis) return [];
    const query = search.trim().toLowerCase();
    // Searching reaches into the single-occurrence tail. It is left out of the
    // ranked list because it has no behaviour to rank, not because a reader who
    // types its name should be told it does not exist.
    let xs = query ? [...analysis.main, ...analysis.tail] : [...analysis.main];
    if (typeFilter) xs = xs.filter((s) => s.imageryType === typeFilter);
    if (shapeFilter) xs = xs.filter((s) => s.shape === shapeFilter);
    if (query) {
      xs = xs.filter(
        (s) =>
          s.term.toLowerCase().includes(query) ||
          s.aliases.some((a) => a.toLowerCase().includes(query)),
      );
    }
    return rankSymbols(xs, sortAxis);
  }, [analysis, search, typeFilter, shapeFilter, sortAxis]);

  const loaded = analysis !== null;
  const total = analysis?.all.length ?? 0;
  const tailCount = analysis?.tail.length ?? 0;
  let heading: string;
  if (search.trim()) {
    heading = t('symbol.list.headingSearch');
  } else if (shapeFilter) {
    heading = t('symbol.list.headingShape');
  } else {
    heading = t('symbol.list.headingSorted', { axis: t(`symbol.list.axis.${sortAxis}`) });
  }

  const clearFilters = () => {
    setSearch('');
    setTypeFilter(null);
    setShapeFilter(null);
  };

  let body;
  if (!loaded) {
    // Loading, or the overview failed: the main pane says which. Printing
    // 「尚無意象資料」 here would report a failure as an empty book.
    body = null;
  } else if (total === 0) {
    body = <p className="sym-list-empty">{t('symbol.noData')}</p>;
  } else if (rows.length === 0) {
    body = (
      <div className="sym-list-filtered">
        <EmptyState
          weight="filtered"
          title={t('symbol.noResults')}
          action={
            <button type="button" className="ss-btn ss-btn-sm ss-btn-secondary" onClick={clearFilters}>
              {t('symbol.filterEmpty.clear')}
            </button>
          }
        />
      </div>
    );
  } else {
    body = rows.map((s) => {
      const style = typeStyle(s.imageryType);
      const polarity = s.polarity ? POLARITY_STYLE[s.polarity] : null;
      const pickable = check.active && check.candidates.has(s.id);
      const picked = pickable && check.isChecked(s.id);
      // A figure resting mostly on front matter cannot support itself, so it says
      // so — in colour, and in words for anyone who cannot tell the colour.
      const noisy = isBelowTrustFloor(s);
      const metric = (
        <span className={'sym-row-metric' + (noisy ? ' is-noisy' : '')}>
          {metricOf(t, s, sortAxis, analysis.axis.bodyChapterCount)}
        </span>
      );
      const row = (
        <button
          key={s.id}
          type="button"
          className={
            'sym-row' +
            (selectedId === s.id ? ' is-active' : '') +
            (picked ? ' is-picked' : '') +
            (check.active && !pickable ? ' is-unpickable' : '')
          }
          aria-pressed={pickable ? picked : undefined}
          // While picking, a candidate row picks instead of opening. The
          // controls that spend the picks live on the map, so a row that
          // navigated away would discard the selection it just added to.
          onClick={() => (pickable ? check.toggle(s.id) : onSelect(s.id))}
        >
          <Tooltip label={t(`symbol.types.${s.imageryType}`, { defaultValue: s.imageryType })}>
            <span className="sym-row-lead" style={{ background: style.bg }} />
          </Tooltip>

          <span className="sym-row-body">
            <span className="sym-row-line1">
              <span className="sym-row-term">{s.term}</span>
              {s.aliases.length > 0 && (
                <span className="sym-row-aliases">{s.aliases.slice(0, 2).join(' · ')}</span>
              )}
              {/* Both can be true: interpreted once, refused on a later
                  regeneration. Showing only one would hide half the state. */}
              {s.reviewStatus && <ReviewBadge status={s.reviewStatus} />}
              {s.block && <BlockBadge />}
            </span>
            <span className="sym-row-behaviour">{behaviourLine(t, s)}</span>
            <DensityStrip signals={s} axis={analysis.axis} />
          </span>

          {noisy ? (
            <Tooltip label={t('symbol.list.trustBelowFloor', { pct: trustPct(s) })}>{metric}</Tooltip>
          ) : (
            metric
          )}

          {/* The 12px state slot: kept even when empty so every row's figure sits
              on the same right edge. */}
          <span className="sym-row-slot">
            {polarity && (
              <Tooltip label={t(`symbol.polarity.${s.polarity}`)}>
                <span className="sym-row-pol-dot" style={{ background: polarity.dot }} />
              </Tooltip>
            )}
          </span>
        </button>
      );

      if (!check.active) return row;
      // The checkbox is the row's sibling, not its child: the row is a button, and
      // a checkbox nested inside one is both invalid and double-firing. Rows that
      // cannot be picked keep the wrapper and get a gap of the same width, so
      // nothing shifts sideways down the list.
      return (
        <div key={s.id} className="sym-row-wrap">
          {pickable ? (
            <input
              type="checkbox"
              className="sym-row-check"
              checked={picked}
              aria-label={t('symbol.list.checkAria', { term: s.term })}
              onChange={() => check.toggle(s.id)}
            />
          ) : (
            <span className="sym-row-check-gap" aria-hidden="true" />
          )}
          {row}
        </div>
      );
    });
  }

  return (
    <aside className="sym-list">
      <div className="sym-list-controls">
        <label className="sym-sort-select">
          <span className="sym-list-label">{t('symbol.list.sortAxis')}</span>
          <span className="sym-select-wrap">
            <select value={sortAxis} onChange={(e) => setSortAxis(e.target.value as SortAxis)}>
              {SORT_AXES.map((axis) => (
                <option key={axis} value={axis}>
                  {axisLabel(t, axis)}
                </option>
              ))}
            </select>
            <ChevronDown size={14} aria-hidden="true" />
          </span>
        </label>

        <div className="sym-search">
          <Search size={13} aria-hidden="true" />
          <input
            type="text"
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            placeholder={t('symbol.list.searchPlaceholder')}
          />
        </div>

        <div className="sym-chip-row">
          <button
            type="button"
            className={
              'sym-chip-all' + (typeFilter === null && selectedId === null ? ' is-active' : '')
            }
            onClick={() => {
              setTypeFilter(null);
              // Still the only route back to the overview until the detail view
              // grows a breadcrumb. The behaviour filter is cleared there, since
              // that is where it was set.
              onSelect(null);
            }}
          >
            {t('symbol.all')} {loaded && <span className="sym-chip-count">{total}</span>}
          </button>
          {SYMBOL_TYPES.filter((tp) => typeCounts[tp]).map((tp) => {
            const active = typeFilter === tp;
            return (
              <button
                key={tp}
                type="button"
                className={'sym-chip-type' + (active ? ' is-active' : '')}
                onClick={() => setTypeFilter(active ? null : tp)}
              >
                {t(`symbol.types.${tp}`)} <span className="sym-chip-count">{typeCounts[tp]}</span>
              </button>
            );
          })}
        </div>
      </div>

      {/* list-group-head: a label, not a target — no hover, no border. */}
      {loaded && total > 0 && (
        <div className="sym-list-heading">
          <span className="sym-list-heading-text">{heading}</span>
          <span className="sym-list-heading-count">
            {t('symbol.list.groupMeta', { total: rows.length, analyzed: analyzedCount(rows) })}
          </span>
        </div>
      )}

      {/* Which rows carry a checkbox is a rule, not a glitch, so it is stated
          rather than left to be inferred from the rows that lack one. */}
      {check.active && (
        <p className="sym-list-check-hint">
          {check.candidates.size === 0
            ? t('symbol.list.checkNone')
            : t('symbol.list.checkHint')}
        </p>
      )}

      <div className="sym-list-body">{body}</div>

      {tailCount > 0 && !search.trim() && (
        <p className="sym-list-tail-note">{t('symbol.list.tailNote', { count: tailCount })}</p>
      )}
    </aside>
  );
}
