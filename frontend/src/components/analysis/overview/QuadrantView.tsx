import { useMemo, useState } from 'react';
import { useTranslation } from 'react-i18next';
import type { FactionAnalysisResponse } from '@/api/factions';
import { LoadingSpinner } from '@/components/ui/LoadingSpinner';
import {
  DIMMED_OPACITY,
  buildFactionLegend,
  factionToken,
  isDimmed,
  quadrantStatus,
  type FactionSelection,
  type RankedFaction,
} from '../characterModel';
import { FactionLegend } from './FactionLegend';
import { median, type OverviewCharacter } from './types';

interface QuadrantViewProps {
  /** Must already be merged with faction/metric data (see `applyFactionsAndMetrics`). */
  characters: OverviewCharacter[];
  factions: FactionAnalysisResponse | undefined;
  /** Factions ranked by size (see `rankFactions`); drives colours and the legend. */
  rankedFactions: RankedFaction[];
  /** #6e is still in flight — must not flash the "metrics unavailable" state. */
  metricsLoading: boolean;
  onSelect: (entityId: string) => void;
}

const VB_W = 1000;
const VB_H = 470;
// Minimum padding on each side even when every bubble is small.
const MIN_PAD = { left: 70, right: 40, top: 30, bottom: 44 };
const TOP_LABELED_COUNT = 8;
const MAX_DEGREE_FOR_RADIUS = 24;
// Normalized-x threshold past which an always-visible label flips to the
// bubble's left side instead of centering below it, so it can't run past
// the right edge of the plot (e.g. the highest-mentionCount character).
const RIGHT_EDGE_LABEL_THRESHOLD = 0.85;

export function QuadrantView({
  characters,
  factions,
  rankedFactions,
  metricsLoading,
  onSelect,
}: Readonly<QuadrantViewProps>) {
  const { t } = useTranslation('analysis');
  const [hoveredId, setHoveredId] = useState<string | null>(null);
  // 點圖例單獨亮出（新行為）：其餘泡泡降到 0.3，再點同一項取消。
  const [selection, setSelection] = useState<FactionSelection>(null);

  const plotted = useMemo(() => {
    const withMetrics = characters.filter((c) => c.pagerank !== undefined);
    if (withMetrics.length === 0) return [];

    const logMentions = withMetrics.map((c) => Math.log10(c.mentionCount + 1));
    const minLog = Math.min(...logMentions);
    const maxLog = Math.max(...logMentions);
    const pageranks = withMetrics.map((c) => c.pagerank ?? 0);
    const minP = Math.min(...pageranks);
    const maxP = Math.max(...pageranks);

    const top8 = new Set(
      [...withMetrics]
        .sort((a, b) => b.mentionCount - a.mentionCount)
        .slice(0, TOP_LABELED_COUNT)
        .map((c) => c.entityId),
    );

    return withMetrics.map((c) => {
      const x = (Math.log10(c.mentionCount + 1) - minLog) / (maxLog - minLog || 1);
      const y = ((c.pagerank ?? 0) - minP) / (maxP - minP || 1);
      const cappedDegree = Math.min(c.degree ?? 0, MAX_DEGREE_FOR_RADIUS);
      const r = 5 + cappedDegree * 1.5;
      return { c, x, y, r, alwaysLabel: top8.has(c.entityId) };
    });
  }, [characters]);

  // Padding is data-driven: it must fit the largest bubble on screen (plus
  // its analyzed-ring and a small gap) on every side, otherwise a bubble
  // sitting at a normalized 0 or 1 extreme gets clipped by the plot edge —
  // this is exactly what happened with 寇仲 (max mentionCount, so x = 1)
  // when padding was a small fixed constant.
  const pad = useMemo(() => {
    const maxR = plotted.length > 0 ? Math.max(...plotted.map((p) => p.r)) : 0;
    const ringAndGap = maxR + 10;
    return {
      left: Math.max(MIN_PAD.left, ringAndGap),
      right: Math.max(MIN_PAD.right, ringAndGap),
      top: Math.max(MIN_PAD.top, ringAndGap),
      bottom: Math.max(MIN_PAD.bottom, ringAndGap + 24), // + room for the below-bubble label line
    };
  }, [plotted]);

  const legend = useMemo(() => buildFactionLegend(rankedFactions), [rankedFactions]);

  const plotW = VB_W - pad.left - pad.right;
  const plotH = VB_H - pad.top - pad.bottom;
  const cx = (xFrac: number) => pad.left + xFrac * plotW;
  const cy = (yFrac: number) => pad.top + (1 - yFrac) * plotH;

  const unaffiliatedCount = factions?.unaffiliatedNames?.length ?? factions?.unaffiliatedEntityIds?.length ?? 0;
  const status = quadrantStatus(metricsLoading, plotted.length);

  const legendEl = (
    <FactionLegend
      legend={legend}
      hasFactions={rankedFactions.length > 0}
      unaffiliatedCount={unaffiliatedCount}
      selection={selection}
      onSelectionChange={setSelection}
    />
  );

  if (status !== 'ready') {
    return (
      <div className="ca-ov-quadrant">
        <div className="ca-ov-quadrant-row">
          <div className="ca-ov-quadrant-main">
            {status === 'loading' ? (
              <div className="ca-ov-plot ca-ov-plot-state">
                <LoadingSpinner />
              </div>
            ) : (
              <div className="ca-ov-error">
                <p>{t('character.overview.quadrant.metricsError')}</p>
              </div>
            )}
          </div>
          {legendEl}
        </div>
      </div>
    );
  }

  const medX = median(plotted.map((p) => p.x));
  const medY = median(plotted.map((p) => p.y));

  const ordered = hoveredId
    ? [...plotted.filter((p) => p.c.entityId !== hoveredId), ...plotted.filter((p) => p.c.entityId === hoveredId)]
    : plotted;

  return (
    <div className="ca-ov-quadrant">
      <div className="ca-ov-quadrant-row">
        <div className="ca-ov-quadrant-main">
          <div className="ca-ov-plot">
            <svg viewBox={`0 0 ${VB_W} ${VB_H}`} width="100%" height={470} role="img" aria-label={t('character.overview.quadrant.ariaLabel')}>
              {/* median cross-hairs */}
              <line
                x1={cx(medX)} x2={cx(medX)}
                y1={pad.top} y2={VB_H - pad.bottom}
                className="ca-ov-median-line"
              />
              <line
                x1={pad.left} x2={VB_W - pad.right}
                y1={cy(medY)} y2={cy(medY)}
                className="ca-ov-median-line"
              />
              <text
                x={VB_W - pad.right - 4} y={cy(medY) - 6}
                textAnchor="end"
                className="ca-ov-median-label"
              >
                {t('character.overview.quadrant.median')}
              </text>

              {/* axis labels */}
              <text
                x={16} y={pad.top + plotH / 2}
                transform={`rotate(-90 16 ${pad.top + plotH / 2})`}
                className="ca-ov-axis-label"
                textAnchor="middle"
              >
                {t('character.overview.quadrant.yAxis')}
              </text>
              <text
                x={VB_W - pad.right} y={VB_H - 12}
                textAnchor="end"
                className="ca-ov-axis-label"
              >
                {t('character.overview.quadrant.xAxis')}
              </text>
              <text x={VB_W - pad.right - 6} y={pad.top + 18} textAnchor="end" className="ca-ov-corner-label">
                {t('character.overview.quadrant.cornerLead')}
              </text>
              <text x={pad.left + 6} y={VB_H - pad.bottom - 10} textAnchor="start" className="ca-ov-corner-label">
                {t('character.overview.quadrant.cornerTail')}
              </text>

              {/* bubbles. The native SVG <title> is gone on purpose: the DS
                  Tooltip is an HTML portal anchored on a DOM element and cannot
                  wrap an SVG <g>, and hovering a bubble already writes its name
                  and counts onto the plot (below), so the title only duplicated
                  it. The accessible name moved to aria-label. */}
              {ordered.map(({ c, x, y, r, alwaysLabel }) => {
                const token = factionToken(c.factionIndex, rankedFactions);
                const dimmed = isDimmed(selection, c.factionIndex, rankedFactions);
                const hovered = hoveredId === c.entityId;
                const showLabel = alwaysLabel || hovered;
                const bx = cx(x);
                const by = cy(y);
                const nearRightEdge = x > RIGHT_EDGE_LABEL_THRESHOLD;
                const color = token ? `var(--${token})` : undefined;
                const detail = hovered && (
                  <tspan className="ca-ov-bubble-detail">
                    {' '}
                    {t('character.overview.quadrant.bubbleDetail', {
                      mentions: c.mentionCount,
                      degree: c.degree ?? 0,
                    })}
                  </tspan>
                );
                return (
                  <g
                    key={c.entityId}
                    role="button"
                    tabIndex={0}
                    aria-label={c.name}
                    className="ca-ov-bubble"
                    style={{ opacity: dimmed ? DIMMED_OPACITY : 1 }}
                    onMouseEnter={() => setHoveredId(c.entityId)}
                    onMouseLeave={() => setHoveredId((id) => (id === c.entityId ? null : id))}
                    onClick={() => onSelect(c.entityId)}
                    onKeyDown={(e) => {
                      if (e.key === 'Enter' || e.key === ' ') {
                        e.preventDefault();
                        onSelect(c.entityId);
                      }
                    }}
                  >
                    {c.analyzed && (
                      <circle cx={bx} cy={by} r={r + 3.5} fill="none" stroke="var(--accent)" strokeWidth={1} strokeOpacity={0.85} />
                    )}
                    <circle
                      cx={bx} cy={by} r={r}
                      fill={color ?? 'transparent'}
                      fillOpacity={color ? 0.7 : 0}
                      stroke={color ?? 'var(--fg-muted)'}
                      strokeWidth={color ? 1.5 : 1}
                      opacity={color ? 1 : 0.62}
                      pointerEvents="all"
                    />
                    {showLabel && (nearRightEdge ? (
                      <text x={bx - r - 8} y={by + 4} textAnchor="end" className="ca-ov-bubble-label">
                        {c.name}
                        {detail}
                      </text>
                    ) : (
                      <text x={bx} y={by + r + 13} textAnchor="middle" className="ca-ov-bubble-label">
                        {c.name}
                        {detail}
                      </text>
                    ))}
                  </g>
                );
              })}
            </svg>
          </div>
          <span className="ca-ov-caption">{t('character.overview.quadrantCaption')}</span>
          <p className="ca-ov-footnote">{t('character.overview.quadrant.footnote', { count: unaffiliatedCount })}</p>
        </div>
        {legendEl}
      </div>
    </div>
  );
}
