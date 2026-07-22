/**
 * FactionCanvas — SVG renderer for the community/faction view.
 *
 * Renders faction super-nodes as a dashed circle wrapping a ring of typed dots
 * (composition), with cross-faction edges (cooperation = neutral line, rivalry
 * = red dashed). Drill-in: clicked faction becomes a dashed outline only, with
 * its members laid out around it on a wider ring and thin dashed connectors
 * back to the centre.
 *
 * Used in place of GraphCanvas (Cytoscape) when clusterMode === 'community'.
 */
import { useCallback, useMemo, useRef, useState, type ReactElement, type WheelEvent } from 'react';
import type { FactionAnalysisResponse, FactionResponse } from '@/api/factions';
import type { EntityType, GraphNode } from '@/api/types';
import { deriveFactionLabel } from '@/services/kgClustering';

interface FactionCanvasProps {
  readonly analysis: FactionAnalysisResponse;
  readonly graphNodes: GraphNode[];
  readonly drillInFactionId: string | null;
  readonly onSuperNodeClick: (factionId: string) => void;
  readonly onMemberClick?: (nodeId: string) => void;
  readonly onExitDrillIn?: () => void;
}

interface Vec2 {
  x: number;
  y: number;
}

export const FACTION_CANVAS_VIEW_W = 1130;
export const FACTION_CANVAS_VIEW_H = 800;
const VIEW_W = FACTION_CANVAS_VIEW_W;
const VIEW_H = FACTION_CANVAS_VIEW_H;
const CENTER: Vec2 = { x: VIEW_W / 2, y: VIEW_H / 2 };

// SVG layout constants
const RING_RADIUS = 290;            // distance from canvas centre to faction centres
const MIN_FACTION_R = 56;
const FACTION_R_PER_MEMBER = 6;
const MAX_FACTION_R = 110;
const COMP_DOT_R = 5.5;
const DRILLIN_MEMBER_RING_OFFSET = 80;
const MEMBER_NODE_R = 18;

function factionRadius(memberCount: number): number {
  return Math.max(
    MIN_FACTION_R,
    Math.min(MAX_FACTION_R, MIN_FACTION_R + memberCount * FACTION_R_PER_MEMBER),
  );
}

function dotKey(type: EntityType): string {
  switch (type) {
    case 'character':
      return 'char';
    case 'location':
      return 'loc';
    case 'concept':
      return 'con';
    case 'event':
      return 'evt';
    case 'organization':
      return 'org';
    case 'object':
      return 'obj';
    default:
      return 'other';
  }
}

/** Compute composition: { entityType: count } for a faction. */
function composition(
  faction: FactionResponse,
  nodeMap: Map<string, GraphNode>,
): Array<[EntityType, number]> {
  const counts = new Map<EntityType, number>();
  for (const id of faction.memberIds ?? []) {
    const node = nodeMap.get(id);
    if (!node) continue;
    counts.set(node.type, (counts.get(node.type) ?? 0) + 1);
  }
  return [...counts.entries()];
}

/** Lay factions out evenly on a circle (skip drilled-in faction, which goes to centre). */
// eslint-disable-next-line react-refresh/only-export-components
export function layoutFactions(
  factions: FactionResponse[],
  drillInFactionId: string | null,
): Map<string, Vec2> {
  const positions = new Map<string, Vec2>();
  const others = drillInFactionId
    ? factions.filter((f) => f.id !== drillInFactionId)
    : factions;

  if (drillInFactionId) {
    positions.set(drillInFactionId, CENTER);
  }

  const count = others.length;
  if (count === 0) {
    // Single faction → centre it
    if (factions.length === 1) positions.set(factions[0].id, CENTER);
    return positions;
  }

  // Drilled-in: ring goes further out so members have breathing room
  const ringR = drillInFactionId ? RING_RADIUS + 60 : RING_RADIUS;

  // Drill-in with exactly 1 other faction → place it to the right of centre.
  if (drillInFactionId && count === 1) {
    positions.set(others[0].id, { x: CENTER.x + ringR, y: CENTER.y });
    return positions;
  }

  // Overview with exactly 2 factions → horizontal pair (the generic ring
  // formula with N=2 lands them on the y-axis, which feels arbitrary and
  // clashes with the drilled-in case above).
  if (!drillInFactionId && count === 2) {
    positions.set(others[0].id, { x: CENTER.x - ringR / 2, y: CENTER.y });
    positions.set(others[1].id, { x: CENTER.x + ringR / 2, y: CENTER.y });
    return positions;
  }

  others.forEach((f, i) => {
    const angle = (i / count) * Math.PI * 2 - Math.PI / 2;
    positions.set(f.id, {
      x: CENTER.x + Math.cos(angle) * ringR,
      y: CENTER.y + Math.sin(angle) * ringR,
    });
  });

  return positions;
}

export function FactionCanvas({
  analysis,
  graphNodes,
  drillInFactionId,
  onSuperNodeClick,
  onMemberClick,
  onExitDrillIn,
}: FactionCanvasProps) {
  const factions = useMemo(() => analysis.factions ?? [], [analysis.factions]);
  const relations = useMemo(() => analysis.relations ?? [], [analysis.relations]);
  const nodeMap = useMemo(() => new Map(graphNodes.map((n) => [n.id, n])), [graphNodes]);
  const positions = useMemo(
    () => layoutFactions(factions, drillInFactionId),
    [factions, drillInFactionId],
  );

  const [zoom, setZoom] = useState(1);
  const [pan, setPan] = useState<Vec2>({ x: 0, y: 0 });
  const dragRef = useRef<{ x: number; y: number } | null>(null);
  const [isDragging, setIsDragging] = useState(false);

  const handleWheel = useCallback((e: WheelEvent<SVGSVGElement>) => {
    // Trackpad pinch / Ctrl+wheel = zoom; plain wheel = vertical pan (browser default already prevented)
    if (e.ctrlKey || e.metaKey) {
      const delta = -e.deltaY * 0.0015;
      setZoom((z) => Math.max(0.4, Math.min(3, z + delta)));
    } else {
      setPan((p) => ({ x: p.x - e.deltaX, y: p.y - e.deltaY }));
    }
  }, []);

  const handleMouseDown = useCallback((e: React.MouseEvent<SVGSVGElement>) => {
    if ((e.target as SVGElement).closest('[data-clickable]')) return;
    dragRef.current = { x: e.clientX - pan.x, y: e.clientY - pan.y };
    setIsDragging(true);
  }, [pan]);

  const handleMouseMove = useCallback((e: React.MouseEvent<SVGSVGElement>) => {
    if (!dragRef.current) return;
    setPan({ x: e.clientX - dragRef.current.x, y: e.clientY - dragRef.current.y });
  }, []);

  const handleMouseUp = useCallback(() => {
    dragRef.current = null;
    setIsDragging(false);
  }, []);

  // Edges: one per relation (skip self / drill-in hides external edges to drilled)
  const edgeNodes = useMemo(() => {
    const out: ReactElement[] = [];
    for (const rel of relations) {
      const a = positions.get(rel.sourceFactionId);
      const b = positions.get(rel.targetFactionId);
      if (!a || !b) continue;
      const mx = (a.x + b.x) / 2;
      const my = (a.y + b.y) / 2;
      if (rel.cooperation > 0) {
        out.push(
          <g key={`c-${rel.sourceFactionId}-${rel.targetFactionId}`}>
            <line
              x1={a.x}
              y1={a.y}
              x2={b.x}
              y2={b.y}
              stroke="var(--fg-muted)"
              strokeWidth={1.4 + Math.min(rel.cooperation, 1) * 4}
              strokeLinecap="round"
              opacity={0.55}
            />
            <text
              x={mx}
              y={my - 6}
              textAnchor="middle"
              style={{
                fontSize: 'var(--font-size-2xs)',
                fill: 'var(--fg-secondary)',
                fontFamily: 'var(--font-mono)',
                pointerEvents: 'none',
              }}
            >
              合作 {rel.cooperation.toFixed(2)}
            </text>
          </g>,
        );
      }
      if (rel.rivalry > 0) {
        // Offset rivalry label so it doesn't collide with cooperation
        out.push(
          <g key={`r-${rel.sourceFactionId}-${rel.targetFactionId}`}>
            <line
              x1={a.x}
              y1={a.y}
              x2={b.x}
              y2={b.y}
              stroke="var(--color-error)"
              strokeWidth={1.4 + Math.min(rel.rivalry, 1) * 3.5}
              strokeLinecap="round"
              strokeDasharray="6 4"
              opacity={0.7}
            />
            <text
              x={mx}
              y={my + 14}
              textAnchor="middle"
              style={{
                fontSize: 'var(--font-size-2xs)',
                fill: 'var(--color-error)',
                fontFamily: 'var(--font-mono)',
                pointerEvents: 'none',
              }}
            >
              敵對 {rel.rivalry.toFixed(2)}
            </text>
          </g>,
        );
      }
    }
    return out;
  }, [relations, positions]);

  const drillInFaction = drillInFactionId
    ? factions.find((f) => f.id === drillInFactionId)
    : null;

  const transform = `translate(${pan.x} ${pan.y}) scale(${zoom})`;

  return (
    <svg
      viewBox={`0 0 ${VIEW_W} ${VIEW_H}`}
      preserveAspectRatio="xMidYMid meet"
      style={{
        width: '100%',
        height: '100%',
        background: 'var(--bg-primary)',
        cursor: isDragging ? 'grabbing' : 'grab',
        userSelect: 'none',
      }}
      onWheel={handleWheel}
      onMouseDown={handleMouseDown}
      onMouseMove={handleMouseMove}
      onMouseUp={handleMouseUp}
      onMouseLeave={handleMouseUp}
      onDoubleClick={() => {
        if (drillInFactionId) onExitDrillIn?.();
      }}
    >
      <g transform={transform}>
        {edgeNodes}

        {factions.map((faction) => {
          const pos = positions.get(faction.id);
          if (!pos) return null;
          const isDrilled = faction.id === drillInFactionId;
          const comp = composition(faction, nodeMap);
          const r = factionRadius(faction.memberIds?.length ?? 0);

          if (isDrilled) {
            return (
              <DrilledInFactionShell
                key={faction.id}
                faction={faction}
                pos={pos}
                radius={r}
                nodeMap={nodeMap}
                onMemberClick={onMemberClick}
              />
            );
          }

          return (
            <FactionSuperNode
              key={faction.id}
              faction={faction}
              pos={pos}
              radius={r}
              composition={comp}
              onClick={() => onSuperNodeClick(faction.id)}
              dimmed={!!drillInFactionId}
            />
          );
        })}

        {/* Hint text when drilled in */}
        {drillInFaction && (
          <text
            x={CENTER.x}
            y={VIEW_H - 24}
            textAnchor="middle"
            style={{
              fontSize: 'var(--font-size-2xs)',
              fill: 'var(--fg-muted)',
              fontFamily: 'var(--font-sans)',
            }}
          >
            雙擊空白處退出群集
          </text>
        )}
      </g>
    </svg>
  );
}

// ── Sub-components ─────────────────────────────────────────────────────────

interface SuperNodeProps {
  readonly faction: FactionResponse;
  readonly pos: Vec2;
  readonly radius: number;
  readonly composition: Array<[EntityType, number]>;
  readonly onClick: () => void;
  // C8: dim non-drilled factions to reduced opacity while a drill-in is active,
  // so focus lands on the drilled faction. Still clickable — clicking one
  // switches the drill-in to it.
  readonly dimmed?: boolean;
}

function FactionSuperNode({ faction, pos, radius, composition, onClick, dimmed }: SuperNodeProps) {
  // Distribute composition dots evenly on inner ring
  const totalUnits = composition.reduce((s, [, n]) => s + n, 0);
  const dotR = radius * 0.5;
  const dots: ReactElement[] = [];
  let acc = 0;
  for (const [type, n] of composition) {
    for (let i = 0; i < n; i++) {
      const angle = (acc / totalUnits) * Math.PI * 2 - Math.PI / 2;
      const k = dotKey(type);
      dots.push(
        <circle
          key={`${type}-${i}-${acc}`}
          cx={Math.cos(angle) * dotR}
          cy={Math.sin(angle) * dotR - 4}
          r={COMP_DOT_R}
          fill={`var(--entity-${k}-dot)`}
          stroke={`var(--entity-${k}-border)`}
          strokeWidth={0.8}
        />,
      );
      acc++;
    }
  }

  return (
    <g
      data-clickable="true"
      transform={`translate(${pos.x} ${pos.y})`}
      onClick={onClick}
      style={{
        cursor: 'pointer',
        opacity: dimmed ? 0.25 : 1,
        transition: 'opacity var(--transition-normal, 250ms) ease',
      }}
    >
      <circle
        r={radius}
        fill="var(--bg-primary)"
        stroke="var(--fg-secondary)"
        strokeWidth={1.4}
        strokeDasharray="5 3"
        opacity={0.95}
      />
      {dots}
      <text
        textAnchor="middle"
        y={radius * 0.55}
        style={{
          fontSize: 'var(--font-size-sm)',
          fontFamily: 'var(--font-serif)',
          fontWeight: 700,
          fill: 'var(--fg-primary)',
        }}
      >
        {deriveFactionLabel(faction.topMemberNames, faction.label)}
      </text>
      <text
        textAnchor="middle"
        y={radius + 16}
        style={{
          fontSize: 'var(--font-size-2xs)',
          fill: 'var(--fg-muted)',
          fontFamily: 'var(--font-sans)',
        }}
      >
        {faction.memberIds?.length ?? 0} 個成員
      </text>
    </g>
  );
}

interface DrilledShellProps {
  readonly faction: FactionResponse;
  readonly pos: Vec2;
  readonly radius: number;
  readonly nodeMap: Map<string, GraphNode>;
  readonly onMemberClick?: (nodeId: string) => void;
}

function DrilledInFactionShell({
  faction,
  pos,
  radius,
  nodeMap,
  onMemberClick,
}: DrilledShellProps) {
  const members = (faction.memberIds ?? [])
    .map((id) => nodeMap.get(id))
    .filter((n): n is GraphNode => !!n);

  const ringR = radius + DRILLIN_MEMBER_RING_OFFSET;

  return (
    <g transform={`translate(${pos.x} ${pos.y})`}>
      {/* dashed container */}
      <circle
        r={radius + 10}
        fill="none"
        stroke="var(--fg-secondary)"
        strokeWidth={1}
        strokeDasharray="3 4"
        opacity={0.6}
      />
      <text
        textAnchor="middle"
        y={-radius - 18}
        style={{
          fontSize: 'var(--font-size-sm)',
          fontFamily: 'var(--font-serif)',
          fontWeight: 700,
          fill: 'var(--fg-primary)',
        }}
      >
        {deriveFactionLabel(faction.topMemberNames, faction.label)}
      </text>
      <text
        textAnchor="middle"
        y={-radius - 4}
        style={{
          fontSize: 'var(--font-size-2xs)',
          fill: 'var(--fg-muted)',
          fontFamily: 'var(--font-sans)',
        }}
      >
        {members.length} 個 · 已展開
      </text>

      {members.map((member, i) => {
        const angle = (i / Math.max(members.length, 1)) * Math.PI * 2 - Math.PI / 2;
        const mx = Math.cos(angle) * ringR;
        const my = Math.sin(angle) * ringR;
        const k = dotKey(member.type);
        return (
          <g key={member.id}>
            <line
              x1={0}
              y1={0}
              x2={mx}
              y2={my}
              stroke="var(--fg-muted)"
              strokeWidth={0.8}
              opacity={0.4}
              strokeDasharray="2 3"
            />
            <g
              data-clickable="true"
              transform={`translate(${mx} ${my})`}
              onClick={(e) => {
                e.stopPropagation();
                onMemberClick?.(member.id);
              }}
              style={{ cursor: 'pointer' }}
            >
              <circle
                r={MEMBER_NODE_R}
                fill={`var(--graph-${k}-fill, var(--bg-secondary))`}
                stroke={`var(--entity-${k}-border)`}
                strokeWidth={1.4}
              />
              <text
                textAnchor="middle"
                y={MEMBER_NODE_R + 14}
                style={{
                  fontSize: 'var(--font-size-2xs)',
                  fontFamily: 'var(--font-sans)',
                  fill: 'var(--fg-primary)',
                }}
              >
                {member.name}
              </text>
            </g>
          </g>
        );
      })}
    </g>
  );
}
