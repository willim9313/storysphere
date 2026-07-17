import { useState } from 'react';
import { useTranslation } from 'react-i18next';
import type { CharacterAnalysisDetail } from '@/api/types';

interface Props {
  data: CharacterAnalysisDetail;
  /** Book's total chapter count (from `useBook`), used to build the dynamic
   * Ch.1–N axis — must not be hardcoded per-arc-segment count. */
  chapterCount: number;
}

// Phase color band: rotates through these three tokens by segment index —
// purely a color palette (not a narrative-mode assignment), per
// docs/handoff/20260716-character-page/design-return/DESIGN_README.md.
const PHASE_COLORS = [
  '--narrative-present-border',
  '--narrative-flashback-border',
  '--narrative-flashforward-border',
];

function parseRange(range: string): [number, number] | null {
  const parts = range.split('-').map((s) => Number(s.trim()));
  if (parts.length !== 2 || parts.some((n) => !Number.isFinite(n))) return null;
  return [parts[0], parts[1]];
}

function pickChapter(rec: Record<string, unknown>): number | undefined {
  const v = rec['chapter'];
  return typeof v === 'number' ? v : undefined;
}

export function ArcPane({ data, chapterCount }: Props) {
  const { t } = useTranslation('analysis');
  const arc = data.arc ?? [];
  const keyEvents = data.cep?.keyEvents ?? [];
  const [activeArc, setActiveArc] = useState<number | null>(null);

  const CH = Math.max(chapterCount, 1);
  const pct = (ch: number) => {
    const clamped = Math.min(Math.max(ch, 1), CH);
    return CH > 1 ? ((clamped - 1) / (CH - 1)) * 100 : 0;
  };

  const markers = keyEvents
    .map((e) => {
      const rec = e as Record<string, unknown>;
      const chapter = pickChapter(rec);
      const name = typeof rec['event'] === 'string' ? (rec['event'] as string) : '';
      return chapter != null ? { chapter, name } : null;
    })
    .filter((m): m is { chapter: number; name: string } => m !== null);

  return (
    <section className="ca-section">
      <header className="ca-section-head">
        <div>
          <h3 className="ca-section-title">{t('character.sections.arc')}</h3>
          <div className="ca-section-sub" style={{ marginTop: 2 }}>
            {t('character.arcPane.stagesCount', { count: arc.length })}
          </div>
        </div>
      </header>
      <div className="ca-section-body">
        {arc.length === 0 ? (
          <p>{t('character.noData')}</p>
        ) : (
          <>
            <div className="ca-arc-axis">
              <div className="ca-arc-axis-line" />
              {Array.from({ length: CH }, (_, i) => (
                <div key={i} className="ca-arc-tick" style={{ left: `${pct(i + 1)}%` }}>
                  <div className="ca-arc-tick-mark" />
                  <div className="ca-arc-tick-label">{`Ch.${i + 1}`}</div>
                </div>
              ))}
              {arc.map((p, i) => {
                const range = parseRange(p.chapterRange);
                if (!range) return null;
                const [from, to] = range;
                return (
                  <button
                    key={i}
                    type="button"
                    className={'ca-arc-band' + (activeArc === i ? ' active' : '')}
                    style={{
                      left: `${pct(from)}%`,
                      width: `${Math.max(pct(to) - pct(from), 2)}%`,
                      top: 8 + i * 20,
                      background: `var(${PHASE_COLORS[i % PHASE_COLORS.length]})`,
                    }}
                    title={p.phase}
                    onClick={() => setActiveArc(i)}
                  >
                    <span className="ca-arc-band-label">{p.phase}</span>
                  </button>
                );
              })}
              {markers.map((m, i) => (
                <div
                  key={`k${i}`}
                  className="ca-arc-marker"
                  title={m.name}
                  style={{ left: `${pct(m.chapter)}%` }}
                />
              ))}
            </div>

            <div className="ca-arc-legend">
              <span className="ca-arc-legend-item">
                <span className="ca-arc-legend-dot" />
                {t('character.arcPane.keyEventMarkerLegend')}
              </span>
              <span>{t('character.arcPane.overlapStackingNote')}</span>
            </div>

            <div className="ca-arc-cards">
              {arc.map((p, i) => (
                <button
                  key={i}
                  type="button"
                  className={'ca-arc-card' + (activeArc === i ? ' active' : '')}
                  style={{ borderLeftColor: `var(${PHASE_COLORS[i % PHASE_COLORS.length]})` }}
                  onClick={() => setActiveArc(i)}
                >
                  <div className="ca-arc-card-head">
                    <span className="ca-arc-card-range">{`Ch.${p.chapterRange}`}</span>
                    <span className="ca-arc-card-phase">{p.phase}</span>
                  </div>
                  <p className="ca-arc-card-desc">{p.description}</p>
                </button>
              ))}
            </div>
          </>
        )}
      </div>
    </section>
  );
}
