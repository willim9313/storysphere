import { useState } from 'react';
import { useTranslation } from 'react-i18next';
import { densityToken } from './tokens';

interface ChapterDistChartProps {
  distribution: Record<string, number>;
  peakChapters?: number[];
  totalChapters?: number;
  barW?: number;
  gap?: number;
  maxH?: number;
}

export function ChapterDistChart({
  distribution,
  peakChapters = [],
  totalChapters = 20,
  barW = 22,
  gap = 6,
  maxH = 64,
}: Readonly<ChapterDistChartProps>) {
  const { t } = useTranslation('analysis');
  const entries = Array.from({ length: totalChapters }, (_, i) => {
    const ch = i + 1;
    return { ch, cnt: distribution[String(ch)] ?? 0 };
  });
  const maxCnt = Math.max(...entries.map((e) => e.cnt), 1);
  const [hovered, setHovered] = useState<number | null>(null);

  const labelH = 14;
  const peakH = 10;
  const svgW = totalChapters * (barW + gap);
  const svgH = maxH + labelH + peakH;
  const peakSet = new Set(peakChapters);

  return (
    <div style={{ position: 'relative' }}>
      <svg width={svgW} height={svgH} style={{ display: 'block', overflow: 'visible' }}>
        {entries.map(({ ch, cnt }, i) => {
          const x = i * (barW + gap);
          const barH = cnt === 0 ? 0 : Math.max(3, (cnt / maxCnt) * maxH);
          const y = peakH + maxH - barH;
          const fill = cnt === 0 ? 'transparent' : densityToken(cnt, maxCnt);
          const isHover = hovered === ch;
          const isPeak = peakSet.has(ch);
          return (
            <g key={ch} onMouseEnter={() => setHovered(ch)} onMouseLeave={() => setHovered(null)}>
              <line
                x1={x}
                x2={x + barW}
                y1={peakH + maxH + 0.5}
                y2={peakH + maxH + 0.5}
                stroke="var(--border)"
                strokeWidth="var(--line-weight)"
              />
              {cnt > 0 && (
                <rect x={x} y={y} width={barW} height={barH} rx={2} fill={fill} opacity={isHover ? 1 : 0.92} />
              )}
              {isPeak && cnt > 0 && (
                <polygon
                  points={`${x + barW / 2 - 3},${y - 6} ${x + barW / 2 + 3},${y - 6} ${x + barW / 2},${y - 2}`}
                  fill="var(--symbol-density-peak)"
                />
              )}
              <text
                x={x + barW / 2}
                y={svgH - 2}
                textAnchor="middle"
                fontSize="9"
                fill={isHover || isPeak ? 'var(--fg-secondary)' : 'var(--fg-muted)'}
                style={{ fontFamily: 'var(--font-sans)', fontWeight: isPeak ? 600 : 400 }}
              >
                {ch}
              </text>
              <rect x={x} y={0} width={barW + gap} height={svgH} fill="transparent" />
            </g>
          );
        })}
      </svg>
      {hovered != null && (distribution[String(hovered)] ?? 0) > 0 && (
        <div
          style={{
            position: 'absolute',
            top: 0,
            left: Math.min(Math.max((hovered - 1) * (barW + gap) - 20, 0), svgW - 120),
            background: 'var(--fg-primary)',
            color: 'var(--bg-primary)',
            padding: '4px 8px',
            borderRadius: 'var(--radius-sm)',
            fontFamily: 'var(--font-sans)',
            fontSize: 'var(--font-size-2xs)',
            fontWeight: 500,
            pointerEvents: 'none',
            whiteSpace: 'nowrap',
            transform: 'translateY(-100%)',
          }}
        >
          {t('symbol.chapterN', { n: hovered })}
          {' · '}
          {t('symbol.chapterOccurrences', { count: distribution[String(hovered)] })}
          {peakSet.has(hovered) && <> · {t('symbol.densityPeak')}</>}
        </div>
      )}
    </div>
  );
}
