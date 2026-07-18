import { useMemo } from 'react';
import { useTranslation } from 'react-i18next';

export interface TimelineMarker {
  id: string;
  chapter: number;
  category: 'known' | 'unknown';
  title: string;
}

interface Props {
  chapter: number;
  totalChapters: number;
  markers: TimelineMarker[];
  onChange: (next: number) => void;
}

const TICK_COUNT = 5;

/** Dual-track chapter cursor (#7/#10 shared axis): known-event pills render on
 * the upper track, unknown-event pills on the lower track. Same-chapter
 * events aggregate into a single numbered pill (hover title lists the event
 * names) rather than stacking overlapping dots — see the plan's #4 finding
 * that raw per-event markers pile up unreadably on busy chapters.
 * Dragging is handled by the native `<input type="range">` overlay (kept for
 * keyboard/a11y support) rather than manual pointer-event capture, which is
 * the one deliberate deviation from the canvas's raw pointermove listener. */
export function ChapterTimeline({ chapter, totalChapters, markers, onChange }: Props) {
  const { t } = useTranslation('analysis');

  const ticks = useMemo(() => {
    if (totalChapters <= 1) return [1];
    return Array.from({ length: TICK_COUNT }, (_, i) =>
      Math.round(1 + (i * (totalChapters - 1)) / (TICK_COUNT - 1)),
    );
  }, [totalChapters]);

  const pctFor = (ch: number) =>
    totalChapters > 1 ? `${((ch - 1) / (totalChapters - 1)) * 100}%` : '0%';

  const pills = useMemo(() => {
    const byCategory = { known: new Map<number, string[]>(), unknown: new Map<number, string[]>() };
    markers.forEach((m) => {
      const bucket = byCategory[m.category];
      const titles = bucket.get(m.chapter) ?? [];
      if (m.title) titles.push(m.title);
      bucket.set(m.chapter, titles);
    });
    const toPills = (category: 'known' | 'unknown') =>
      Array.from(byCategory[category].entries()).map(([ch, titles]) => ({
        chapter: ch,
        count: titles.length,
        title: `Ch.${ch} · ${titles.join('、')}`,
      }));
    return { known: toPills('known'), unknown: toPills('unknown') };
  }, [markers]);

  return (
    <div className="ca-epi-timeline">
      <div className="ca-epi-axis">
        <div className="ca-epi-axis-track" />
        <div className="ca-epi-axis-progress" style={{ width: pctFor(chapter) }} />

        {pills.known.map((p) => (
          <div
            key={`known-${p.chapter}`}
            className="ca-epi-pill known"
            style={{ left: pctFor(p.chapter) }}
            title={p.title}
          >
            {p.count}
          </div>
        ))}
        {pills.unknown.map((p) => (
          <div
            key={`unknown-${p.chapter}`}
            className="ca-epi-pill unknown"
            style={{ left: pctFor(p.chapter) }}
            title={p.title}
          >
            {p.count}
          </div>
        ))}

        <div className="ca-epi-cursor" style={{ left: pctFor(chapter) }}>
          <span className="ca-epi-cursor-label">
            {t('character.epistemic.chapterN', { n: chapter })}
          </span>
        </div>

        <input
          type="range"
          min={1}
          max={Math.max(1, totalChapters)}
          value={chapter}
          onChange={(e) => onChange(Number(e.target.value))}
          aria-label={t('character.epistemic.upToChapter')}
        />
      </div>
      <div className="ca-epi-ticks">
        {ticks.map((tk) => (
          <span
            key={tk}
            className="ca-epi-tick"
            style={{ left: pctFor(tk) }}
          >
            Ch.{tk}
          </span>
        ))}
      </div>
    </div>
  );
}
