import { useMemo } from 'react';
import { useTranslation } from 'react-i18next';

export interface TimelineMarker {
  id: string;
  chapter: number;
  category: 'known' | 'unknown' | 'misbelief';
  title: string;
}

interface Props {
  chapter: number;
  totalChapters: number;
  markers: TimelineMarker[];
  onChange: (next: number) => void;
}

const TICK_COUNT = 5;

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

  return (
    <div className="ca-epi-timeline">
      <div className="ca-epi-axis">
        <div className="ca-epi-axis-track" />
        <div className="ca-epi-axis-progress" style={{ width: pctFor(chapter) }} />

        {markers.map((m) => (
          <div
            key={`${m.category}-${m.id}`}
            className={`ca-epi-marker ${m.category}`}
            style={{ left: pctFor(m.chapter) }}
            title={`Ch.${m.chapter} · ${m.title}`}
          />
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
