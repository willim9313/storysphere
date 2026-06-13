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
  chapterCount?: number;
}

// Track geometry constants — match design spec.
const PAD       = 64;   // px reserved on each side so first/last labels aren't clipped
const COL_W     = 116;  // px width allocated per chapter column
const LABEL_H   = 40;   // px for 2-line title + chapter tag
const CONN_H    = 9;    // px connector stem above/below dot
const DOT_D     = 14;   // dot diameter (px)
const ABOVE_H   = LABEL_H + CONN_H;           // 49 px
const BELOW_H   = CONN_H + LABEL_H;           // 49 px
const TRACK_H   = ABOVE_H + DOT_D + BELOW_H;  // 112 px total
const CENTER_Y  = ABOVE_H + DOT_D / 2;        // y of dot centre
const MIN_COL_PX = 82;  // minimum px per chapter; drives horizontal scroll threshold

const LINE_COLOR = 'color-mix(in oklab, var(--accent) 40%, var(--bg-primary))';
const CONN_COLOR = 'color-mix(in oklab, var(--accent) 28%, var(--bg-primary))';

function SpineLabel({ ev }: { ev: KernelSpineEvent }) {
  const { t } = useTranslation('analysis');
  return (
    <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 1.5, width: '100%' }}>
      <span style={{
        fontFamily: 'var(--font-serif)', fontSize: 'var(--font-size-2xs)', fontWeight: 600,
        color: 'var(--fg-primary)', textAlign: 'center', lineHeight: 1.3,
        display: '-webkit-box', WebkitLineClamp: 2, WebkitBoxOrient: 'vertical', overflow: 'hidden',
      }}>
        {ev.title}
      </span>
      <span style={{ fontFamily: 'var(--font-mono)', fontSize: 'var(--font-size-2xs)', color: 'var(--fg-muted)', whiteSpace: 'nowrap' }}>
        {t('narrative.spine.chapterUnit', { ch: ev.chapter })}
      </span>
    </div>
  );
}

export function PlotSpine({ structure, kernelEvents, bookId, chapterCount = 0 }: PlotSpineProps) {
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

  // Group kernel events by chapter; preserve sort order within each group.
  const { byChapter, chapterKeys, multiChapters } = useMemo(() => {
    const sorted = [...kernelEvents].sort((a, b) => a.chapter - b.chapter);
    const by: Record<number, KernelSpineEvent[]> = {};
    sorted.forEach(ev => { (by[ev.chapter] = by[ev.chapter] ?? []).push(ev); });
    const keys = Object.keys(by).map(Number).sort((a, b) => a - b);
    const multi = keys.filter(ch => by[ch].length > 1);
    return { byChapter: by, chapterKeys: keys, multiChapters: multi };
  }, [kernelEvents]);

  // N = total chapter count from book data (preferred), else max chapter seen in events.
  const N = Math.max(
    chapterCount,
    chapterKeys.length > 0 ? chapterKeys[chapterKeys.length - 1] : 1,
    1,
  );

  // Minimum track width to avoid squeezing chapters together.
  const trackMinW = PAD * 2 + chapterKeys.length * MIN_COL_PX;

  // Position each chapter column using calc() so PAD is always respected at both edges.
  const chLeft = (ch: number): string => {
    const frac = N > 1 ? (ch - 1) / (N - 1) : 0.5;
    return `calc(${PAD}px + ${frac.toFixed(6)} * (100% - ${PAD * 2}px))`;
  };

  const seg = (count: number, color: string, label: string) => (
    <div style={{ flex: count > 0 ? count : '0 0 auto', minWidth: count > 0 ? 0 : undefined, display: 'flex', flexDirection: 'column', gap: 6 }}>
      <div style={{ height: 12, background: count > 0 ? color : 'transparent', borderRadius: 3 }} />
      <div style={{ display: 'flex', alignItems: 'baseline', gap: 6 }}>
        <span style={{ fontFamily: 'var(--font-sans)', fontSize: 'var(--font-size-xl)', fontWeight: 700, color: 'var(--fg-primary)', lineHeight: 1 }}>{count}</span>
        <span style={{ fontFamily: 'var(--font-sans)', fontSize: 'var(--font-size-2xs)', color: 'var(--fg-secondary)' }}>{label}</span>
      </div>
    </div>
  );

  return (
    <section className="nl-card">
      {/* Header */}
      <div style={{ display: 'flex', alignItems: 'flex-start', justifyContent: 'space-between', gap: 16, flexWrap: 'wrap' }}>
        <div style={{ display: 'flex', alignItems: 'baseline', gap: 10, flexWrap: 'wrap' }}>
          <h2 style={{ margin: 0, fontFamily: 'var(--font-serif)', fontSize: 'var(--font-size-2xl)', fontWeight: 700, color: 'var(--fg-primary)', letterSpacing: '-0.01em' }}>
            {t('narrative.spine.title')}
          </h2>
          <span style={{ fontFamily: 'var(--font-sans)', fontSize: 'var(--font-size-xs)', color: 'var(--fg-muted)' }}>
            {t('narrative.spine.subtitle')}
          </span>
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

      {/* Ratio bar + stats */}
      <div style={{ display: 'flex', gap: 14, alignItems: 'flex-end' }}>
        {seg(counts.kernel,       'var(--accent)',                                              t('narrative.spine.kernel'))}
        {seg(counts.satellite,    'color-mix(in oklab, var(--accent) 34%, var(--bg-primary))', t('narrative.spine.satellite'))}
        {seg(counts.unclassified, 'var(--bg-tertiary)',                                        t('narrative.spine.unclassified'))}
        <div style={{ flexShrink: 0, display: 'flex', flexDirection: 'column', alignItems: 'flex-end', gap: 2, paddingLeft: 6 }}>
          <span style={{ fontFamily: 'var(--font-sans)', fontSize: 'var(--font-size-xl)', fontWeight: 700, color: 'var(--fg-muted)', lineHeight: 1 }}>{total}</span>
          <span style={{ fontFamily: 'var(--font-sans)', fontSize: 'var(--font-size-2xs)', color: 'var(--fg-muted)' }}>{t('narrative.spine.events')}</span>
        </div>
      </div>

      {/* Kernel spine track */}
      {chapterKeys.length > 0 && (
        <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
          <span style={{ fontFamily: 'var(--font-sans)', fontSize: 'var(--font-size-2xs)', fontWeight: 600, letterSpacing: '0.06em', textTransform: 'uppercase', color: 'var(--fg-muted)' }}>
            {t('narrative.spine.kernelSpine')}
          </span>

          {/* Horizontally scrollable track — kicks in when chapters are dense */}
          <div style={{ overflowX: 'auto', paddingBottom: 2 }}>
            <div style={{ position: 'relative', height: TRACK_H, minWidth: trackMinW }}>

              {/* Centre line — spans between the padded endpoints */}
              <div style={{ position: 'absolute', left: PAD, right: PAD, top: CENTER_Y, height: 2, background: LINE_COLOR, zIndex: 0 }} />

              {chapterKeys.map((ch, ci) => {
                const events  = byChapter[ch];
                const isMulti = events.length > 1;
                const above   = ci % 2 === 0;

                return (
                  <div key={ch} style={{
                    position: 'absolute',
                    left: chLeft(ch),
                    top: 0,
                    height: TRACK_H,
                    width: COL_W,
                    transform: 'translateX(-50%)',
                    display: 'flex',
                    flexDirection: 'column',
                    alignItems: 'center',
                    zIndex: 1,
                  }}>
                    {/* Above section */}
                    <div style={{ height: ABOVE_H, display: 'flex', flexDirection: 'column', justifyContent: 'flex-end', alignItems: 'center', width: '100%' }}>
                      {above && (
                        <>
                          {isMulti ? (
                            <span style={{ fontFamily: 'var(--font-mono)', fontSize: 8.5, color: 'var(--fg-muted)', whiteSpace: 'nowrap', paddingBottom: 2 }}>
                              {events.length} {t('narrative.spine.eventsUnit')}
                            </span>
                          ) : (
                            <SpineLabel ev={events[0]} />
                          )}
                          <div style={{ width: 1, height: CONN_H, background: CONN_COLOR, flexShrink: 0 }} />
                        </>
                      )}
                    </div>

                    {/* Dot — larger + badge for multi-event chapters */}
                    <div style={{ position: 'relative', flexShrink: 0, width: DOT_D + 10, height: DOT_D, display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
                      <span style={{
                        display: 'block',
                        width:  isMulti ? DOT_D     : DOT_D - 3,
                        height: isMulti ? DOT_D     : DOT_D - 3,
                        borderRadius: '50%',
                        background: 'var(--accent)',
                        border: '2.5px solid var(--bg-primary)',
                        boxShadow: '0 0 0 1px var(--accent)',
                      }} />
                      {isMulti && (
                        <span style={{
                          position: 'absolute', top: -5, right: -1,
                          minWidth: 14, height: 14, borderRadius: 8, padding: '0 2.5px',
                          background: 'var(--bg-primary)',
                          border: '1.5px solid var(--accent)',
                          color: 'var(--accent)',
                          fontFamily: 'var(--font-mono)', fontSize: 'var(--font-size-2xs)', fontWeight: 700,
                          display: 'flex', alignItems: 'center', justifyContent: 'center',
                          lineHeight: 1,
                        }}>
                          {events.length}
                        </span>
                      )}
                    </div>

                    {/* Below section */}
                    <div style={{ height: BELOW_H, display: 'flex', flexDirection: 'column', justifyContent: 'flex-start', alignItems: 'center', width: '100%' }}>
                      {!above && (
                        <>
                          <div style={{ width: 1, height: CONN_H, background: CONN_COLOR, flexShrink: 0 }} />
                          {isMulti ? (
                            <span style={{ fontFamily: 'var(--font-mono)', fontSize: 8.5, color: 'var(--fg-muted)', whiteSpace: 'nowrap', paddingTop: 2 }}>
                              {events.length} {t('narrative.spine.eventsUnit')}
                            </span>
                          ) : (
                            <SpineLabel ev={events[0]} />
                          )}
                        </>
                      )}
                    </div>
                  </div>
                );
              })}
            </div>
          </div>

          {/* Multi-event chapter expansion — lists every event as a pill, grouped by chapter */}
          {multiChapters.length > 0 && (
            <div style={{ borderTop: 'var(--border-width) var(--border-style) var(--border)', paddingTop: 10, display: 'flex', flexDirection: 'column', gap: 7 }}>
              <span style={{ fontFamily: 'var(--font-sans)', fontSize: 9.5, fontWeight: 600, letterSpacing: '0.07em', textTransform: 'uppercase', color: 'var(--fg-muted)' }}>
                {t('narrative.spine.multiEvChapter')}
              </span>
              {multiChapters.map(ch => (
                <div key={ch} style={{ display: 'flex', alignItems: 'flex-start', gap: 10 }}>
                  <span style={{ fontFamily: 'var(--font-mono)', fontSize: 'var(--font-size-2xs)', color: 'var(--fg-secondary)', whiteSpace: 'nowrap', paddingTop: 3, minWidth: 38 }}>
                    {t('narrative.spine.chapterUnit', { ch })}
                  </span>
                  <div style={{ display: 'flex', flexWrap: 'wrap', gap: 5 }}>
                    {byChapter[ch].map(ev => (
                      <span key={ev.id} style={{
                        display: 'inline-flex', alignItems: 'center', gap: 5,
                        fontFamily: 'var(--font-sans)', fontSize: 'var(--font-size-xs)',
                        padding: '2px 9px 2px 7px', borderRadius: 20,
                        border: '0.5px solid var(--entity-evt-border)',
                        background: 'var(--entity-evt-bg)', color: 'var(--entity-evt-fg)',
                        whiteSpace: 'nowrap',
                      }}>
                        <span style={{ width: 5, height: 5, borderRadius: '50%', background: 'var(--entity-evt-dot)' }} />
                        {ev.title}
                        <span style={{ fontFamily: 'var(--font-mono)', fontSize: 'var(--font-size-2xs)', opacity: 0.7 }}>· {ev.chapter}</span>
                      </span>
                    ))}
                  </div>
                </div>
              ))}
            </div>
          )}
        </div>
      )}

      {/* Jump link */}
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', gap: 12, flexWrap: 'wrap', borderTop: 'var(--border-width) var(--border-style) var(--border)', paddingTop: 14 }}>
        <span style={{ fontFamily: 'var(--font-sans)', fontSize: 11.5, color: 'var(--fg-muted)' }}>
          {t('narrative.spine.footnote')}
        </span>
        <button onClick={() => navigate(`/books/${bookId}/events`)} className="nl-jump-btn">
          {t('narrative.spine.jump')} <ArrowRight size={14} />
        </button>
      </div>
    </section>
  );
}
