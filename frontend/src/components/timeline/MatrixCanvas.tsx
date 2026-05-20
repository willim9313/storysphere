import { useRef, useEffect, useState, useCallback, useMemo } from 'react';
import * as d3 from 'd3';
import { useTranslation } from 'react-i18next';
import { useTheme } from '@/contexts/ThemeContext';
import type { TimelineEvent, NarrativeMode } from '@/api/types';

/* ── Constants ──────────────────────────────────────────────── */

const MARGIN = { top: 64, right: 32, bottom: 56, left: 72 };
const DEGRADED_Y = -0.1;

function modeColor(mode: NarrativeMode): string {
  const v = (name: string) =>
    getComputedStyle(document.documentElement).getPropertyValue(name).trim();
  switch (mode) {
    case 'present':      return v('--narrative-present-border')      || '#8b5e3c';
    case 'flashback':    return v('--narrative-flashback-border')    || '#3b82f6';
    case 'flashforward': return v('--narrative-flashforward-border') || '#f59e0b';
    case 'parallel':     return v('--narrative-parallel-border')     || '#8b5cf6';
    default:             return v('--narrative-unknown-border')      || '#8a7a68';
  }
}

const IMPORTANCE_RADIUS: Record<string, number> = {
  KERNEL: 8,
  SATELLITE: 5,
};
const DEFAULT_RADIUS = 6;

function dotRadius(event: TimelineEvent): number {
  return IMPORTANCE_RADIUS[event.eventImportance ?? ''] ?? DEFAULT_RADIUS;
}

/* ── Props ──────────────────────────────────────────────────── */

export interface MatrixCanvasProps {
  events: TimelineEvent[];
  passesFilter: Map<string, boolean>;
  selectedEventId: string | null;
  onSelectEvent: (id: string | null) => void;
  /** Called with array of selected event IDs after brush selection */
  onBrushSelect?: (ids: string[]) => void;
}

/* ── Component ──────────────────────────────────────────────── */

export function MatrixCanvas({
  events,
  passesFilter,
  selectedEventId,
  onSelectEvent,
  onBrushSelect,
}: MatrixCanvasProps) {
  const { t } = useTranslation('analysis');
  const { theme } = useTheme();
  const containerRef = useRef<HTMLDivElement>(null);
  const svgRef = useRef<SVGSVGElement>(null);
  const tooltipRef = useRef<HTMLDivElement>(null);
  const [size, setSize] = useState({ width: 800, height: 600 });
  const [brushedIds, setBrushedIds] = useState<Set<string>>(new Set());

  useEffect(() => {
    const el = containerRef.current;
    if (!el) return;
    const ro = new ResizeObserver((entries) => {
      const { width, height } = entries[0].contentRect;
      if (width > 0 && height > 0) setSize({ width, height });
    });
    ro.observe(el);
    return () => ro.disconnect();
  }, []);

  const chapters = useMemo(() => {
    const set = new Set<number>();
    for (const e of events) set.add(e.chapter);
    return [...set].sort((a, b) => a - b);
  }, [events]);

  const chapterIndex = useMemo(() => {
    const map = new Map<number, number>();
    chapters.forEach((ch, i) => map.set(ch, i));
    return map;
  }, [chapters]);

  // Per-chapter event counts (for marginal histogram)
  const histogram = useMemo(() => {
    const counts = new Map<number, number>();
    for (const e of events) {
      counts.set(e.chapter, (counts.get(e.chapter) ?? 0) + 1);
    }
    return chapters.map((ch) => counts.get(ch) ?? 0);
  }, [events, chapters]);

  const maxHistogram = useMemo(
    () => Math.max(1, ...histogram),
    [histogram],
  );

  const xScale = useMemo(() => {
    return d3
      .scaleLinear()
      .domain([0, Math.max(1, chapters.length - 1)])
      .range([MARGIN.left, size.width - MARGIN.right]);
  }, [chapters.length, size.width]);

  const yScale = useMemo(() => {
    return d3
      .scaleLinear()
      .domain([DEGRADED_Y - 0.05, 1.05])
      .range([size.height - MARGIN.bottom, MARGIN.top]);
  }, [size.height]);

  const pos = useCallback(
    (evt: TimelineEvent) => {
      const xi = chapterIndex.get(evt.chapter) ?? 0;
      const yi = evt.chronologicalRank ?? DEGRADED_Y;
      return { x: xScale(xi), y: yScale(yi) };
    },
    [chapterIndex, xScale, yScale],
  );

  useEffect(() => {
    const svg = d3.select(svgRef.current);
    svg.selectAll('*').remove();

    const { width, height } = size;
    if (width === 0 || height === 0) return;

    const g = svg.append('g');

    /* ── Marginal histogram (top) ────────────────────── */
    const histTop = 12;
    const histBottom = MARGIN.top - 8;
    const histHeight = histBottom - histTop;
    const colWidth = chapters.length > 0
      ? (size.width - MARGIN.left - MARGIN.right) / chapters.length
      : 0;

    // Baseline
    g.append('line')
      .attr('x1', MARGIN.left)
      .attr('y1', histBottom)
      .attr('x2', width - MARGIN.right)
      .attr('y2', histBottom)
      .attr('stroke', 'var(--border)')
      .attr('stroke-dasharray', '3 3')
      .attr('opacity', 0.6);

    chapters.forEach((ch, i) => {
      const n = histogram[i];
      const h = (n / maxHistogram) * histHeight;
      const cx = xScale(i);
      g.append('rect')
        .attr('x', cx - Math.min(colWidth * 0.3, 12))
        .attr('y', histBottom - h)
        .attr('width', Math.min(colWidth * 0.6, 24))
        .attr('height', h)
        .attr('fill', 'var(--accent)')
        .attr('opacity', 0.3 + (n / maxHistogram) * 0.4)
        .attr('rx', 1.5)
        .append('title')
        .text(`Ch.${ch} · ${n} ${t('timeline.matrix.eventsUnit')}`);
    });

    g.append('text')
      .attr('x', MARGIN.left - 8)
      .attr('y', histBottom - histHeight / 2)
      .attr('text-anchor', 'end')
      .attr('dominant-baseline', 'middle')
      .attr('fill', 'var(--fg-muted)')
      .attr('font-size', 9.5)
      .text(t('timeline.matrix.marginalLabel'));

    /* ── Axes ────────────────────────────────────────── */

    const xAxis = d3
      .axisBottom(xScale)
      .tickValues(d3.range(chapters.length))
      .tickFormat((d) => `Ch.${chapters[d as number]}`);

    g.append('g')
      .attr('transform', `translate(0, ${height - MARGIN.bottom})`)
      .call(xAxis)
      .call((sel) => sel.select('.domain').attr('stroke', 'var(--border)'))
      .call((sel) =>
        sel
          .selectAll('.tick line')
          .attr('stroke', 'var(--border)')
          .attr('y2', -(height - MARGIN.top - MARGIN.bottom))
          .attr('opacity', 0.15),
      )
      .call((sel) =>
        sel
          .selectAll('.tick text')
          .attr('fill', 'var(--fg-muted)')
          .attr('font-size', 10),
      );

    g.append('text')
      .attr('x', width / 2)
      .attr('y', height - 8)
      .attr('text-anchor', 'middle')
      .attr('fill', 'var(--fg-muted)')
      .attr('font-size', 11)
      .text(t('timeline.matrix.xAxisLabel'));

    const yTicks = [0, 0.2, 0.4, 0.6, 0.8, 1.0];
    const yAxis = d3
      .axisLeft(yScale)
      .tickValues(yTicks)
      .tickFormat((d) => {
        if (d === 0) return t('timeline.matrix.storyStart');
        if (d === 1) return t('timeline.matrix.storyEnd');
        return String(d);
      });

    g.append('g')
      .attr('transform', `translate(${MARGIN.left}, 0)`)
      .call(yAxis)
      .call((sel) => sel.select('.domain').attr('stroke', 'var(--border)'))
      .call((sel) =>
        sel
          .selectAll('.tick line')
          .attr('stroke', 'var(--border)')
          .attr('x2', width - MARGIN.left - MARGIN.right)
          .attr('opacity', 0.15),
      )
      .call((sel) =>
        sel
          .selectAll('.tick text')
          .attr('fill', 'var(--fg-muted)')
          .attr('font-size', 10),
      );

    g.append('text')
      .attr('transform', 'rotate(-90)')
      .attr('x', -(height / 2))
      .attr('y', 14)
      .attr('text-anchor', 'middle')
      .attr('fill', 'var(--fg-muted)')
      .attr('font-size', 11)
      .text(t('timeline.matrix.yAxisLabel'));

    /* ── Degraded zone ──────────────────────────────── */

    const degradedTop = yScale(DEGRADED_Y + 0.02);
    const degradedBottom = yScale(DEGRADED_Y - 0.05);
    g.append('rect')
      .attr('x', MARGIN.left)
      .attr('y', degradedTop)
      .attr('width', width - MARGIN.left - MARGIN.right)
      .attr('height', degradedBottom - degradedTop)
      .attr('fill', 'var(--color-warning)')
      .attr('opacity', 0.05)
      .attr('rx', 4);

    g.append('line')
      .attr('x1', MARGIN.left)
      .attr('y1', degradedTop)
      .attr('x2', width - MARGIN.right)
      .attr('y2', degradedTop)
      .attr('stroke', 'var(--color-warning)')
      .attr('stroke-dasharray', '3 3')
      .attr('opacity', 0.4);

    g.append('text')
      .attr('x', MARGIN.left + 6)
      .attr('y', yScale(DEGRADED_Y) + 3)
      .attr('fill', 'var(--color-warning)')
      .attr('font-size', 9)
      .attr('opacity', 0.85)
      .text(t('timeline.matrix.unranked'));

    /* ── 45° Reference line ─────────────────────────── */

    if (chapters.length > 1) {
      g.append('line')
        .attr('x1', xScale(0))
        .attr('y1', yScale(0))
        .attr('x2', xScale(chapters.length - 1))
        .attr('y2', yScale(1))
        .attr('stroke', 'var(--border)')
        .attr('stroke-width', 1.5)
        .attr('stroke-dasharray', '6,4')
        .attr('opacity', 0.5);
    }

    /* ── Dots ───────────────────────────────────────── */

    const tooltip = d3.select(tooltipRef.current);

    const dots = g
      .selectAll<SVGCircleElement, TimelineEvent>('circle.dot')
      .data(events, (d) => d.id)
      .join('circle')
      .attr('class', 'dot')
      .attr('cx', (d) => pos(d).x)
      .attr('cy', (d) => pos(d).y)
      .attr('r', (d) => dotRadius(d))
      .attr('fill', (d) => {
        if (d.chronologicalRank == null) return modeColor('unknown');
        return modeColor(d.narrativeMode);
      })
      .attr('stroke', (d) =>
        d.id === selectedEventId ? 'var(--fg-primary)' : 'none',
      )
      .attr('stroke-width', (d) => (d.id === selectedEventId ? 2 : 0))
      .attr('opacity', (d) => {
        if (d.chronologicalRank == null) return 0.5;
        const passes = passesFilter.get(d.id) ?? true;
        if (!passes) return 0.08;
        if (brushedIds.size > 0 && !brushedIds.has(d.id)) return 0.15;
        return 0.85;
      })
      .attr('cursor', 'pointer');

    dots
      .on('mouseenter', (_event, d) => {
        const { x, y } = pos(d);
        const rankText =
          d.chronologicalRank != null
            ? d.chronologicalRank.toFixed(2)
            : t('timeline.matrix.tooltipUnranked');
        const participants = d.participants.map((p) => p.name).join('、');

        tooltip
          .style('display', 'block')
          .style('left', `${x + 12}px`)
          .style('top', `${y - 8}px`)
          .html(
            `<strong>${d.title}</strong><br/>` +
              `Ch.${d.chapter} · ${d.narrativeMode}<br/>` +
              `${t('timeline.matrix.tooltipRank')}: ${rankText}` +
              (participants ? `<br/>${t('timeline.matrix.tooltipParticipants')}: ${participants}` : ''),
          );
      })
      .on('mouseleave', () => {
        tooltip.style('display', 'none');
      });

    dots.on('click', (_event, d) => {
      onSelectEvent(d.id === selectedEventId ? null : d.id);
    });

    /* ── Brush ──────────────────────────────────────── */

    const brush = d3
      .brush()
      .extent([
        [MARGIN.left, MARGIN.top],
        [width - MARGIN.right, height - MARGIN.bottom],
      ])
      .on('end', (brushEvent) => {
        if (!brushEvent.selection) {
          setBrushedIds(new Set());
          onBrushSelect?.([]);
          return;
        }
        const [[x0, y0], [x1, y1]] = brushEvent.selection as [
          [number, number],
          [number, number],
        ];
        const selected: string[] = [];
        for (const evt of events) {
          const p = pos(evt);
          if (p.x >= x0 && p.x <= x1 && p.y >= y0 && p.y <= y1) {
            const passes = passesFilter.get(evt.id) ?? true;
            if (passes) selected.push(evt.id);
          }
        }
        setBrushedIds(new Set(selected));
        onBrushSelect?.(selected);
        g.select<SVGGElement>('.brush').call(brush.move, null);
      });

    g.append('g').attr('class', 'brush').call(brush);

    g.select('.brush .overlay').attr('fill', 'transparent');
    g.select('.brush .selection')
      .attr('fill', 'var(--accent)')
      .attr('fill-opacity', 0.12)
      .attr('stroke', 'var(--accent)')
      .attr('stroke-opacity', 0.4);

    /* ── Legend ──────────────────────────────────────── */

    const legendData: { label: string; color: string; mode: NarrativeMode }[] = [
      { label: t('timeline.narrativeModes.present'), color: modeColor('present'), mode: 'present' },
      { label: t('timeline.narrativeModes.flashback'), color: modeColor('flashback'), mode: 'flashback' },
      { label: t('timeline.narrativeModes.flashforward'), color: modeColor('flashforward'), mode: 'flashforward' },
      { label: t('timeline.narrativeModes.parallel'), color: modeColor('parallel'), mode: 'parallel' },
    ];

    const legendG = g
      .append('g')
      .attr('transform', `translate(${width - MARGIN.right - 110}, ${MARGIN.top + 6})`);

    legendG
      .append('rect')
      .attr('x', -6)
      .attr('y', -10)
      .attr('width', 116)
      .attr('height', legendData.length * 16 + 12)
      .attr('rx', 6)
      .attr('fill', 'var(--bg-primary)')
      .attr('stroke', 'var(--border)')
      .attr('stroke-width', 1);

    legendData.forEach((d, i) => {
      const row = legendG
        .append('g')
        .attr('transform', `translate(0, ${i * 16})`);
      row
        .append('circle')
        .attr('cx', 6)
        .attr('cy', 0)
        .attr('r', 4)
        .attr('fill', d.color)
        .attr('opacity', 0.85);
      row
        .append('text')
        .attr('x', 16)
        .attr('y', 3.5)
        .attr('fill', 'var(--fg-secondary)')
        .attr('font-size', 10)
        .text(d.label);
    });
  }, [
    events,
    size,
    chapters,
    chapterIndex,
    histogram,
    maxHistogram,
    xScale,
    yScale,
    pos,
    passesFilter,
    selectedEventId,
    brushedIds,
    onSelectEvent,
    onBrushSelect,
    t,
    theme,
  ]);

  // Quadrant label positions (computed from current plot extents)
  const plotLeft = MARGIN.left;
  const plotRight = size.width - MARGIN.right;
  const plotTop = MARGIN.top;
  const plotBottom = size.height - MARGIN.bottom;
  const showQuadrants = chapters.length > 1 && size.width > 0;

  return (
    <div ref={containerRef} className="tl-matrix-wrap">
      <svg
        ref={svgRef}
        width={size.width}
        height={size.height}
        style={{ display: 'block' }}
      />

      {showQuadrants && (
        <>
          {/* Top-left: prolepsis zone (early chapter, late story-time) */}
          <div
            className="tl-quadrant-label"
            style={{ left: plotLeft + 6, top: plotTop + 4 }}
          >
            ↖ {t('timeline.matrix.prolepsisZone')}
          </div>
          {/* Bottom-right: analepsis zone (late chapter, early story-time) */}
          <div
            className="tl-quadrant-label"
            style={{ right: size.width - plotRight + 6, bottom: size.height - plotBottom + 36 }}
          >
            ↘ {t('timeline.matrix.analepsisZone')}
          </div>
          {/* Bottom-left: unranked stripe */}
          <div
            className="tl-quadrant-label warn"
            style={{ left: plotLeft + 6, bottom: size.height - plotBottom + 6 }}
          >
            ⤵ {t('timeline.matrix.unrankedZone')}
          </div>
        </>
      )}

      <div
        ref={tooltipRef}
        className="absolute pointer-events-none rounded-md shadow-lg px-3 py-2 text-xs leading-relaxed"
        style={{
          display: 'none',
          position: 'absolute',
          backgroundColor: 'var(--panel-bg)',
          color: 'var(--panel-fg)',
          border: '1px solid var(--panel-border)',
          maxWidth: 260,
          zIndex: 50,
        }}
      />
    </div>
  );
}
