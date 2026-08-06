import { densityToken } from './tokens';
import { BODY_CHAPTER_MIN } from './chapterAxis';

export function DensityStrip({
  distribution,
  totalChapters = 20,
  height = 6,
  max,
}: {
  distribution: Record<string, number>;
  totalChapters?: number;
  height?: number;
  /**
   * Shading denominator. Pass the cross-symbol maximum (`globalChapterMax`) so
   * strips stacked in a list stay comparable; normalising each strip against its
   * own peak made every single-occurrence symbol render at full strength.
   */
  max?: number;
}) {
  const chapterCount = Math.max(totalChapters - BODY_CHAPTER_MIN + 1, 0);
  const entries = Array.from(
    { length: chapterCount },
    (_, i) => distribution[String(i + BODY_CHAPTER_MIN)] ?? 0,
  );
  const scale = max && max > 0 ? max : Math.max(...entries, 1);
  return (
    <div style={{ display: 'flex', gap: 1, height }}>
      {entries.map((cnt, i) => (
        <div
          key={i}
          style={{
            flex: 1,
            height: '100%',
            background: cnt === 0 ? 'var(--bg-tertiary)' : densityToken(cnt, scale),
            opacity: cnt === 0 ? 0.5 : 1,
          }}
        />
      ))}
    </div>
  );
}
