import { useMemo } from 'react';
import { useTranslation } from 'react-i18next';
import type { TFunction } from 'i18next';
import { Search } from 'lucide-react';

import { SYMBOL_TYPES, POLARITY_STYLE, densityStep, typeStyle } from './tokens';
import { ReviewBadge } from './Badges';
import type { ChapterAxis } from './chapterAxis';
import { behaviourLine } from './symbolPhrases';
import {
  rankSymbols,
  type DistributionShape,
  type SortAxis,
  type SymbolAnalysis,
  type SymbolSignals,
} from './symbolSignals';

/** Order of the rank-by menu. Load first — it is the answer to "which one?". */
const SORT_AXES: SortAxis[] = ['load', 'attach', 'span', 'events', 'freq', 'first', 'review'];

/** Below this, a ranking figure rests mostly on front matter and is marked as such. */
const TRUST_FLOOR = 0.8;

interface Props {
  analysis: SymbolAnalysis | null;
  selectedId: string | null;
  onSelect: (id: string | null) => void;
  sortAxis: SortAxis;
  setSortAxis: (v: SortAxis) => void;
  typeFilter: string | null;
  setTypeFilter: (v: string | null) => void;
  /** Behaviour group picked on the map. Screen-local, deliberately not in the URL. */
  shapeFilter: DistributionShape | null;
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
 * Non-body cells are narrower and rule-topped rather than filled, so they read as
 * outside the story without vanishing from it.
 */
function DensityStrip({ signals, axis }: Readonly<{ signals: SymbolSignals; axis: ChapterAxis }>) {
  const distribution = signals.item.chapter_distribution ?? {};
  return (
    <div className="sym-strip" aria-hidden="true">
      {axis.slots.map((slot) => {
        const count = distribution[String(slot.chapter)] ?? 0;
        const isBody = slot.segment === 'body';
        // A rule rather than a fill, solid when occupied — present but not part of
        // the story's shape.
        const outsideRule = count > 0 ? '2px solid var(--fg-muted)' : '1px dotted var(--fg-muted)';
        return (
          <span
            key={slot.chapter}
            className={'sym-strip-cell' + (isBody ? '' : ' is-outside')}
            style={{
              flex: isBody ? 1 : 0.7,
              // Outside cells are never filled — the rule alone carries them.
              background: isBody && count > 0 ? densityStep(count) : undefined,
              borderTop: isBody ? undefined : outsideRule,
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
  sortAxis,
  setSortAxis,
  typeFilter,
  setTypeFilter,
  shapeFilter,
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

  return (
    <aside className="sym-list">
      <div className="sym-list-controls">
        <label className="sym-sort-select">
          <span className="sym-list-label">{t('symbol.list.sortAxis')}</span>
          <select value={sortAxis} onChange={(e) => setSortAxis(e.target.value as SortAxis)}>
            {SORT_AXES.map((axis) => (
              <option key={axis} value={axis}>
                {axisLabel(t, axis)}
              </option>
            ))}
          </select>
        </label>

        <div className="sym-search">
          <Search size={12} style={{ color: 'var(--fg-muted)' }} />
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
            {t('symbol.all')} <span className="sym-chip-count">{total}</span>
          </button>
          {SYMBOL_TYPES.filter((tp) => typeCounts[tp]).map((tp) => {
            const style = typeStyle(tp);
            const active = typeFilter === tp;
            return (
              <button
                key={tp}
                type="button"
                className={'sym-chip-type' + (active ? ' is-active' : '')}
                onClick={() => setTypeFilter(active ? null : tp)}
                style={{
                  background: active ? style.bg : 'transparent',
                  color: active ? style.fg : 'var(--fg-secondary)',
                  borderColor: active ? style.dot : 'var(--border)',
                }}
              >
                {t(`symbol.types.${tp}`)} <span className="sym-chip-count">{typeCounts[tp]}</span>
              </button>
            );
          })}
        </div>
      </div>

      <div className="sym-list-heading">
        <span className="sym-list-heading-text">{heading}</span>
        <span className="sym-list-heading-count">
          {t('symbol.list.count', { shown: rows.length, total })}
        </span>
      </div>

      <div className="sym-list-body">
        {rows.length === 0 ? (
          <p className="sym-list-empty">
            {total === 0 ? t('symbol.noData') : t('symbol.noResults')}
          </p>
        ) : (
          rows.map((s) => {
            const style = typeStyle(s.imageryType);
            const polarity = s.polarity ? POLARITY_STYLE[s.polarity] : null;
            return (
              <button
                key={s.id}
                type="button"
                className={'sym-row' + (selectedId === s.id ? ' is-active' : '')}
                onClick={() => onSelect(s.id)}
              >
                <div className="sym-row-line1">
                  <span className="sym-row-dot" style={{ background: style.dot }} />
                  <span className="sym-row-term">{s.term}</span>
                  {s.aliases.length > 0 && (
                    <span className="sym-row-aliases">{s.aliases.slice(0, 2).join(' · ')}</span>
                  )}
                  <span className="sym-row-spacer" />
                  {polarity && (
                    <span
                      className="sym-row-pol-dot"
                      style={{ background: polarity.dot }}
                      title={t(`symbol.polarity.${s.polarity}`)}
                    />
                  )}
                  {s.reviewStatus && <ReviewBadge status={s.reviewStatus} />}
                </div>

                <div className="sym-row-behaviour">{behaviourLine(t, s)}</div>

                {analysis && <DensityStrip signals={s} axis={analysis.axis} />}

                <div
                  className="sym-row-metric"
                  // A figure resting mostly on front matter cannot support itself,
                  // so it says so rather than reading as solid.
                  style={
                    s.trust < TRUST_FLOOR ? { color: 'var(--status-partial-fg)' } : undefined
                  }
                >
                  {metricOf(t, s, sortAxis, analysis?.axis.bodyChapterCount ?? 0)}
                </div>
              </button>
            );
          })
        )}
      </div>

      {tailCount > 0 && !search.trim() && (
        <p className="sym-list-tail-note">{t('symbol.list.tailNote', { count: tailCount })}</p>
      )}
    </aside>
  );
}
