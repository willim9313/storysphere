// Event Spine — book-level Kernel/Satellite stats + kernel events, by chapter.
import { useMemo, useState } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { useTranslation } from 'react-i18next';
import type { KernelSpineEvent, NarrativeStructure } from '@/api/narrative';
import { ReviewBadge } from './atoms';

interface PlotSpineProps {
  structure: NarrativeStructure;
  kernelEvents: KernelSpineEvent[];
  bookId: string;
  chapterCount?: number;
  /** Unclassified-events block, wired by the page that owns the tasks. */
  children?: React.ReactNode;
}

export function PlotSpine({ structure, kernelEvents, bookId, chapterCount = 0, children }: Readonly<PlotSpineProps>) {
  const { t } = useTranslation('analysis');
  const navigate = useNavigate();
  const [selectedId, setSelectedId] = useState<string | null>(null);

  const counts = {
    kernel: structure.kernel_event_ids?.length ?? 0,
    satellite: structure.satellite_event_ids?.length ?? 0,
    unclassified: structure.unclassified_event_ids?.length ?? 0,
  };
  const total = counts.kernel + counts.satellite + counts.unclassified;
  const pct = (n: number) => (total > 0 ? (n / total) * 100 : 0);

  const srcLabel = {
    summary_heuristic: t('narrative.source.heuristic'),
    llm_classified: t('narrative.source.llm'),
    human_verified: t('narrative.source.human'),
  }[structure.classification_source];

  // One column per chapter of the book — including the chapters that hold
  // nothing. An empty chapter is a fact about the book, not a gap to close up.
  const chapters = useMemo(() => {
    const byChapter: Record<number, KernelSpineEvent[]> = {};
    for (const ev of kernelEvents) (byChapter[ev.chapter] = byChapter[ev.chapter] ?? []).push(ev);
    const maxSeen = kernelEvents.reduce((m, e) => Math.max(m, e.chapter), 0);
    const n = Math.max(chapterCount, maxSeen, 1);
    return Array.from({ length: n }, (_, i) => ({ ch: i + 1, events: byChapter[i + 1] ?? [] }));
  }, [kernelEvents, chapterCount]);

  const selected = useMemo(
    () => kernelEvents.find((e) => e.id === selectedId) ?? null,
    [kernelEvents, selectedId],
  );

  return (
    <section className="nl-card">
      <div className="nl-hj-head">
        <div className="nl-hj-title">
          <div className="nl-hj-title-line">
            <h2 className="nl-h2">{t('narrative.spine.title')}</h2>
            {/* The framework name doubles as the way out to its full description. */}
            <Link className="nl-term-link" to="/methodology?framework=chatman">
              {t('narrative.spine.subtitle')}
            </Link>
          </div>
          <p className="nl-lead">{t('narrative.spine.lead')}</p>
        </div>
        <div className="nl-hj-actions">
          <span className="ss-badge nl-badge-quiet">
            {structure.classification_source === 'llm_classified' && <span className="ss-llm-glyph" />}
            {srcLabel}
          </span>
          <ReviewBadge status={structure.review_status} />
        </div>
      </div>

      {/* Proportion — satellite only takes width when the book actually has any,
          otherwise the bar reads as kernel vs unclassified, which is what it is. */}
      <div className="nl-ratio">
        <div className="nl-ratio-lead">
          <span className="nl-ratio-n">{counts.kernel}</span>
          <span className="nl-ratio-of">{t('narrative.spine.kernelOfTotal', { total })}</span>
        </div>
        <div className="nl-ratio-main">
          <div className="nl-ratio-bar">
            <span className="nl-ratio-seg is-kernel" style={{ width: `${pct(counts.kernel)}%` }} />
            {counts.satellite > 0 && (
              <span className="nl-ratio-seg is-satellite" style={{ width: `${pct(counts.satellite)}%` }} />
            )}
            <span className="nl-ratio-seg is-unclassified" style={{ width: `${pct(counts.unclassified)}%` }} />
          </div>
          <div className="nl-ratio-legend">
            <span>{t('narrative.spine.barKernel', { n: counts.kernel })}</span>
            {/* "衛星 0 · 本書未出現此分類" and a bare "衛星 0" are different
                statements; only the first says the book has no such class. */}
            {counts.satellite > 0 ? (
              <span>{t('narrative.spine.barSatellite', { n: counts.satellite })}</span>
            ) : (
              <span className="is-muted">{t('narrative.spine.barSatelliteNone')}</span>
            )}
            <span>{t('narrative.spine.barUnclassified', { n: counts.unclassified })}</span>
          </div>
        </div>
      </div>

      {/* Every kernel event, under the chapter it belongs to. */}
      <div className="nl-chgrid">
        {chapters.map((c) => (
          <div key={c.ch} className="nl-chgrid-col-wrap">
            <div className={c.events.length ? 'nl-chgrid-head has-events' : 'nl-chgrid-head'}>
              <span className="nl-chgrid-ch">{t('narrative.spine.chapterUnit', { ch: c.ch })}</span>
              <span className={c.events.length ? 'nl-chgrid-count has-events' : 'nl-chgrid-count'}>
                {c.events.length || '—'}
              </span>
            </div>
            <div className="nl-chgrid-col">
              {c.events.map((ev) => (
                <button
                  key={ev.id}
                  type="button"
                  className={selectedId === ev.id ? 'nl-ev is-selected' : 'nl-ev'}
                  aria-pressed={selectedId === ev.id}
                  onClick={() => setSelectedId(ev.id)}
                >
                  {ev.title}
                </button>
              ))}
              {c.events.length === 0 && <div className="nl-ev-empty">{t('narrative.spine.noKernel')}</div>}
            </div>
          </div>
        ))}
      </div>

      {/* What the selected event means, and the way through to its full analysis. */}
      <div className="nl-evbox">
        {selected ? (
          <>
            <div className="nl-evbox-head">
              <span className="nl-evbox-meta">
                {t('narrative.spine.chapterUnit', { ch: selected.chapter })} ·{' '}
                {t(`timeline.eventTypes.${selected.event_type}`, { defaultValue: selected.event_type })}
              </span>
              <span className="nl-evbox-title">{selected.title}</span>
              <button
                type="button"
                className="nl-evbox-link"
                onClick={() => navigate(`/books/${bookId}/events?event=${selected.id}`)}
              >
                {t('narrative.spine.openInEvents')}
              </button>
            </div>
            <p className="nl-evbox-sig">{selected.significance || selected.description || '—'}</p>
          </>
        ) : (
          <span className="nl-evbox-hint">{t('narrative.spine.evHint')}</span>
        )}
      </div>

      {children}

      <div className="nl-spine-foot">
        <span className="nl-spine-foot-t">{t('narrative.spine.footnote')}</span>
        <button
          type="button"
          onClick={() => navigate(`/books/${bookId}/events`)}
          className="ss-btn ss-btn-md ss-btn-secondary"
        >
          {t('narrative.spine.jump')} →
        </button>
      </div>
    </section>
  );
}
