/**
 * PairModeOverlay — full-screen exclusive overlay for the knowledge-graph
 * "entity-pair mode" (Phase 5, F1 evolution / F2 path tracing). Presentational
 * only: all data (steps, path, node lookup) is computed by GraphPage from the
 * real graph/API — no fetching, no hardcoded coordinates or copy tied to a
 * specific book.
 */
import { useMemo, type ReactElement } from 'react';
import { useTranslation } from 'react-i18next';
import { X } from 'lucide-react';
import { capCommonNeighbors, type PairChapterStep } from '@/lib/graphPair';
import type { EntityType, GraphNode } from '@/api/types';

export type PairSubMode = 'evo' | 'path';

export interface PairModeOverlayProps {
  readonly a: GraphNode;
  readonly b: GraphNode;
  readonly subMode: PairSubMode;
  readonly onSubModeChange: (mode: PairSubMode) => void;
  readonly onExit: () => void;
  readonly totalChapters: number;
  readonly step: number;
  readonly onStepChange: (step: number) => void;
  readonly steps: PairChapterStep[];
  readonly nodeById: Map<string, GraphNode>;
  readonly path: string[] | null;
  readonly insufficientChange: boolean;
}

interface Vec2 {
  x: number;
  y: number;
}

const VIEW_W = 960;
const VIEW_H = 560;
const CENTER_Y = VIEW_H / 2;
const A_X = 140;
const B_X = VIEW_W - 140;
const MID_X = VIEW_W / 2;
const V_MARGIN = 70;
const ENDPOINT_R = 26;
const NEIGHBOR_R = 17;
const OVERFLOW_R = 20;

const DOT_KEY: Record<EntityType, string> = {
  character: 'char',
  location: 'loc',
  organization: 'org',
  object: 'obj',
  concept: 'con',
  event: 'evt',
  other: 'other',
};

function dotKey(type: EntityType): string {
  return DOT_KEY[type] ?? 'other';
}

/** Evenly spaced vertical positions for `count` slots between V_MARGIN and VIEW_H-V_MARGIN. */
function verticalSlots(count: number): number[] {
  if (count <= 0) return [];
  if (count === 1) return [CENTER_Y];
  const span = VIEW_H - 2 * V_MARGIN;
  return Array.from({ length: count }, (_, i) => V_MARGIN + (span * i) / (count - 1));
}

export function PairModeOverlay({
  a,
  b,
  subMode,
  onSubModeChange,
  onExit,
  totalChapters,
  step,
  onStepChange,
  steps,
  nodeById,
  path,
  insufficientChange,
}: PairModeOverlayProps) {
  const { t } = useTranslation('graph');

  // Cumulative common-neighbor set visible as of `step` (latest snapshot at
  // or before the current step — chapters can legitimately be missing if a
  // snapshot fetch is still pending).
  const currentStepData = useMemo(() => {
    let match: PairChapterStep | undefined;
    for (const s of steps) {
      if (s.chapter <= step) match = s;
    }
    return match;
  }, [steps, step]);

  // Only the exact chapter's snapshot tells us what was newly added *this*
  // chapter (skipped chapters have no well-defined "added" set).
  const exactStepData = useMemo(() => steps.find((s) => s.chapter === step), [steps, step]);
  const addedThisChapter = useMemo(() => exactStepData?.addedIds ?? [], [exactStepData]);
  const addedSet = useMemo(() => new Set(addedThisChapter), [addedThisChapter]);

  const { shown, overflow } = useMemo(
    () => capCommonNeighbors(currentStepData?.commonIds ?? []),
    [currentStepData],
  );

  const evoNodes = useMemo(
    () => shown.map((id) => nodeById.get(id)).filter((n): n is GraphNode => !!n),
    [shown, nodeById],
  );

  const pathNodes = useMemo(
    () => (path ?? []).map((id) => nodeById.get(id)).filter((n): n is GraphNode => !!n),
    [path, nodeById],
  );

  const showEvo = subMode === 'evo';
  const showStepControl = showEvo && !insufficientChange && totalChapters > 0;
  const showEvoSidePanel = showEvo && !insufficientChange;
  const showPathSidePanel = !showEvo && path !== null && pathNodes.length > 0;

  let mainContent: ReactElement;
  if (showEvo && insufficientChange) {
    mainContent = <EmptyStateMessage text={t('v1.pair.insufficientChange')} />;
  } else if (showEvo) {
    mainContent = <EvoSvg a={a} b={b} shown={evoNodes} overflow={overflow} addedSet={addedSet} />;
  } else if (path === null) {
    mainContent = <EmptyStateMessage text={t('v1.pair.noPath')} />;
  } else {
    mainContent = <PathSvg nodes={pathNodes} />;
  }

  let evoSideBody: ReactElement;
  if (addedThisChapter.length === 0) {
    evoSideBody = (
      <p className="text-xs" style={{ color: 'var(--fg-muted)' }}>
        {t('v1.pair.noNewThisChapter')}
      </p>
    );
  } else {
    evoSideBody = (
      <ul className="flex flex-col" style={{ gap: 6 }}>
        {addedThisChapter.map((id) => {
          const n = nodeById.get(id);
          if (!n) return null;
          return <SidePanelPill key={id} node={n} />;
        })}
      </ul>
    );
  }

  const pathSideBody = (
    <ul className="flex flex-col" style={{ gap: 6 }}>
      {pathNodes.map((n) => (
        <SidePanelPill key={n.id} node={n} />
      ))}
    </ul>
  );

  return (
    <div
      className="absolute inset-0"
      style={{ zIndex: 30, backgroundColor: 'var(--bg-primary)' }}
    >
      <style>
        {`@keyframes pairNodeFadeIn {
          from { opacity: 0; transform: scale(0.55); }
          to { opacity: 1; transform: scale(1); }
        }`}
      </style>

      {/* Top-center card: title + evo/path toggle + exit */}
      <div
        className="absolute flex items-center"
        style={{
          top: 16,
          left: '50%',
          transform: 'translateX(-50%)',
          gap: 10,
          padding: '8px 12px',
          backgroundColor: 'var(--bg-primary)',
          border: '1px solid var(--border)',
          borderRadius: 'var(--radius-md)',
          boxShadow: 'var(--shadow-md)',
        }}
      >
        <h3
          className="text-sm font-semibold whitespace-nowrap"
          style={{ fontFamily: 'var(--font-serif)', color: 'var(--fg-primary)' }}
        >
          {t('v1.pair.title', { a: a.name, b: b.name })}
        </h3>

        <div
          role="radiogroup"
          aria-label={t('v1.pair.modeLabel')}
          className="inline-flex"
          style={{
            backgroundColor: 'var(--bg-secondary)',
            border: '1px solid var(--border)',
            borderRadius: 'var(--radius-md)',
            padding: 2,
            gap: 1,
          }}
        >
          {(['evo', 'path'] as const).map((mode) => {
            const active = subMode === mode;
            return (
              <button
                key={mode}
                role="radio"
                aria-checked={active}
                onClick={() => onSubModeChange(mode)}
                className="inline-flex items-center"
                style={{
                  padding: '4px 10px',
                  borderRadius: 'var(--radius-sm)',
                  fontSize: 'var(--font-size-2xs)',
                  backgroundColor: active ? 'var(--bg-primary)' : 'transparent',
                  color: active ? 'var(--accent)' : 'var(--fg-secondary)',
                  boxShadow: active ? 'var(--shadow-sm)' : 'none',
                }}
              >
                {mode === 'evo' ? t('v1.pair.modeEvo') : t('v1.pair.modePath')}
              </button>
            );
          })}
        </div>

        <button
          onClick={onExit}
          className="inline-flex items-center"
          style={{ gap: 4, fontSize: 'var(--font-size-2xs)', color: 'var(--fg-muted)' }}
        >
          <X size={13} />
          {t('v1.pair.exit')}
        </button>
      </div>

      {/* Main visualization */}
      <div className="absolute inset-0 flex items-center justify-center">{mainContent}</div>

      {/* Bottom-center step control (evo only) */}
      {showStepControl && (
        <div
          className="absolute flex flex-col items-center"
          style={{
            bottom: 20,
            left: '50%',
            transform: 'translateX(-50%)',
            gap: 8,
            padding: '10px 16px',
            backgroundColor: 'var(--bg-primary)',
            border: '1px solid var(--border)',
            borderRadius: 'var(--radius-md)',
            boxShadow: 'var(--shadow-md)',
          }}
        >
          <div className="flex items-center" style={{ gap: 6 }}>
            {Array.from({ length: totalChapters }, (_, i) => i + 1).map((n) => (
              <button
                key={n}
                aria-label={t('v1.pair.chapterStep', { n, total: totalChapters })}
                onClick={() => onStepChange(n)}
                className="rounded-full"
                style={{
                  width: n === step ? 10 : 7,
                  height: n === step ? 10 : 7,
                  backgroundColor: n === step ? 'var(--accent)' : 'var(--border)',
                  transition: 'all var(--transition-fast, 150ms) ease',
                }}
              />
            ))}
          </div>
          <span
            className="tabular-nums"
            style={{ fontSize: 'var(--font-size-2xs)', color: 'var(--fg-muted)' }}
          >
            {t('v1.pair.chapterProgress', { n: step, total: totalChapters })}
          </span>
        </div>
      )}

      {/* Right side panel */}
      {(showEvoSidePanel || showPathSidePanel) && (
        <div
          className="absolute flex flex-col"
          style={{
            top: 76,
            right: 16,
            bottom: showStepControl ? 96 : 16,
            width: 260,
            backgroundColor: 'var(--bg-primary)',
            border: '1px solid var(--border)',
            borderRadius: 'var(--radius-md)',
            boxShadow: 'var(--shadow-md)',
            padding: 12,
            overflowY: 'auto',
          }}
        >
          <div
            className="text-xs font-semibold uppercase mb-2"
            style={{ color: 'var(--fg-muted)', letterSpacing: '0.06em' }}
          >
            {showEvo ? t('v1.pair.sideTitleEvo') : t('v1.pair.sideTitlePath')}
          </div>

          {showEvo ? evoSideBody : pathSideBody}
        </div>
      )}
    </div>
  );
}

// ── Sub-renderers ───────────────────────────────────────────────────────────

function EmptyStateMessage({ text }: { readonly text: string }) {
  return (
    <div
      className="text-center"
      style={{ maxWidth: 320, padding: 24, color: 'var(--fg-muted)' }}
    >
      <p className="text-sm" style={{ fontFamily: 'var(--font-serif)' }}>
        {text}
      </p>
    </div>
  );
}

function SidePanelPill({ node }: { readonly node: GraphNode }) {
  const { t } = useTranslation('graph');
  const key = dotKey(node.type);
  return (
    <li
      className="flex items-center"
      style={{
        gap: 6,
        padding: '5px 9px',
        borderRadius: 'var(--pill-radius, 999px)',
        border: '1px solid var(--border)',
      }}
    >
      <span
        className="inline-block rounded-full flex-shrink-0"
        style={{
          width: 8,
          height: 8,
          backgroundColor: `var(--graph-${key}-fill)`,
          border: `1px solid var(--graph-${key}-stroke)`,
        }}
      />
      <span className="text-xs flex-1 truncate" style={{ color: 'var(--fg-primary)' }}>
        {node.name}
      </span>
      <span className="flex-shrink-0" style={{ fontSize: 'var(--font-size-2xs)', color: 'var(--fg-muted)' }}>
        {t(`entityTypes.${node.type}`)}
      </span>
    </li>
  );
}

function EndpointNode({ pos, node }: { readonly pos: Vec2; readonly node: GraphNode }) {
  const key = dotKey(node.type);
  return (
    <g transform={`translate(${pos.x} ${pos.y})`}>
      <circle
        r={ENDPOINT_R}
        fill={`var(--graph-${key}-fill)`}
        stroke={`var(--graph-${key}-stroke)`}
        strokeWidth={2.4}
      />
      <text
        textAnchor="middle"
        y={ENDPOINT_R + 18}
        style={{
          fontSize: 'var(--font-size-sm)',
          fontFamily: 'var(--font-serif)',
          fontWeight: 700,
          fill: 'var(--fg-primary)',
        }}
      >
        {node.name}
      </text>
    </g>
  );
}

function EvoSvg({
  a,
  b,
  shown,
  overflow,
  addedSet,
}: {
  readonly a: GraphNode;
  readonly b: GraphNode;
  readonly shown: GraphNode[];
  readonly overflow: number;
  readonly addedSet: Set<string>;
}) {
  const { t } = useTranslation('graph');
  const slotCount = shown.length + (overflow > 0 ? 1 : 0);
  const ys = verticalSlots(slotCount);
  const aPos: Vec2 = { x: A_X, y: CENTER_Y };
  const bPos: Vec2 = { x: B_X, y: CENTER_Y };

  const neighborPositions: Vec2[] = shown.map((_, i) => ({ x: MID_X, y: ys[i] }));
  const lastY = ys.at(-1) ?? CENTER_Y;
  const overflowPos: Vec2 | null = overflow > 0 ? { x: MID_X, y: lastY } : null;

  const edges: ReactElement[] = [];
  neighborPositions.forEach((pos, i) => {
    edges.push(
      <line
        key={`ea-${shown[i].id}`}
        x1={aPos.x}
        y1={aPos.y}
        x2={pos.x}
        y2={pos.y}
        stroke="var(--fg-muted)"
        strokeWidth={1.2}
        opacity={0.45}
      />,
      <line
        key={`eb-${shown[i].id}`}
        x1={pos.x}
        y1={pos.y}
        x2={bPos.x}
        y2={bPos.y}
        stroke="var(--fg-muted)"
        strokeWidth={1.2}
        opacity={0.45}
      />,
    );
  });
  if (overflowPos) {
    edges.push(
      <line
        key="ea-overflow"
        x1={aPos.x}
        y1={aPos.y}
        x2={overflowPos.x}
        y2={overflowPos.y}
        stroke="var(--fg-muted)"
        strokeWidth={1.2}
        strokeDasharray="3 4"
        opacity={0.35}
      />,
      <line
        key="eb-overflow"
        x1={overflowPos.x}
        y1={overflowPos.y}
        x2={bPos.x}
        y2={bPos.y}
        stroke="var(--fg-muted)"
        strokeWidth={1.2}
        strokeDasharray="3 4"
        opacity={0.35}
      />,
    );
  }

  return (
    <svg
      viewBox={`0 0 ${VIEW_W} ${VIEW_H}`}
      preserveAspectRatio="xMidYMid meet"
      style={{ width: '100%', height: '100%', maxWidth: VIEW_W, maxHeight: VIEW_H }}
    >
      {edges}
      <EndpointNode pos={aPos} node={a} />
      <EndpointNode pos={bPos} node={b} />

      {shown.map((n, i) => {
        const pos = neighborPositions[i];
        const key = dotKey(n.type);
        const isNew = addedSet.has(n.id);
        return (
          <g
            key={n.id}
            transform={`translate(${pos.x} ${pos.y})`}
            style={isNew ? { animation: 'pairNodeFadeIn 480ms ease-out' } : undefined}
          >
            <circle
              r={NEIGHBOR_R}
              fill={`var(--graph-${key}-fill)`}
              stroke={`var(--graph-${key}-stroke)`}
              strokeWidth={1.6}
            />
            <text
              textAnchor="middle"
              x={pos.x + NEIGHBOR_R + 6 > VIEW_W - 20 ? -(NEIGHBOR_R + 8) : NEIGHBOR_R + 8}
              y={4}
              style={{
                fontSize: 'var(--font-size-2xs)',
                fill: 'var(--fg-primary)',
                fontFamily: 'var(--font-sans)',
              }}
            >
              {n.name}
            </text>
          </g>
        );
      })}

      {overflowPos && (
        <g transform={`translate(${overflowPos.x} ${overflowPos.y})`}>
          <circle
            r={OVERFLOW_R}
            fill="var(--bg-secondary)"
            stroke="var(--fg-muted)"
            strokeWidth={1.4}
            strokeDasharray="4 3"
          />
          <text
            textAnchor="middle"
            y={4}
            style={{
              fontSize: 'var(--font-size-2xs)',
              fill: 'var(--fg-secondary)',
              fontFamily: 'var(--font-mono)',
            }}
          >
            {t('v1.pair.overflowLabel', { n: overflow })}
          </text>
        </g>
      )}
    </svg>
  );
}

function PathSvg({ nodes }: { readonly nodes: GraphNode[] }) {
  const m = nodes.length;
  const xs =
    m <= 1
      ? [MID_X]
      : Array.from({ length: m }, (_, i) => A_X + ((B_X - A_X) * i) / (m - 1));

  return (
    <svg
      viewBox={`0 0 ${VIEW_W} ${VIEW_H}`}
      preserveAspectRatio="xMidYMid meet"
      style={{ width: '100%', height: '100%', maxWidth: VIEW_W, maxHeight: VIEW_H }}
    >
      {xs.slice(1).map((x, i) => (
        <line
          key={`${nodes[i].id}-${nodes[i + 1].id}`}
          x1={xs[i]}
          y1={CENTER_Y}
          x2={x}
          y2={CENTER_Y}
          stroke="var(--fg-muted)"
          strokeWidth={1.6}
          opacity={0.55}
        />
      ))}
      {nodes.map((n, i) => {
        const key = dotKey(n.type);
        const isEndpoint = i === 0 || i === nodes.length - 1;
        return (
          <g key={n.id} transform={`translate(${xs[i]} ${CENTER_Y})`}>
            <circle
              r={isEndpoint ? ENDPOINT_R : NEIGHBOR_R}
              fill={`var(--graph-${key}-fill)`}
              stroke={`var(--graph-${key}-stroke)`}
              strokeWidth={isEndpoint ? 2.4 : 1.6}
            />
            <text
              textAnchor="middle"
              y={(isEndpoint ? ENDPOINT_R : NEIGHBOR_R) + 18}
              style={{
                fontSize: 'var(--font-size-2xs)',
                fontFamily: 'var(--font-sans)',
                fontWeight: isEndpoint ? 700 : 400,
                fill: 'var(--fg-primary)',
              }}
            >
              {n.name}
            </text>
          </g>
        );
      })}
    </svg>
  );
}
