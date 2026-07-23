import { useMemo } from 'react';
import { useTranslation } from 'react-i18next';
import type { NarrativeMode, OverviewEvent } from './eventTypes';

interface EventBackboneMapProps {
  events: OverviewEvent[];
  onSelectEvent: (id: string) => void;
}

type BandKey = 'KERNEL' | 'UNDETERMINED' | 'SATELLITE';

interface BandSpec {
  key: BandKey;
  /** Circle diameter in px. */
  node: number;
  /** Vertical pitch per stacked node, including its label and gap. */
  rowH: number;
  labelled: boolean;
  labelKey: string;
}

// Kernel on top, satellite at the bottom, and events whose importance is not
// yet judged on the middle line — they are not "small satellites", they are
// unmeasured (see eventTypes.importanceRank).
const BANDS: BandSpec[] = [
  { key: 'KERNEL', node: 34, rowH: 56, labelled: true, labelKey: 'event.overview.map.bandKernel' },
  {
    key: 'UNDETERMINED',
    node: 18,
    rowH: 24,
    labelled: false,
    labelKey: 'event.overview.map.bandUndetermined',
  },
  {
    key: 'SATELLITE',
    node: 22,
    rowH: 28,
    labelled: false,
    labelKey: 'event.overview.map.bandSatellite',
  },
];

const BAND_PAD = 14;
const LABEL_MAX = 6;

function bandOf(e: OverviewEvent): BandKey {
  if (e.importance === 'KERNEL') return 'KERNEL';
  if (e.importance === 'SATELLITE') return 'SATELLITE';
  return 'UNDETERMINED';
}

interface PositionedNode {
  event: OverviewEvent;
  x: number;
  y: number;
  size: number;
  labelled: boolean;
}

export function EventBackboneMap({ events, onSelectEvent }: Readonly<EventBackboneMapProps>) {
  const { t } = useTranslation('analysis');

  const { nodes, bandRows, chapters, height, undatedCount } = useMemo(() => {
    const placed = events.filter((e) => e.chapter !== null);
    const chapterList = [...new Set(placed.map((e) => e.chapter as number))].sort((a, b) => a - b);
    const chapterIndex = new Map(chapterList.map((c, i) => [c, i]));

    // Each band is only as tall as its densest chapter column, so nodes never
    // overlap however many events a chapter holds. A fixed-height canvas with
    // percentage offsets (as in the design mockup) breaks past ~4 per column.
    const rows: { spec: BandSpec; top: number; height: number }[] = [];
    let cursor = 0;
    for (const spec of BANDS) {
      const inBand = placed.filter((e) => bandOf(e) === spec.key);
      const densest = chapterList.reduce(
        (max, ch) => Math.max(max, inBand.filter((e) => e.chapter === ch).length),
        0,
      );
      const h = Math.max(1, densest) * spec.rowH + BAND_PAD * 2;
      rows.push({ spec, top: cursor, height: h });
      cursor += h;
    }

    const out: PositionedNode[] = [];
    for (const row of rows) {
      const inBand = placed.filter((e) => bandOf(e) === row.spec.key);
      for (const ch of chapterList) {
        const column = inBand.filter((e) => e.chapter === ch);
        column.forEach((event, i) => {
          const idx = chapterIndex.get(ch) ?? 0;
          out.push({
            event,
            x: chapterList.length === 1 ? 50 : 7 + (idx / (chapterList.length - 1)) * 86,
            y: row.top + BAND_PAD + i * row.spec.rowH + row.spec.node / 2,
            size: row.spec.node,
            labelled: row.spec.labelled,
          });
        });
      }
    }

    return {
      nodes: out,
      bandRows: rows,
      chapters: chapterList,
      height: cursor,
      undatedCount: events.length - placed.length,
    };
  }, [events]);

  const usedModes = useMemo(() => {
    const modes = new Set<NarrativeMode>(
      events.filter((e) => e.analyzed).map((e) => e.narrativeMode),
    );
    return [...modes].sort();
  }, [events]);

  return (
    <>
      <div className="ea-ov-caption">{t('event.overview.map.caption')}</div>

      <div className="ea-ov-map" style={{ height: `${height}px` }}>
        {bandRows.map((row) => (
          <div
            key={row.spec.key}
            className="ea-ov-map-band"
            style={{ top: `${row.top}px`, height: `${row.height}px` }}
          >
            <span className="ea-ov-map-band-label">{t(row.spec.labelKey)}</span>
          </div>
        ))}

        {nodes.map((n) => (
          <button
            key={n.event.id}
            type="button"
            className="ea-ov-map-node"
            style={{ left: `${n.x}%`, top: `${n.y}px` }}
            onClick={() => onSelectEvent(n.event.id)}
            title={`${n.event.title} · ${t('event.list.chapterShort', { n: n.event.chapter })}`}
          >
            <span
              className={'ea-ov-map-dot' + (n.event.analyzed ? '' : ' unanalyzed')}
              style={{
                width: `${n.size}px`,
                height: `${n.size}px`,
                ...(n.event.analyzed
                  ? {
                      background: `var(--narrative-${n.event.narrativeMode}-bg)`,
                      borderColor: `var(--narrative-${n.event.narrativeMode}-border)`,
                    }
                  : {}),
              }}
            />
            {n.labelled && (
              <span className="ea-ov-map-node-label">
                {n.event.title.length > LABEL_MAX
                  ? n.event.title.slice(0, LABEL_MAX) + '…'
                  : n.event.title}
              </span>
            )}
          </button>
        ))}
      </div>

      <div className="ea-ov-map-axis">
        {chapters.map((c, i) => (
          <span
            key={c}
            className="ea-ov-map-axis-tick"
            style={{
              left: `${chapters.length === 1 ? 50 : 7 + (i / (chapters.length - 1)) * 86}%`,
            }}
          >
            {t('event.list.chapterShort', { n: c })}
          </span>
        ))}
      </div>

      <div className="ea-ov-map-legend">
        <span className="ea-ov-map-legend-head">{t('event.overview.map.legendNarrative')}</span>
        {usedModes.map((m) => (
          <span key={m} className="ea-ov-map-legend-item">
            <span
              className="ea-ov-map-legend-swatch"
              style={{
                background: `var(--narrative-${m}-bg)`,
                borderColor: `var(--narrative-${m}-border)`,
              }}
            />
            {t(`event.narrative.${m}`)}
          </span>
        ))}
        <span className="ea-ov-map-legend-sep" />
        <span className="ea-ov-map-legend-note">{t('event.overview.map.legendKernel')}</span>
        <span className="ea-ov-map-legend-note">{t('event.overview.map.legendUnanalyzed')}</span>
        <span className="ea-ov-map-legend-note">{t('event.overview.map.legendAxis')}</span>
      </div>

      {undatedCount > 0 && (
        <div className="ea-ov-map-footnote">
          {t('event.overview.map.undated', { count: undatedCount })}
        </div>
      )}
    </>
  );
}
