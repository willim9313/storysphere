// Event Spine — book-level Kernel/Satellite stats + kernel events, by chapter.
import { useMemo, useState } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { useTranslation } from 'react-i18next';
import { ArrowRight, Sparkles } from 'lucide-react';
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

export function PlotSpine({ structure, kernelEvents, bookId, chapterCount = 0, children }: PlotSpineProps) {
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
      {/* Header */}
      <div style={{ display: 'flex', alignItems: 'flex-start', justifyContent: 'space-between', gap: 16, flexWrap: 'wrap' }}>
        <div style={{ minWidth: 0 }}>
          <div style={{ display: 'flex', alignItems: 'baseline', gap: 10, flexWrap: 'wrap' }}>
            <h2 style={{ margin: 0, fontFamily: 'var(--font-serif)', fontSize: 'var(--font-size-2xl)', fontWeight: 700, color: 'var(--fg-primary)', letterSpacing: '-0.01em' }}>
              {t('narrative.spine.title')}
            </h2>
            {/* The framework name doubles as the way out to its full
                description, so the terms need no explaining here. */}
            <Link className="nl-term-link" to="/methodology?framework=chatman">
              {t('narrative.spine.subtitle')}
            </Link>
          </div>
          <p style={{ margin: '4px 0 0', fontFamily: 'var(--font-sans)', fontSize: 'var(--font-size-xs)', color: 'var(--fg-secondary)', textWrap: 'pretty' }}>
            {t('narrative.spine.lead')}
          </p>
        </div>
        <div style={{ display: 'flex', gap: 8, alignItems: 'center', flexShrink: 0 }}>
          <span style={{
            display: 'inline-flex', alignItems: 'center', gap: 5,
            fontFamily: 'var(--font-sans)', fontSize: 'var(--font-size-2xs)', fontWeight: 600,
            padding: '3px 10px', borderRadius: 20,
            background: 'var(--bg-tertiary)', color: 'var(--fg-secondary)',
            borderWidth: 'var(--border-width)', borderStyle: 'var(--border-style)', borderColor: 'var(--border)',
          }}>
            <Sparkles size={11} /> {srcLabel}
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
        <div style={{ flex: '1 1 300px', minWidth: 220 }}>
          <div className="nl-ratio-bar">
            <div style={{ width: `${pct(counts.kernel)}%`, background: 'var(--accent)' }} />
            {counts.satellite > 0 && (
              <div style={{ width: `${pct(counts.satellite)}%`, background: 'color-mix(in oklab, var(--accent) 34%, var(--bg-primary))' }} />
            )}
            <div style={{ width: `${pct(counts.unclassified)}%`, background: 'var(--bg-tertiary)' }} />
          </div>
          <div className="nl-ratio-legend">
            <span>{t('narrative.spine.barKernel', { n: counts.kernel })}</span>
            {counts.satellite > 0 ? (
              <span>{t('narrative.spine.barSatellite', { n: counts.satellite })}</span>
            ) : (
              <span style={{ color: 'var(--fg-muted)' }}>{t('narrative.spine.barSatelliteNone')}</span>
            )}
            <span>{t('narrative.spine.barUnclassified', { n: counts.unclassified })}</span>
          </div>
        </div>
      </div>

      {/* Every kernel event, under the chapter it belongs to. */}
      <div className="nl-chgrid">
        {chapters.map((c) => (
          <div key={c.ch} style={{ minWidth: 0 }}>
            <div
              className="nl-chgrid-head"
              style={{ borderBottomColor: c.events.length ? 'var(--accent)' : 'var(--border)' }}
            >
              <span className="nl-chgrid-ch">{t('narrative.spine.chapterUnit', { ch: c.ch })}</span>
              <span className="nl-chgrid-count" style={{ color: c.events.length ? 'var(--accent)' : 'var(--fg-muted)' }}>
                {c.events.length || '—'}
              </span>
            </div>
            <div className="nl-chgrid-col">
              {c.events.map((ev) => (
                <button
                  key={ev.id}
                  type="button"
                  className={selectedId === ev.id ? 'nl-ev is-active' : 'nl-ev'}
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
            <div style={{ display: 'flex', alignItems: 'baseline', gap: 10, flexWrap: 'wrap' }}>
              <span style={{ fontFamily: 'var(--font-mono)', fontSize: 'var(--font-size-2xs)', color: 'var(--fg-muted)' }}>
                {t('narrative.spine.chapterUnit', { ch: selected.chapter })} · {t(`timeline.eventTypes.${selected.event_type}`, { defaultValue: selected.event_type })}
              </span>
              <span style={{ fontFamily: 'var(--font-serif)', fontSize: 'var(--font-size-lg)', fontWeight: 600, color: 'var(--fg-primary)' }}>
                {selected.title}
              </span>
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
          <span style={{ fontFamily: 'var(--font-sans)', fontSize: 'var(--font-size-xs)', color: 'var(--fg-muted)' }}>
            {t('narrative.spine.evHint')}
          </span>
        )}
      </div>

      {children}

      {/* Jump link */}
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', gap: 12, flexWrap: 'wrap', borderTop: 'var(--border-width) var(--border-style) var(--border)', paddingTop: 14 }}>
        <span style={{ fontFamily: 'var(--font-sans)', fontSize: 'var(--font-size-2xs)', color: 'var(--fg-muted)' }}>
          {t('narrative.spine.footnote')}
        </span>
        <button type="button" onClick={() => navigate(`/books/${bookId}/events`)} className="nl-jump-btn">
          {t('narrative.spine.jump')} <ArrowRight size={14} />
        </button>
      </div>
    </section>
  );
}
