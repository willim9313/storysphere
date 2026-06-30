import { useMemo, useRef } from 'react';
import type { EntityType } from '@/api/types';

export interface MiniMapNode {
  id: string;
  x: number;
  y: number;
  type: EntityType | string;
}

export interface MiniMapEdge {
  source: string;
  target: string;
}

export interface MiniMapViewport {
  x1: number;
  y1: number;
  x2: number;
  y2: number;
}

interface MiniMapProps {
  nodes: MiniMapNode[];
  edges: MiniMapEdge[];
  viewport: MiniMapViewport | null;
  onRecenter: (graphX: number, graphY: number) => void;
  onPanByGraph?: (dx: number, dy: number) => void;
  width?: number;
  height?: number;
  padding?: number;
}

const DEFAULT_WIDTH = 180;
const DEFAULT_HEIGHT = 120;
const DEFAULT_PADDING = 8;

function dotKey(type: string): string {
  if (type === 'concept') return 'con';
  if (type === 'event') return 'evt';
  if (type === 'location') return 'loc';
  if (type === 'character') return 'char';
  return 'char';
}

export function MiniMap({
  nodes,
  edges,
  viewport,
  onRecenter,
  onPanByGraph,
  width = DEFAULT_WIDTH,
  height = DEFAULT_HEIGHT,
  padding = DEFAULT_PADDING,
}: MiniMapProps) {
  const svgRef = useRef<SVGSVGElement>(null);
  const dragRef = useRef<{
    startClientX: number;
    startClientY: number;
    scale: number;
    flipY: boolean;
  } | null>(null);

  const bounds = useMemo(() => {
    if (nodes.length === 0) {
      return { x1: -1, y1: -1, x2: 1, y2: 1 };
    }
    let x1 = Infinity, y1 = Infinity, x2 = -Infinity, y2 = -Infinity;
    for (const n of nodes) {
      if (n.x < x1) x1 = n.x;
      if (n.y < y1) y1 = n.y;
      if (n.x > x2) x2 = n.x;
      if (n.y > y2) y2 = n.y;
    }
    if (x1 === x2) { x1 -= 1; x2 += 1; }
    if (y1 === y2) { y1 -= 1; y2 += 1; }
    return { x1, y1, x2, y2 };
  }, [nodes]);

  // Fit-to-box scale: pick smaller axis to keep aspect ratio
  const innerW = width - padding * 2;
  const innerH = height - padding * 2;
  const graphW = bounds.x2 - bounds.x1;
  const graphH = bounds.y2 - bounds.y1;
  const scale = Math.min(innerW / graphW, innerH / graphH);
  const offsetX = padding + (innerW - graphW * scale) / 2;
  const offsetY = padding + (innerH - graphH * scale) / 2;

  const toScreen = (gx: number, gy: number) => ({
    x: offsetX + (gx - bounds.x1) * scale,
    y: offsetY + (gy - bounds.y1) * scale,
  });

  const nodePositions = useMemo(() => {
    const map = new Map<string, { x: number; y: number; type: string }>();
    for (const n of nodes) {
      const p = toScreen(n.x, n.y);
      map.set(n.id, { x: p.x, y: p.y, type: n.type });
    }
    return map;
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [nodes, scale, offsetX, offsetY, bounds.x1, bounds.y1]);

  const vpRect = useMemo(() => {
    if (!viewport) return null;
    const a = toScreen(viewport.x1, viewport.y1);
    const b = toScreen(viewport.x2, viewport.y2);
    return {
      x: Math.min(a.x, b.x),
      y: Math.min(a.y, b.y),
      w: Math.abs(b.x - a.x),
      h: Math.abs(b.y - a.y),
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [viewport, scale, offsetX, offsetY, bounds.x1, bounds.y1]);

  const handleClick = (e: React.MouseEvent<SVGSVGElement>) => {
    if (dragRef.current) return;
    const rect = svgRef.current?.getBoundingClientRect();
    if (!rect) return;
    const sx = e.clientX - rect.left;
    const sy = e.clientY - rect.top;
    const gx = bounds.x1 + (sx - offsetX) / scale;
    const gy = bounds.y1 + (sy - offsetY) / scale;
    onRecenter(gx, gy);
  };

  const handleViewportPointerDown = (e: React.PointerEvent<SVGRectElement>) => {
    if (!onPanByGraph) return;
    e.stopPropagation();
    (e.target as Element).setPointerCapture(e.pointerId);
    dragRef.current = {
      startClientX: e.clientX,
      startClientY: e.clientY,
      scale,
      flipY: false,
    };
  };

  const handleViewportPointerMove = (e: React.PointerEvent<SVGRectElement>) => {
    const drag = dragRef.current;
    if (!drag || !onPanByGraph) return;
    const dxScreen = e.clientX - drag.startClientX;
    const dyScreen = e.clientY - drag.startClientY;
    const dxGraph = dxScreen / drag.scale;
    const dyGraph = dyScreen / drag.scale;
    drag.startClientX = e.clientX;
    drag.startClientY = e.clientY;
    onPanByGraph(dxGraph, dyGraph);
  };

  const handleViewportPointerUp = (e: React.PointerEvent<SVGRectElement>) => {
    (e.target as Element).releasePointerCapture(e.pointerId);
    // Defer clearing so click handler can detect drag-in-progress
    requestAnimationFrame(() => {
      dragRef.current = null;
    });
  };

  return (
    <div
      style={{
        backgroundColor: 'var(--bg-primary)',
        border: '1px solid var(--border)',
        borderRadius: 'var(--radius-lg)',
        boxShadow: 'var(--shadow-sm)',
        overflow: 'hidden',
      }}
    >
      <svg
        ref={svgRef}
        width={width}
        height={height}
        onClick={handleClick}
        style={{ display: 'block', cursor: 'pointer' }}
      >
        {/* edges */}
        {edges.map((e, i) => {
          const a = nodePositions.get(e.source);
          const b = nodePositions.get(e.target);
          if (!a || !b) return null;
          return (
            <line
              key={`e${i}`}
              x1={a.x}
              y1={a.y}
              x2={b.x}
              y2={b.y}
              stroke="var(--fg-muted)"
              strokeWidth={0.6}
              opacity={0.3}
            />
          );
        })}
        {/* nodes */}
        {Array.from(nodePositions.entries()).map(([id, p]) => (
          <circle
            key={id}
            cx={p.x}
            cy={p.y}
            r={2}
            fill={`var(--entity-${dotKey(p.type)}-dot, var(--graph-${dotKey(p.type)}-fill, var(--accent)))`}
          />
        ))}
        {/* viewport rect */}
        {vpRect && (
          <rect
            className="kgp-minimap-vp"
            x={vpRect.x}
            y={vpRect.y}
            width={vpRect.w}
            height={vpRect.h}
            fill="var(--accent)"
            fillOpacity={0.12}
            stroke="var(--accent)"
            strokeWidth={1}
            style={{ cursor: onPanByGraph ? 'move' : 'default' }}
            onPointerDown={handleViewportPointerDown}
            onPointerMove={handleViewportPointerMove}
            onPointerUp={handleViewportPointerUp}
          />
        )}
      </svg>
    </div>
  );
}
