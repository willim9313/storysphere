// Plot Spine Summary — book-level Kernel/Satellite stats + kernel spine track.
import { useMemo } from 'react';
import { useNavigate } from 'react-router-dom';
import { useTranslation } from 'react-i18next';
import { ArrowRight, Sparkles } from 'lucide-react';
import type { KernelSpineEvent, NarrativeStructure } from '@/api/narrative';
import { ReviewBadge } from './atoms';

interface PlotSpineProps {
  structure: NarrativeStructure;
  kernelEvents: KernelSpineEvent[];
  bookId: string;
}

function SpineLabel({ ev, pos }: { ev: KernelSpineEvent; pos: 'above' | 'below' }) {
  const { t } = useTranslation('analysis');
  return (
    <div
      style={{
        position: 'absolute',
        [pos === 'above' ? 'bottom' : 'top']: 14,
        display: 'flex',
        flexDirection: 'column',
        alignItems: 'center',
        width: 132,
        gap: 1,
      }}
    >
      <span style={{ fontFamily: 'var(--font-serif)', fontSize: 11.5, fontWeight: 600, color: 'var(--fg-primary)', textAlign: 'center', lineHeight: 1.25 }}>{ev.title}</span>
      <span style={{ fontFamily: 'var(--font-mono)', fontSize: 9.5, color: 'var(--fg-muted)' }}>{t('narrative.chapterLabel', { range: ev.chapter })}</span>
    </div>
  );
}

export function PlotSpine({ structure, kernelEvents, bookId }: PlotSpineProps) {
  const { t } = useTranslation('analysis');
  const navigate = useNavigate();

  const counts = {
    kernel: structure.kernel_event_ids?.length ?? 0,
    satellite: structure.satellite_event_ids?.length ?? 0,
    unclassified: structure.unclassified_event_ids?.length ?? 0,
  };
  const total = counts.kernel + counts.satellite + counts.unclassified;

  const srcLabel = {
    summary_heuristic: t('narrative.source.heuristic'),
    llm_classified: t('narrative.source.llm'),
    human_verified: t('narrative.source.human'),
  }[structure.classification_source];

  const kEvents = useMemo(() => [...kernelEvents].sort((a, b) => a.chapter - b.chapter), [kernelEvents]);
  const N = Math.max(1, kEvents.reduce((m, e) => Math.max(m, e.chapter), 1));

  const seg = (count: number, color: string, label: string) => (
    <div style={{ flex: count || 0.001, minWidth: 0, display: 'flex', flexDirection: 'column', gap: 6 }}>
      <div style={{ height: 12, background: color, borderRadius: 3 }} />
      <div style={{ display: 'flex', alignItems: 'baseline', gap: 6 }}>
        <span style={{ fontFamily: 'var(--font-sans)', fontSize: 22, fontWeight: 700, color: 'var(--fg-primary)', lineHeight: 1 }}>{count}</span>
        <span style={{ fontFamily: 'var(--font-sans)', fontSize: 11, color: 'var(--fg-secondary)' }}>{label}</span>
      </div>
    </div>
  );

  return (
    <section className="nl-card">
      <div style={{ display: 'flex', alignItems: 'flex-start', justifyContent: 'space-between', gap: 16, flexWrap: 'wrap' }}>
        <div>
          <div style={{ display: 'flex', alignItems: 'baseline', gap: 10, flexWrap: 'wrap' }}>
            <h2 style={{ margin: 0, fontFamily: 'var(--font-serif)', fontSize: 25, fontWeight: 700, color: 'var(--fg-primary)', letterSpacing: '-0.01em' }}>{t('narrative.spine.title')}</h2>
            <span style={{ fontFamily: 'var(--font-sans)', fontSize: 12, color: 'var(--fg-muted)' }}>{t('narrative.spine.subtitle')}</span>
          </div>
        </div>
        <div style={{ display: 'flex', gap: 8, alignItems: 'center' }}>
          <span
            style={{
              display: 'inline-flex',
              alignItems: 'center',
              gap: 5,
              fontFamily: 'var(--font-sans)',
              fontSize: 11,
              fontWeight: 600,
              padding: '3px 10px',
              borderRadius: 20,
              background: 'var(--bg-tertiary)',
              color: 'var(--fg-secondary)',
              borderWidth: 'var(--border-width)',
              borderStyle: 'var(--border-style)',
              borderColor: 'var(--border)',
            }}
          >
            <Sparkles size={11} /> {srcLabel}
          </span>
          <ReviewBadge status={structure.review_status} />
        </div>
      </div>

      {/* ratio bar + stats */}
      <div style={{ display: 'flex', gap: 14, alignItems: 'flex-end' }}>
        {seg(counts.kernel, 'var(--accent)', t('narrative.spine.kernel'))}
        {seg(counts.satellite, 'color-mix(in oklab, var(--accent) 34%, var(--bg-primary))', t('narrative.spine.satellite'))}
        {seg(counts.unclassified, 'var(--bg-tertiary)', t('narrative.spine.unclassified'))}
        <div style={{ flexShrink: 0, display: 'flex', flexDirection: 'column', alignItems: 'flex-end', gap: 2, paddingLeft: 6 }}>
          <span style={{ fontFamily: 'var(--font-sans)', fontSize: 22, fontWeight: 700, color: 'var(--fg-muted)', lineHeight: 1 }}>{total}</span>
          <span style={{ fontFamily: 'var(--font-sans)', fontSize: 11, color: 'var(--fg-muted)' }}>{t('narrative.spine.events')}</span>
        </div>
      </div>

      {/* kernel spine track */}
      {kEvents.length > 0 && (
        <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
          <span style={{ fontFamily: 'var(--font-sans)', fontSize: 10, fontWeight: 600, letterSpacing: '0.06em', textTransform: 'uppercase', color: 'var(--fg-muted)' }}>
            {t('narrative.spine.kernelSpine')}
          </span>
          <div style={{ position: 'relative', minHeight: 130 }}>
            <div style={{ position: 'absolute', left: 0, right: 0, top: '50%', height: 2, background: 'color-mix(in oklab, var(--accent) 40%, var(--bg-primary))' }} />
            {kEvents.map((ev, i) => {
              const leftPct = N > 1 ? ((ev.chapter - 1) / (N - 1)) * 100 : 50;
              const above = i % 2 === 0;
              return (
                <div key={ev.id} style={{ position: 'absolute', left: `${leftPct}%`, top: '50%', transform: 'translate(-50%,-50%)', display: 'flex', flexDirection: 'column', alignItems: 'center' }}>
                  {above && <SpineLabel ev={ev} pos="above" />}
                  <span style={{ width: 11, height: 11, borderRadius: '50%', background: 'var(--accent)', border: '2px solid var(--bg-primary)', zIndex: 1 }} />
                  {!above && <SpineLabel ev={ev} pos="below" />}
                </div>
              );
            })}
          </div>
        </div>
      )}

      {/* jump */}
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', gap: 12, flexWrap: 'wrap', borderTop: 'var(--border-width) var(--border-style) var(--border)', paddingTop: 14 }}>
        <span style={{ fontFamily: 'var(--font-sans)', fontSize: 11.5, color: 'var(--fg-muted)' }}>{t('narrative.spine.footnote')}</span>
        <button
          onClick={() => navigate(`/books/${bookId}/events`)}
          className="nl-jump-btn"
        >
          {t('narrative.spine.jump')} <ArrowRight size={14} />
        </button>
      </div>
    </section>
  );
}
