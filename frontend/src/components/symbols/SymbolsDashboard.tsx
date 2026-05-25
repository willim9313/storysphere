import { useMemo } from 'react';
import { useTranslation } from 'react-i18next';
import type { ImageryEntity, Polarity, SymbolInterpretation } from '@/api/symbols';

const TYPE_DOT: Record<string, string> = {
  object:  'var(--symbol-object-dot)',
  nature:  'var(--symbol-nature-dot)',
  spatial: 'var(--symbol-spatial-dot)',
  body:    'var(--symbol-body-dot)',
  color:   'var(--symbol-color-dot)',
  other:   'var(--symbol-other-dot)',
};

const POLARITY_DOT: Record<Polarity, string> = {
  positive: 'var(--polarity-positive-dot)',
  negative: 'var(--polarity-negative-dot)',
  neutral:  'var(--polarity-neutral-dot)',
  mixed:    'var(--polarity-mixed-dot)',
};

function densityToken(cnt: number, max: number): string {
  if (cnt === 0) return 'var(--bg-tertiary)';
  const ratio = cnt / max;
  if (ratio >= 0.75) return 'var(--symbol-density-high)';
  if (ratio >= 0.35) return 'var(--symbol-density-mid)';
  return 'var(--symbol-density-low)';
}

type Props = {
  entities: ImageryEntity[];
  interpretations: Record<string, SymbolInterpretation | undefined>;
  totalChapters: number;
};

export function SymbolsDashboard({ entities, interpretations, totalChapters }: Props) {
  const { t } = useTranslation('analysis');

  const total = entities.length;

  const totalOccurrences = useMemo(
    () => entities.reduce((s, e) => s + e.frequency, 0),
    [entities],
  );

  const typeCounts = useMemo(() => {
    const c: Record<string, number> = {};
    entities.forEach((e) => {
      c[e.imagery_type] = (c[e.imagery_type] ?? 0) + 1;
    });
    return c;
  }, [entities]);

  const polCounts = useMemo(() => {
    const c = { positive: 0, negative: 0, neutral: 0, mixed: 0, unanalyzed: 0 };
    entities.forEach((e) => {
      const interp = interpretations[e.id];
      if (!interp) c.unanalyzed++;
      else c[interp.polarity]++;
    });
    return c;
  }, [entities, interpretations]);

  const analyzedCount = total - polCounts.unanalyzed;
  const approvedCount = Object.values(interpretations).filter(
    (i) => i?.review_status === 'approved',
  ).length;

  const radius = 64;
  const circ = 2 * Math.PI * radius;
  const donutSegs = useMemo(() => {
    let offset = 0;
    return Object.entries(typeCounts)
      .filter(([, n]) => n > 0)
      .map(([type, n]) => {
        const dash = (n / total) * circ;
        const seg = { type, dash, offset, n };
        offset += dash;
        return seg;
      });
  }, [typeCounts, total, circ]);

  const sortedByFreq = useMemo(
    () => [...entities].sort((a, b) => b.frequency - a.frequency),
    [entities],
  );
  const freqMax = sortedByFreq[0]?.frequency ?? 1;

  const POLARITY_ORDER = ['positive', 'mixed', 'neutral', 'negative'] as const;

  return (
    <div className="sym-dash">
      {/* ── Stat strip ─────────────────────────────────────────── */}
      <div className="sym-dash-strip">
        {[
          { n: total, label: t('symbol.dashboard.totalSymbols') },
          { n: totalOccurrences, label: t('symbol.dashboard.totalOccurrences') },
          {
            n: analyzedCount,
            suffix: `/${total}`,
            label: t('symbol.dashboard.analyzedCount'),
          },
          { n: approvedCount, label: t('symbol.dashboard.approvedCount') },
        ].map(({ n, suffix, label }) => (
          <div key={label} className="sym-dash-stat">
            <div className="sym-dash-stat-n">
              {n}
              {suffix && <span className="sym-dash-stat-n-of">{suffix}</span>}
            </div>
            <div className="sym-dash-stat-l">{label}</div>
          </div>
        ))}
      </div>

      <div className="sym-dash-grid">
        {/* ── Type donut ───────────────────────────────────────── */}
        <section className="sym-dash-card">
          <div className="sym-dash-card-head">
            <span className="sym-dash-card-title">{t('symbol.dashboard.typeDistTitle')}</span>
            <span className="sym-dash-card-meta">
              {t('symbol.dashboard.typeCount', { count: Object.keys(typeCounts).length })}
            </span>
          </div>
          <div className="sym-dash-donut-wrap">
            <svg width="160" height="160" viewBox="0 0 160 160" aria-hidden="true">
              <circle
                cx="80" cy="80" r={radius}
                fill="none" stroke="var(--bg-tertiary)" strokeWidth="14"
              />
              {donutSegs.map((seg) => (
                <circle
                  key={seg.type}
                  cx="80" cy="80" r={radius}
                  fill="none"
                  stroke={TYPE_DOT[seg.type] ?? 'var(--symbol-other-dot)'}
                  strokeWidth="14"
                  strokeDasharray={`${seg.dash} ${circ - seg.dash}`}
                  strokeDashoffset={-seg.offset}
                  transform="rotate(-90 80 80)"
                />
              ))}
              <text
                x="80" y="78" textAnchor="middle"
                fontSize="24" fontWeight="700"
                fontFamily="var(--font-serif)" fill="var(--fg-primary)"
              >
                {total}
              </text>
              <text
                x="80" y="96" textAnchor="middle"
                fontSize="10" fill="var(--fg-muted)"
                fontFamily="var(--font-sans)"
              >
                {t('symbol.dashboard.donutLabel')}
              </text>
            </svg>
            <div className="sym-dash-donut-legend">
              {[...donutSegs].sort((a, b) => b.n - a.n).map((seg) => (
                <div key={seg.type} className="sym-dash-legend-row">
                  <span
                    className="sym-dash-legend-dot"
                    style={{ background: TYPE_DOT[seg.type] }}
                  />
                  <span className="sym-dash-legend-l">{t(`symbol.types.${seg.type}`)}</span>
                  <span className="sym-dash-legend-n">{seg.n}</span>
                </div>
              ))}
            </div>
          </div>
        </section>

        {/* ── Polarity stacked bar ─────────────────────────────── */}
        <section className="sym-dash-card">
          <div className="sym-dash-card-head">
            <span className="sym-dash-card-title">{t('symbol.dashboard.polarityDistTitle')}</span>
            <span className="sym-dash-card-meta">
              {t('symbol.dashboard.polarityMeta', { analyzed: analyzedCount, total })}
            </span>
          </div>
          <div className="sym-dash-polbar">
            {POLARITY_ORDER.map((k) => {
              if (!polCounts[k]) return null;
              const pct = (polCounts[k] / total) * 100;
              return (
                <div
                  key={k}
                  className="sym-dash-polseg"
                  style={{ width: `${pct}%`, background: POLARITY_DOT[k], color: 'var(--bg-primary)' }}
                  title={`${t(`symbol.polarity.${k}`)}: ${polCounts[k]}`}
                >
                  {pct >= 12 && <span>{t(`symbol.polarity.${k}`)} · {polCounts[k]}</span>}
                </div>
              );
            })}
            {polCounts.unanalyzed > 0 && (
              <div
                className="sym-dash-polseg"
                style={{
                  width: `${(polCounts.unanalyzed / total) * 100}%`,
                  background: 'var(--bg-tertiary)',
                  color: 'var(--fg-muted)',
                }}
                title={`${t('symbol.dashboard.polarityUnanalyzed')}: ${polCounts.unanalyzed}`}
              >
                {(polCounts.unanalyzed / total) * 100 >= 12 && (
                  <span>{t('symbol.dashboard.polarityUnanalyzed')} · {polCounts.unanalyzed}</span>
                )}
              </div>
            )}
          </div>
          <div className="sym-dash-pollegend">
            {POLARITY_ORDER.map((k) =>
              polCounts[k] > 0 ? (
                <span key={k} className="sym-dash-pollegend-item">
                  <span className="sym-dash-legend-dot" style={{ background: POLARITY_DOT[k] }} />
                  {t(`symbol.polarity.${k}`)} <b>{polCounts[k]}</b>
                </span>
              ) : null,
            )}
          </div>
        </section>

        {/* ── Frequency long-tail ──────────────────────────────── */}
        <section className="sym-dash-card sym-dash-card-wide">
          <div className="sym-dash-card-head">
            <span className="sym-dash-card-title">{t('symbol.dashboard.freqTitle')}</span>
            <span className="sym-dash-card-meta">
              {t('symbol.dashboard.freqMeta', { count: entities.length })}
            </span>
          </div>
          <div className="sym-dash-freqlist">
            {sortedByFreq.map((e) => {
              const w = (e.frequency / freqMax) * 100;
              const interp = interpretations[e.id];
              return (
                <div key={e.id} className="sym-dash-freq-row">
                  <div className="sym-dash-freq-label">
                    <span
                      className="sym-dash-freq-dot"
                      style={{ background: TYPE_DOT[e.imagery_type] }}
                    />
                    <span className="sym-dash-freq-term">{e.term}</span>
                    {interp && (
                      <span
                        className="sym-dash-freq-pol"
                        style={{ background: POLARITY_DOT[interp.polarity] }}
                      />
                    )}
                  </div>
                  <div className="sym-dash-freq-barwrap">
                    <div
                      className="sym-dash-freq-bar"
                      style={{ width: `${w}%`, background: TYPE_DOT[e.imagery_type] }}
                    />
                  </div>
                  <div className="sym-dash-freq-n">{e.frequency}</div>
                </div>
              );
            })}
          </div>
        </section>

        {/* ── Chapter density heatmap ──────────────────────────── */}
        <section className="sym-dash-card sym-dash-card-wide">
          <div className="sym-dash-card-head">
            <span className="sym-dash-card-title">{t('symbol.dashboard.heatTitle')}</span>
            <span className="sym-dash-card-meta">
              {t('symbol.dashboard.heatMeta', { chapters: totalChapters })}
            </span>
          </div>
          <div className="sym-dash-heat">
            <div className="sym-dash-heat-axis">
              {Array.from({ length: totalChapters }, (_, i) => {
                const ch = i + 1;
                const isMajor = ch === 1 || ch % 5 === 0;
                return (
                  <span
                    key={i}
                    className={`sym-dash-heat-tick${isMajor ? ' is-major' : ''}`}
                  >
                    {isMajor ? ch : ''}
                  </span>
                );
              })}
            </div>
            {entities.map((e) => {
              const max = Math.max(...Object.values(e.chapter_distribution), 1);
              return (
                <div key={e.id} className="sym-dash-heat-row">
                  <div className="sym-dash-heat-name">{e.term}</div>
                  <div className="sym-dash-heat-cells">
                    {Array.from({ length: totalChapters }, (_, i) => {
                      const cnt = e.chapter_distribution[String(i + 1)] ?? 0;
                      return (
                        <div
                          key={i}
                          className="sym-dash-heat-cell"
                          style={{
                            background: densityToken(cnt, max),
                            opacity: cnt === 0 ? 0.45 : 1,
                          }}
                          title={`${t('symbol.chapterN', { n: i + 1 })}: ${cnt}`}
                        />
                      );
                    })}
                  </div>
                  <div className="sym-dash-heat-freq">{e.frequency}</div>
                </div>
              );
            })}
            <div className="sym-dash-heat-legend">
              <span>{t('symbol.dashboard.heatLegendLow')}</span>
              <div className="sym-dash-heat-cell" style={{ background: 'var(--symbol-density-low)', width: 14, flex: 'none' }} />
              <div className="sym-dash-heat-cell" style={{ background: 'var(--symbol-density-mid)', width: 14, flex: 'none' }} />
              <div className="sym-dash-heat-cell" style={{ background: 'var(--symbol-density-high)', width: 14, flex: 'none' }} />
              <span>{t('symbol.dashboard.heatLegendHigh')}</span>
            </div>
          </div>
        </section>
      </div>
    </div>
  );
}
