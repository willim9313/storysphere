/**
 * Chapter card band — the lower half of the 章節順序 view.
 *
 * Shows one chapter at a time. That is the point: the previous design laid
 * all 62 events out horizontally across a 12,390px canvas, so only the first
 * seven were ever visible and nothing indicated the rest existed.
 *
 * Roughly four in five events have no analysis, so they are not given empty
 * cards — they collapse into a side list with an explicit "expand the other
 * N" affordance. Silent truncation is what this replaces.
 */

import { useTranslation } from 'react-i18next';
import type { TimelineDatum } from '@/lib/timelineGeometry';

/** Unanalyzed titles shown before the list defers to an expand button. */
const REST_VISIBLE = 4;

interface ChapterCardBandProps {
  chapter: number;
  chapterTitle?: string;
  /** Every event in the chapter, before filtering. */
  all: TimelineDatum[];
  /** Events passing the filter. */
  shown: TimelineDatum[];
  dimmedIds: Set<string>;
  selectedEventId: string | null;
  expanded: boolean;
  eventTypeLabel: (type: string) => string;
  onSelectEvent: (d: TimelineDatum) => void;
  onExpandRest: () => void;
  onClearFilters: () => void;
  onAnalyzeChapter: () => void;
}

export function ChapterCardBand({
  chapter,
  chapterTitle,
  all,
  shown,
  dimmedIds,
  selectedEventId,
  expanded,
  eventTypeLabel,
  onSelectEvent,
  onExpandRest,
  onClearFilters,
  onAnalyzeChapter,
}: ChapterCardBandProps) {
  const { t } = useTranslation('analysis');

  const analyzed = shown.filter((d) => d.hasAnalysis);
  const unanalyzed = shown.filter((d) => !d.hasAnalysis);
  const asCards = expanded ? shown : analyzed;
  const rest = expanded ? [] : unanalyzed;
  const filteredOut = all.length - shown.length;

  const meta = [
    t('timeline.band.counts', {
      total: all.length,
      analyzed: all.filter((d) => d.hasAnalysis).length,
      unanalyzed: all.filter((d) => !d.hasAnalysis).length,
    }),
    filteredOut > 0 ? t('timeline.band.filteredOut', { n: filteredOut }) : null,
  ]
    .filter(Boolean)
    .join(' · ');

  const emptyBecauseFiltered = shown.length === 0 && all.length > 0;
  const emptyBecauseUnanalyzed = shown.length > 0 && asCards.length === 0;

  return (
    <section className="tl-band" aria-label={t('timeline.band.region', { n: chapter })}>
      <header className="tl-band-head">
        <h2 className="tl-band-title">
          Ch.{chapter}
          {chapterTitle && <span className="tl-band-chapter-title">{chapterTitle}</span>}
        </h2>
        <span className="tl-band-meta">{meta}</span>
        <span className="tl-band-hint">{t('timeline.band.clickHint')}</span>
      </header>

      {emptyBecauseFiltered ? (
        <div className="tl-band-empty">
          <p className="tl-band-empty-title">{t('timeline.band.emptyFilteredTitle')}</p>
          <p className="tl-band-empty-desc">
            {t('timeline.band.emptyFilteredDesc', { ch: chapter, n: all.length })}
          </p>
          <button type="button" className="tl-btn tl-btn-accent" onClick={onClearFilters}>
            {t('timeline.clearAll')}
          </button>
        </div>
      ) : emptyBecauseUnanalyzed ? (
        <div className="tl-band-empty">
          <p className="tl-band-empty-title">{t('timeline.band.emptyUnanalyzedTitle')}</p>
          <p className="tl-band-empty-desc">
            {t('timeline.band.emptyUnanalyzedDesc', { ch: chapter, n: shown.length })}
          </p>
          <button type="button" className="tl-btn tl-btn-accent" onClick={onAnalyzeChapter}>
            {t('timeline.band.analyzeChapter', { n: shown.length })}
          </button>
        </div>
      ) : (
        <div className="tl-band-body">
          <div className="tl-cards">
            {asCards.map((d) => (
              <article
                key={d.id}
                className={[
                  'tl-card',
                  d.isKernel ? 'kernel' : 'satellite',
                  d.id === selectedEventId ? 'selected' : '',
                  dimmedIds.has(d.id) ? 'dim' : '',
                  d.hasAnalysis ? '' : 'unanalyzed',
                ]
                  .filter(Boolean)
                  .join(' ')}
              >
                <button
                  type="button"
                  className="tl-card-hit"
                  onClick={() => onSelectEvent(d)}
                >
                  <div className="tl-card-top">
                    <span className={`tl-card-stamp${d.isKernel ? ' kernel' : ''}`}>
                      {d.isKernel ? t('timeline.card.kernel') : t('timeline.card.satellite')}
                    </span>
                    <span className="tl-card-ch">Ch.{d.chapter}</span>
                    <span className="tl-card-type">{eventTypeLabel(d.event.eventType)}</span>
                  </div>
                  <h3 className="tl-card-title">{d.title}</h3>
                  {/* `flex: none` in CSS is load-bearing — without it the
                      line-clamp box gets squeezed and cuts row two in half. */}
                  <p className="tl-card-desc">
                    {d.event.description || t('timeline.card.noSummary')}
                  </p>
                </button>
              </article>
            ))}
          </div>

          {rest.length > 0 && (
            <aside className="tl-band-rest">
              <div className="tl-band-rest-label">
                {t('timeline.band.restTitle', { n: rest.length })}
              </div>
              <ul className="tl-band-rest-list">
                {rest.slice(0, REST_VISIBLE).map((d) => (
                  <li key={d.id}>
                    <button
                      type="button"
                      className={`tl-band-rest-item${
                        d.id === selectedEventId ? ' selected' : ''
                      }`}
                      onClick={() => onSelectEvent(d)}
                    >
                      {d.title}
                    </button>
                  </li>
                ))}
              </ul>
              <button type="button" className="tl-btn tl-btn-ghost" onClick={onExpandRest}>
                {rest.length > REST_VISIBLE
                  ? t('timeline.band.expandRest', { n: rest.length - REST_VISIBLE })
                  : t('timeline.band.expandAll')}
              </button>
            </aside>
          )}
        </div>
      )}
    </section>
  );
}
