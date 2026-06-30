import { densityToken } from './tokens';

export function DensityStrip({
  distribution,
  totalChapters = 20,
  height = 6,
}: {
  distribution: Record<string, number>;
  totalChapters?: number;
  height?: number;
}) {
  const entries = Array.from({ length: totalChapters }, (_, i) => distribution[String(i + 1)] ?? 0);
  const max = Math.max(...entries, 1);
  return (
    <div style={{ display: 'flex', gap: 1, height }}>
      {entries.map((cnt, i) => (
        <div
          key={i}
          style={{
            flex: 1,
            height: '100%',
            background: cnt === 0 ? 'var(--bg-tertiary)' : densityToken(cnt, max),
            opacity: cnt === 0 ? 0.5 : 1,
          }}
        />
      ))}
    </div>
  );
}
