import { useMemo, useState } from 'react';
import { useTranslation } from 'react-i18next';
import type { CharacterAnalysisDetail } from '@/api/types';
import { Tooltip } from '@/components/ui/Tooltip';
import { assignArcRows, parseChapterRange } from '../characterModel';

interface Props {
  data: CharacterAnalysisDetail;
  /** Book's total chapter count (from `useBook`), used to build the dynamic
   * Ch.1–N axis — must not be hardcoded per-arc-segment count. */
  chapterCount: number;
}

// Phase colour band: rotates through these three tokens by segment index —
// purely a colour palette (not a narrative-mode assignment). The legend says so
// ("色帶為輪替色盤，不代表敘事模式"); re-colouring it with the categorical
// palette was decided and deferred.
const PHASE_COLORS = [
  '--narrative-present-border',
  '--narrative-flashback-border',
  '--narrative-flashforward-border',
];

function pickChapter(rec: Record<string, unknown>): number | undefined {
  const v = rec['chapter'];
  return typeof v === 'number' ? v : undefined;
}

export function ArcPane({ data, chapterCount }: Readonly<Props>) {
  const { t } = useTranslation('analysis');
  const arc = useMemo(() => data.arc ?? [], [data.arc]);
  const keyEvents = useMemo(() => data.cep?.keyEvents ?? [], [data.cep?.keyEvents]);
  const [activeArc, setActiveArc] = useState<number | null>(null);

  const CH = Math.max(chapterCount, 1);
  // Axis cells: chapter n occupies [(n-1)/CH, n/CH]. A band spanning a–b covers
  // cells a…b, a marker sits at its cell's centre.
  const cellLeft = (ch: number) => `${((Math.min(Math.max(ch, 1), CH) - 1) / CH) * 100}%`;
  const cellCentre = (ch: number) => `${((Math.min(Math.max(ch, 1), CH) - 0.5) / CH) * 100}%`;

  const ranges = useMemo(() => arc.map((p) => parseChapterRange(p.chapterRange)), [arc]);
  // 相鄰階段共享邊界章時才錯行；沒有重疊的階段留在同一行。
  const rows = useMemo(() => assignArcRows(ranges), [ranges]);
  const rowCount = rows.length > 0 ? Math.max(...rows) + 1 : 0;

  // Several key events can sit in one chapter: one dot, names joined in its tooltip.
  const markers = useMemo(() => {
    const byChapter = new Map<number, string[]>();
    for (const e of keyEvents) {
      const rec = e as Record<string, unknown>;
      const chapter = pickChapter(rec);
      if (chapter == null) continue;
      const name = typeof rec['event'] === 'string' ? (rec['event'] as string) : '';
      byChapter.set(chapter, [...(byChapter.get(chapter) ?? []), name].filter(Boolean));
    }
    return [...byChapter.entries()].map(([chapter, names]) => ({ chapter, label: names.join('、') }));
  }, [keyEvents]);

  return (
    <section className="ca-section">
      <header className="ca-section-head">
        <div>
          <h3 className="ca-section-title">{t('character.sections.arc')}</h3>
          <div className="ca-section-sub">{t('character.arcPane.stagesCount', { count: arc.length })}</div>
        </div>
      </header>
      <div className="ca-section-body">
        {arc.length === 0 ? (
          <p>{t('character.noData')}</p>
        ) : (
          <>
            <div className="ca-arc-axis">
              {Array.from({ length: CH }, (_, i) => (
                <div key={i} className="ca-arc-cell">
                  {i + 1}
                </div>
              ))}
            </div>

            <div className="ca-arc-bands" style={{ height: `calc(${rowCount} * var(--ca-arc-band-h) + ${Math.max(rowCount - 1, 0)} * var(--space-2))` }}>
              {arc.map((p, i) => {
                const range = ranges[i];
                if (!range) return null;
                const [from, to] = range;
                return (
                  <div
                    key={`${p.chapterRange}-${p.phase}`}
                    className="ca-arc-band-pos"
                    style={{
                      left: cellLeft(from),
                      width: `${((Math.min(to, CH) - Math.max(from, 1) + 1) / CH) * 100}%`,
                      top: `calc(${rows[i]} * (var(--ca-arc-band-h) + var(--space-2)))`,
                    }}
                  >
                    <Tooltip label={`Ch.${p.chapterRange} · ${p.phase}`}>
                      <button
                        type="button"
                        className={'ca-arc-band' + (activeArc === i ? ' active' : '')}
                        style={{ background: `var(${PHASE_COLORS[i % PHASE_COLORS.length]})` }}
                        onClick={() => setActiveArc(i)}
                      >
                        <span className="ca-arc-band-label">{p.phase}</span>
                      </button>
                    </Tooltip>
                  </div>
                );
              })}
            </div>

            <div className="ca-arc-dots">
              {markers.map((m) => (
                <div key={m.chapter} className="ca-arc-dotpos" style={{ left: cellCentre(m.chapter) }}>
                  <Tooltip label={m.label ? `Ch.${m.chapter} · ${m.label}` : `Ch.${m.chapter}`}>
                    <span className="ca-arc-marker" tabIndex={0} />
                  </Tooltip>
                </div>
              ))}
            </div>

            <div className="ca-arc-legend">
              <span>{t('character.arcPane.overlapStackingNote')}</span>
              <span>{t('character.arcPane.paletteNote')}</span>
              <span className="ca-arc-legend-item">
                <span className="ca-arc-legend-dot" />
                {t('character.arcPane.keyEventMarkerLegend')}
              </span>
            </div>

            <div className="ca-arc-cards">
              {arc.map((p, i) => (
                <button
                  key={`${p.chapterRange}-${p.phase}`}
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
