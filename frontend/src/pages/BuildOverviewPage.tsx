import { useMemo, useState } from 'react';
import { Link, useParams } from 'react-router-dom';
import { useQuery } from '@tanstack/react-query';
import { useTranslation, type TFunction } from 'react-i18next';
import {
  AlertTriangle,
  ChevronLeft,
  ExternalLink,
  Filter,
  Layers,
  PlayCircle,
  RotateCw,
} from 'lucide-react';
import { LoadingSpinner } from '@/components/ui/LoadingSpinner';
import { ErrorMessage } from '@/components/ui/ErrorMessage';
import {
  fetchBuildOverview,
  fetchChapterDistribution,
  type NodeStatus,
  type BuildOverviewManifest,
  type BuildOverviewNode,
  type ChapterDistribution,
} from '@/api/buildOverview';
import '@/styles/build-overview.css';

// ── DAG layout constants (matching design hand-off) ────────────────────────────

const DAG_W = 980;
const DAG_H = 660;
const NODE_W = 130;
const NODE_H = 38;
const DIAMOND_W = 110;
const DIAMOND_H = 46;

const NODE_POS: Record<string, { x: number; y: number }> = {
  // Layer 0 — diamonds
  book_meta:  { x: 95, y: 244 },
  chapters:   { x: 95, y: 320 },
  paragraphs: { x: 95, y: 396 },
  // Layer 1 regular
  summaries: { x: 280, y: 80 },
  keywords:  { x: 280, y: 140 },
  symbols:   { x: 280, y: 200 },
  // Layer 1 KG group children
  kg_entity:            { x: 280, y: 268 },
  kg_concept:           { x: 280, y: 320 },
  kg_relation:          { x: 280, y: 372 },
  kg_event:             { x: 280, y: 424 },
  kg_temporal_relation: { x: 280, y: 476 },
  // Layer 2
  cep: { x: 470, y: 200 },
  eep: { x: 470, y: 270 },
  teu: { x: 470, y: 340 },
  sep: { x: 470, y: 410 },
  // Layer 3
  character_analysis_result: { x: 670, y:  80 },
  causality_analysis:        { x: 670, y: 145 },
  impact_analysis:           { x: 670, y: 210 },
  tension_lines:             { x: 670, y: 275 },
  symbol_analysis_result:    { x: 670, y: 340 },
  narrative_structure:       { x: 670, y: 405 },
  hero_journey_stage:        { x: 670, y: 470 },
  temporal_analysis:         { x: 670, y: 535 },
  voice_profile:             { x: 670, y: 600 },
  // Layer 4
  tension_theme:      { x: 880, y: 280 },
  chronological_rank: { x: 880, y: 360 },
};

const KG_GROUP = { x: 215, y: 240, w: 130, h: 270 };
const KG_CHILD_IDS = new Set([
  'kg_entity', 'kg_concept', 'kg_relation', 'kg_event', 'kg_temporal_relation',
]);

const LAYERS = [0, 1, 2, 3, 4] as const;

// Each layer's column center x (matches NODE_POS entries above).
const LAYER_CENTER_X: Record<number, number> = {
  0:  95,
  1: 280,
  2: 470,
  3: 670,
  4: 880,
};

// Lane bands: boundaries fall at midpoints between adjacent layer centers,
// so bands tile the canvas with no gaps and the band center matches the
// node column.
const LANES = LAYERS.map((layer, i) => {
  const center = LAYER_CENTER_X[layer];
  const prev = i > 0 ? LAYER_CENTER_X[LAYERS[i - 1]] : null;
  const next = i < LAYERS.length - 1 ? LAYER_CENTER_X[LAYERS[i + 1]] : null;
  return {
    layer,
    center,
    start: prev !== null ? (prev + center) / 2 : 0,
    end:   next !== null ? (center + next) / 2 : DAG_W,
  };
});

// Map node → corresponding in-book page (empty when no useful destination).
const NODE_TO_ROUTE: Record<string, string> = {
  book_meta: '',
  chapters: '',
  paragraphs: '',
  summaries: '',
  keywords: '',
  kg_entity: 'graph',
  kg_concept: 'graph',
  kg_relation: 'graph',
  kg_event: 'graph',
  kg_temporal_relation: 'timeline',
  symbols: 'symbols',
  sep: 'symbols',
  symbol_analysis_result: 'symbols',
  cep: 'characters',
  character_analysis_result: 'characters',
  hero_journey_stage: 'characters',
  voice_profile: 'characters',
  eep: 'events',
  causality_analysis: 'events',
  impact_analysis: 'events',
  narrative_structure: 'events',
  teu: 'timeline',
  temporal_analysis: 'timeline',
  chronological_rank: 'timeline',
  tension_lines: 'tension',
  tension_theme: 'tension',
};

// ── Helpers ───────────────────────────────────────────────────────────────────

function nodeLabel(t: TFunction, n: BuildOverviewNode): string {
  // Strip API \n line breaks and prefer i18n; fall back to the raw API label.
  const apiLabel = (n.label || '').replace(/\n/g, ' ');
  return t(`unraveling.node.${n.nodeId}`, { defaultValue: apiLabel });
}

function nodeSubLabel(t: TFunction, n: BuildOverviewNode): string {
  if (n.status === 'empty') return t('unraveling.notBuilt');
  const c = n.counts;
  switch (n.nodeId) {
    case 'summaries':
    case 'keywords':
      return `${c.generated ?? 0} / ${c.total ?? 0} ${t('unraveling.counts.chapters')}`;
    case 'symbols':
      return `${c.imagery_entities ?? c.generated ?? 0}`;
    case 'cep':
    case 'character_analysis_result':
      return `${c.analyzed ?? 0} / ${c.total_characters ?? 0}`;
    case 'eep':
    case 'teu':
    case 'causality_analysis':
    case 'impact_analysis':
      return `${c.analyzed ?? 0} / ${c.total_events ?? 0}`;
    case 'kg_temporal_relation':
    case 'chronological_rank':
      return `${c.events_ranked ?? 0} ${t('unraveling.ranked')}`;
    case 'kg_event':
      return `${c.events ?? 0}`;
    case 'kg_entity':
    case 'kg_concept':
      return `${c.total ?? 0}`;
    case 'kg_relation':
      return `${c.relations ?? 0}`;
    case 'book_meta':
      return `${c.fields ?? Object.keys(n.meta).length} ${t('unraveling.counts.fields', { defaultValue: 'fields' })}`;
    case 'chapters':
      return `${c.chapters ?? c.total ?? 0}`;
    case 'paragraphs':
      return `${c.paragraphs ?? c.total ?? 0}`;
    default:
      return n.status === 'complete' ? t('unraveling.status.complete') : '';
  }
}

interface LayerProgress {
  layer: number;
  total: number;
  complete: number;
  partial: number;
  empty: number;
  score: number;
}

function aggregate(nodes: BuildOverviewNode[]): LayerProgress {
  const total = nodes.length;
  const complete = nodes.filter(n => n.status === 'complete').length;
  const partial = nodes.filter(n => n.status === 'partial').length;
  const empty = nodes.filter(n => n.status === 'empty').length;
  const score = total === 0 ? 0 : (complete + partial * 0.5) / total;
  return { layer: -1, total, complete, partial, empty, score };
}

function layerProgress(nodes: BuildOverviewNode[], layer: number): LayerProgress {
  const sub = nodes.filter(n => n.layer === layer);
  return { ...aggregate(sub), layer };
}

function getBlockers(
  nodeId: string,
  manifest: BuildOverviewManifest,
): BuildOverviewNode[] {
  const nodeById = new Map(manifest.nodes.map(n => [n.nodeId, n]));
  const incoming = manifest.edges.filter(e => e.target === nodeId);
  return incoming
    .map(e => nodeById.get(e.source))
    .filter((n): n is BuildOverviewNode => !!n && n.status !== 'complete');
}

// ── DAG: nodes ────────────────────────────────────────────────────────────────

function nodeRect(nodeId: string, layer: number) {
  const p = NODE_POS[nodeId];
  if (!p) return null;
  const isDiamond = layer === 0;
  const w = isDiamond ? DIAMOND_W : NODE_W;
  const h = isDiamond ? DIAMOND_H : NODE_H;
  return { x: p.x - w / 2, y: p.y - h / 2, w, h, cx: p.x, cy: p.y, isDiamond };
}

interface DagNodeProps {
  node: BuildOverviewNode;
  selected: boolean;
  faded: boolean;
  onClick: () => void;
  t: TFunction;
}

function DagNode({ node, selected, faded, onClick, t }: Readonly<DagNodeProps>) {
  const rect = nodeRect(node.nodeId, node.layer);
  if (!rect) return null;

  const bg = `var(--status-${node.status}-bg)`;
  const text = `var(--status-${node.status}-fg)`;
  const border = `var(--status-${node.status}-border)`;
  const accent = 'var(--accent)';
  const stroke = selected ? accent : border;
  const strokeW = selected ? 2.4 : 1.4;
  const opacity = faded ? 0.28 : 1;
  const ry = node.layer === 1 ? 2 : 8;

  const sub = nodeSubLabel(t, node);

  const labelTexts = (
    <>
      <text
        x={rect.cx} y={rect.cy - 2}
        fill={text} fontSize={10.5} fontWeight={600}
        textAnchor="middle"
        style={{ fontFamily: 'var(--font-sans)' }}
      >
        {nodeLabel(t, node)}
      </text>
      {sub && (
        <text
          x={rect.cx} y={rect.cy + 11}
          fill={text} fontSize={9} opacity={0.85}
          textAnchor="middle"
          style={{ fontFamily: 'var(--font-sans)' }}
        >
          {sub}
        </text>
      )}
    </>
  );

  if (rect.isDiamond) {
    const pts = [
      [rect.cx, rect.y],
      [rect.x + rect.w, rect.cy],
      [rect.cx, rect.y + rect.h],
      [rect.x, rect.cy],
    ].map(p => p.join(',')).join(' ');
    return (
      <g style={{ opacity, cursor: 'pointer', transition: 'opacity 200ms ease' }} onClick={onClick}>
        <polygon
          points={pts}
          fill={bg}
          stroke={stroke}
          strokeWidth={strokeW}
          style={{ transition: 'stroke 200ms ease, stroke-width 200ms ease' }}
        />
        {labelTexts}
      </g>
    );
  }

  return (
    <g style={{ opacity, cursor: 'pointer', transition: 'opacity 200ms ease' }} onClick={onClick}>
      <rect
        x={rect.x} y={rect.y}
        width={rect.w} height={rect.h}
        rx={ry} ry={ry}
        fill={bg}
        stroke={stroke}
        strokeWidth={strokeW}
        style={{ transition: 'stroke 200ms ease, stroke-width 200ms ease' }}
      />
      {labelTexts}
    </g>
  );
}

// ── DAG: edges ────────────────────────────────────────────────────────────────

interface DagEdgeProps {
  source: string;
  target: string;
  sourceLayer: number;
  targetLayer: number;
  highlighted: boolean;
  faded: boolean;
}

function DagEdge({
  source, target, sourceLayer, targetLayer, highlighted, faded,
}: Readonly<DagEdgeProps>) {
  const a = nodeRect(source, sourceLayer);
  const b = nodeRect(target, targetLayer);
  if (!a || !b) return null;

  const x1 = a.x + a.w;
  const y1 = a.cy;
  const x2 = b.x;
  const y2 = b.cy;
  const dx = Math.max(40, (x2 - x1) * 0.4);
  const cx1 = x1 + dx;
  const cy1 = y1;
  const cx2 = x2 - dx;
  const cy2 = y2;
  const path = `M ${x1} ${y1} C ${cx1} ${cy1} ${cx2} ${cy2} ${x2} ${y2}`;

  const stroke = highlighted ? 'var(--accent)' : 'var(--border)';
  const sw = highlighted ? 1.8 : 1.1;
  const op = faded ? 0.18 : (highlighted ? 1 : 0.55);

  return (
    <g style={{ opacity: op, transition: 'opacity 200ms ease' }}>
      <path
        d={path}
        fill="none"
        stroke={stroke}
        strokeWidth={sw}
        markerEnd={highlighted ? 'url(#bo-arrow-hi)' : 'url(#bo-arrow)'}
      />
    </g>
  );
}

// ── DAG canvas ────────────────────────────────────────────────────────────────

interface DagCanvasProps {
  manifest: BuildOverviewManifest;
  selectedId: string | null;
  onSelect: (id: string | null) => void;
}

function DagCanvas({ manifest, selectedId, onSelect }: Readonly<DagCanvasProps>) {
  const { t } = useTranslation('analysis');
  const layerById = useMemo(
    () => new Map(manifest.nodes.map(n => [n.nodeId, n.layer])),
    [manifest.nodes],
  );

  const { highlightedNodes, highlightedEdgeIdx } = useMemo(() => {
    const nodes = new Set<string>();
    const edges = new Set<number>();
    if (selectedId) {
      nodes.add(selectedId);
      manifest.edges.forEach((e, i) => {
        if (e.source === selectedId || e.target === selectedId) {
          edges.add(i);
          nodes.add(e.source);
          nodes.add(e.target);
        }
      });
    }
    return { highlightedNodes: nodes, highlightedEdgeIdx: edges };
  }, [selectedId, manifest.edges]);

  const isFaded = (id: string) => !!selectedId && !highlightedNodes.has(id);

  const kgGroupActive = !selectedId
    || highlightedNodes.has('kg_features')
    || [...KG_CHILD_IDS].some(c => highlightedNodes.has(c));

  return (
    <svg
      className="bo-dag-svg"
      viewBox={`0 0 ${DAG_W} ${DAG_H}`}
      preserveAspectRatio="xMidYMid meet"
      onClick={(e) => {
        // Background click clears selection
        if (e.target === e.currentTarget) onSelect(null);
      }}
    >
      <defs>
        <marker id="bo-arrow" viewBox="0 0 8 8" refX="7" refY="4" markerWidth="6" markerHeight="6" orient="auto">
          <path d="M0,0 L8,4 L0,8 z" fill="var(--border)" />
        </marker>
        <marker id="bo-arrow-hi" viewBox="0 0 8 8" refX="7" refY="4" markerWidth="6" markerHeight="6" orient="auto">
          <path d="M0,0 L8,4 L0,8 z" fill="var(--accent)" />
        </marker>
      </defs>

      {/* Alternating lane backgrounds — bands tile the canvas with no gaps */}
      {LANES.map((l, i) => i % 2 === 1 ? (
        <rect
          key={l.layer}
          x={l.start} y={0}
          width={l.end - l.start} height={DAG_H}
          fill="var(--bg-secondary)"
          opacity={0.35}
        />
      ) : null)}

      {/* Lane headers — centered on the node column */}
      {LANES.map(l => (
        <g key={l.layer}>
          <text
            x={l.center} y={20}
            fill="var(--fg-muted)"
            fontSize={10} fontWeight={700}
            textAnchor="middle"
            style={{ fontFamily: 'var(--font-sans)', letterSpacing: '0.12em' }}
          >
            LAYER {l.layer}
          </text>
          <text
            x={l.center} y={36}
            fill="var(--fg-secondary)"
            fontSize={11.5} fontWeight={600}
            textAnchor="middle"
            style={{ fontFamily: 'var(--font-serif)' }}
          >
            {t(`unraveling.laneName.${l.layer}`)}
          </text>
        </g>
      ))}

      {/* KG compound group */}
      <g style={{ opacity: kgGroupActive ? 1 : 0.4, transition: 'opacity 200ms ease' }}>
        <rect
          x={KG_GROUP.x} y={KG_GROUP.y}
          width={KG_GROUP.w} height={KG_GROUP.h}
          rx={8} ry={8}
          fill="var(--bg-tertiary)" fillOpacity={0.55}
          stroke="var(--accent)" strokeWidth={1.4}
          strokeDasharray="4 3"
        />
        <text
          x={KG_GROUP.x + KG_GROUP.w / 2} y={KG_GROUP.y - 6}
          fill="var(--accent)"
          fontSize={11} fontWeight={700}
          textAnchor="middle"
          style={{ fontFamily: 'var(--font-sans)', letterSpacing: '0.04em' }}
        >
          {t('unraveling.node.kg_features')}
        </text>
      </g>

      {/* Edges */}
      {manifest.edges.map((e, i) => {
        const srcLayer = layerById.get(e.source);
        const tgtLayer = layerById.get(e.target);
        if (srcLayer === undefined || tgtLayer === undefined) return null;
        return (
          <DagEdge
            key={`${e.source}-${e.target}-${i}`}
            source={e.source}
            target={e.target}
            sourceLayer={srcLayer}
            targetLayer={tgtLayer}
            highlighted={highlightedEdgeIdx.has(i)}
            faded={!!selectedId && !highlightedEdgeIdx.has(i)}
          />
        );
      })}

      {/* Nodes */}
      {manifest.nodes.map(n => (
        <DagNode
          key={n.nodeId}
          node={n}
          selected={n.nodeId === selectedId}
          faded={isFaded(n.nodeId)}
          onClick={() => onSelect(n.nodeId)}
          t={t}
        />
      ))}
    </svg>
  );
}

// ── Status badge ──────────────────────────────────────────────────────────────

function StatusBadge({ status, label }: Readonly<{ status: NodeStatus; label: string }>) {
  return (
    <span className={`bo-statbadge ${status}`}>
      <span className="bo-statbadge-dot" />
      {label}
    </span>
  );
}

// ── Summary strip ─────────────────────────────────────────────────────────────

function SummaryStrip({ manifest }: Readonly<{ manifest: BuildOverviewManifest }>) {
  const { t } = useTranslation('analysis');
  const ov = aggregate(manifest.nodes);
  const pct = Math.round(ov.score * 100);

  return (
    <div className="bo-summary">
      <div className="bo-summary-left">
        <div className="bo-eyebrow">{t('unraveling.summary.eyebrow')}</div>
        <div className="bo-headline">
          <div className="bo-pct">
            {pct}
            <span className="bo-pct-unit">%</span>
          </div>
        </div>
        <div className="bo-headline-sub">
          <strong>{ov.complete}</strong> {t('unraveling.summary.complete')} ·{' '}
          <strong>{ov.partial}</strong> {t('unraveling.summary.partial')} ·{' '}
          <strong>{ov.empty}</strong> {t('unraveling.summary.empty')}
          <span style={{ color: 'var(--fg-muted)' }}>
            {' · '}
            {t('unraveling.summary.totalNodes', { n: ov.total })}
          </span>
        </div>
      </div>

      <div className="bo-summary-mid">
        <div className="bo-stackedbar">
          <div className="seg-complete" style={{ width: `${(ov.complete / Math.max(1, ov.total)) * 100}%` }} />
          <div className="seg-partial"  style={{ width: `${(ov.partial / Math.max(1, ov.total)) * 100}%` }} />
          <div className="seg-empty"    style={{ width: `${(ov.empty / Math.max(1, ov.total)) * 100}%` }} />
        </div>

        <div className="bo-layerchips">
          {LAYERS.map(layer => {
            const lp = layerProgress(manifest.nodes, layer);
            return (
              <div key={layer} className="bo-layerchip">
                <div className="bo-layerchip-head">
                  <span>L{layer}</span>
                  <span style={{ color: 'var(--fg-secondary)' }}>·</span>
                  <span className="name">{t(`unraveling.layer.${layer}`)}</span>
                </div>
                <div className="bo-layerchip-progress">
                  <div
                    className="bo-layerchip-progress-fill"
                    style={{ width: `${lp.score * 100}%` }}
                  />
                </div>
                <div className="bo-layerchip-meta">
                  <span>{lp.complete}/{lp.total}</span>
                  {lp.partial > 0 && <span>· {lp.partial} {t('unraveling.summary.partial')}</span>}
                </div>
              </div>
            );
          })}
        </div>
      </div>
    </div>
  );
}

// ── Inspector — layer list ────────────────────────────────────────────────────

interface LayerListProps {
  manifest: BuildOverviewManifest;
  selectedId: string | null;
  onSelect: (nodeId: string) => void;
}

function LayerList({ manifest, selectedId, onSelect }: Readonly<LayerListProps>) {
  const { t } = useTranslation('analysis');
  return (
    <div className="bo-layerlist">
      {LAYERS.map(layer => {
        const nodes = manifest.nodes.filter(n => n.layer === layer);
        const lp = layerProgress(manifest.nodes, layer);
        return (
          <div key={layer} className="bo-layergroup">
            <div className="bo-layergroup-head">
              <div className="bo-layergroup-num">L{layer}</div>
              <div className="bo-layergroup-name">{t(`unraveling.layer.${layer}`)}</div>
              <div className="bo-layergroup-progress">
                {lp.complete}/{lp.total} · {Math.round(lp.score * 100)}%
              </div>
            </div>
            <div>
              {nodes.map(n => (
                <button
                  key={n.nodeId}
                  type="button"
                  className={`bo-noderow ${selectedId === n.nodeId ? 'selected' : ''}`}
                  onClick={() => onSelect(n.nodeId)}
                >
                  <div className={`bo-noderow-status ${n.status}`} />
                  <div className="bo-noderow-name">{nodeLabel(t, n)}</div>
                  <div className="bo-noderow-sub">{nodeSubLabel(t, n)}</div>
                </button>
              ))}
            </div>
          </div>
        );
      })}
    </div>
  );
}

// ── Inspector — chapter distribution sparkline ────────────────────────────────

function ChapterDistMini({ values }: Readonly<{ values: number[] }>) {
  if (values.length === 0) return null;
  const max = Math.max(1, ...values);
  return (
    <div>
      <div className="bo-chapdist">
        {values.map((v, i) => (
          <div
            key={i}
            className={`bo-chapdist-bar ${v === 0 ? 'empty' : ''}`}
            style={{
              height: `${(v / max) * 100}%`,
              minHeight: v === 0 ? '2px' : '4px',
            }}
            title={`Ch.${i + 1}: ${v}`}
          />
        ))}
      </div>
      <div className="bo-chapdist-labels">
        {values.map((_, i) => (
          <span key={i}>{(i + 1) % 3 === 1 || i === values.length - 1 ? i + 1 : ''}</span>
        ))}
      </div>
    </div>
  );
}

// ── Inspector — node detail ───────────────────────────────────────────────────

interface NodeDetailProps {
  node: BuildOverviewNode;
  bookId: string;
  manifest: BuildOverviewManifest;
  chapterDist?: number[];
  onBack: () => void;
}

interface ProgressNumbers {
  num: number;
  denom: number;
  numLabel: string;
  denomLabel: string;
}

function progressFor(node: BuildOverviewNode, t: TFunction): ProgressNumbers | null {
  const c = node.counts;
  const tCounts = (k: string) => t(`unraveling.counts.${k}`, { defaultValue: k });

  if (node.nodeId === 'summaries' || node.nodeId === 'keywords') {
    if (!c.total) return null;
    return {
      num: c.generated ?? 0,
      denom: c.total,
      numLabel: tCounts('generated'),
      denomLabel: tCounts('chapters'),
    };
  }
  if (node.nodeId === 'cep' || node.nodeId === 'character_analysis_result') {
    if (!c.total_characters) return null;
    return {
      num: c.analyzed ?? 0,
      denom: c.total_characters,
      numLabel: tCounts('analyzed'),
      denomLabel: tCounts('total_characters'),
    };
  }
  if (['eep', 'teu', 'causality_analysis', 'impact_analysis'].includes(node.nodeId)) {
    if (!c.total_events) return null;
    return {
      num: c.analyzed ?? 0,
      denom: c.total_events,
      numLabel: tCounts('analyzed'),
      denomLabel: tCounts('total_events'),
    };
  }
  if (node.nodeId === 'chronological_rank') {
    if (!c.total_events) return null;
    return {
      num: c.events_ranked ?? 0,
      denom: c.total_events,
      numLabel: tCounts('events_ranked'),
      denomLabel: tCounts('total_events'),
    };
  }
  return null;
}

function NodeDetail({
  node, bookId, manifest, chapterDist, onBack,
}: Readonly<NodeDetailProps>) {
  const { t } = useTranslation('analysis');
  const statusLabel = t(`unraveling.status.${node.status}`);
  const progress = progressFor(node, t);
  const blockers = getBlockers(node.nodeId, manifest);
  const hasBlockers = blockers.length > 0 && node.status !== 'complete';
  const route = NODE_TO_ROUTE[node.nodeId];

  const openPageButton = route ? (
    <Link to={`/books/${bookId}/${route}`} className="bo-cta secondary">
      <ExternalLink size={12} />
      {t('unraveling.detail.openPage')}
    </Link>
  ) : (
    <button type="button" className="bo-cta secondary bo-cta-disabled" disabled>
      <ExternalLink size={12} />
      {t('unraveling.detail.openPage')}
      <span className="bo-cta-hint-inline">· {t('unraveling.openPageNotImplemented')}</span>
    </button>
  );

  return (
    <div className="bo-detail">
      <button type="button" className="bo-inspector-back" onClick={onBack}>
        <ChevronLeft size={11} />
        {t('unraveling.inspector.backToList')}
      </button>

      <div>
        <div className="bo-detail-title-row">
          <div className="bo-detail-title">{nodeLabel(t, node)}</div>
          <div className="bo-detail-id">L{node.layer} · {node.nodeId}</div>
        </div>
        <div style={{ marginTop: 4 }}>
          <StatusBadge status={node.status} label={statusLabel} />
        </div>
      </div>

      {progress && (
        <div className="bo-progress-card">
          <div className="bo-detail-section-h">{progress.numLabel}</div>
          <div className="bo-progress-row">
            <div className="bo-progress-num">{progress.num}</div>
            <div className="bo-progress-of">/ {progress.denom}</div>
            <div className="bo-progress-of">{progress.denomLabel}</div>
          </div>
          <div className="bo-progress-bar">
            <div
              className="bo-progress-bar-fill"
              style={{ width: `${(progress.num / progress.denom) * 100}%` }}
            />
          </div>
        </div>
      )}

      {chapterDist && chapterDist.length > 0 && (
        <div className="bo-detail-section">
          <div className="bo-detail-section-h">{t('unraveling.detail.chapterDist')}</div>
          <ChapterDistMini values={chapterDist} />
        </div>
      )}

      {node.status !== 'complete' && (
        <div className="bo-detail-section">
          {hasBlockers ? (
            <>
              <div className="bo-detail-section-h">{t('unraveling.detail.blockedTitle')}</div>
              <div className="bo-blockers">
                {blockers.map(b => (
                  <div key={b.nodeId} className="bo-blocker-chip">
                    <div
                      className="bo-blocker-chip-dot"
                      style={{ background: `var(--status-${b.status}-border)` }}
                    />
                    <span>{nodeLabel(t, b)}</span>
                  </div>
                ))}
              </div>
              <button type="button" className="bo-cta bo-cta-disabled" disabled>
                <AlertTriangle size={12} />
                {t('unraveling.detail.blockedHint', { n: blockers.length })}
              </button>
            </>
          ) : (
            <button type="button" className="bo-cta bo-cta-disabled" disabled>
              <PlayCircle size={12} />
              {t('unraveling.detail.triggerSoon')}
            </button>
          )}
          {openPageButton}
        </div>
      )}

      {node.status === 'complete' && (
        <div className="bo-detail-section">
          {openPageButton}
        </div>
      )}

      {Object.keys(node.counts).length > 0 && (
        <div className="bo-detail-section">
          <div className="bo-detail-section-h">{t('unraveling.detail.rawCounts')}</div>
          <div className="bo-counts">
            {Object.entries(node.counts).map(([k, v]) => (
              <div key={k} className="bo-counts-row">
                <span className="bo-counts-key">
                  {t(`unraveling.counts.${k}`, { defaultValue: k })}
                </span>
                <span className="bo-counts-val">{v}</span>
              </div>
            ))}
          </div>
        </div>
      )}

      {Object.keys(node.meta).length > 0 && (
        <div className="bo-detail-section">
          <div className="bo-detail-section-h">{t('unraveling.detail.meta')}</div>
          <div className="bo-counts">
            {Object.entries(node.meta).map(([k, v]) => (
              <div key={k} className="bo-counts-row">
                <span className="bo-counts-key">
                  {t(`unraveling.counts.${k}`, { defaultValue: k })}
                </span>
                <span className="bo-counts-val">{String(v)}</span>
              </div>
            ))}
          </div>
        </div>
      )}
    </div>
  );
}

// ── Page ──────────────────────────────────────────────────────────────────────

export default function BuildOverviewPage() {
  const { bookId } = useParams<{ bookId: string }>();
  const { t } = useTranslation('analysis');
  const [selectedId, setSelectedId] = useState<string | null>(null);

  const { data: manifest, isLoading, error } = useQuery({
    queryKey: ['buildOverview', bookId],
    queryFn: () => fetchBuildOverview(bookId!),
    enabled: !!bookId,
    staleTime: 60_000,
  });

  const { data: chapterDist } = useQuery<ChapterDistribution>({
    queryKey: ['buildOverview', bookId, 'chapter-distribution'],
    queryFn: () => fetchChapterDistribution(bookId!),
    enabled: !!bookId,
    staleTime: 60_000,
  });

  if (isLoading) return <LoadingSpinner />;
  if (error) return <ErrorMessage message={t('unravelingLoadError')} />;
  if (!manifest || !bookId) return null;

  const selectedNode = selectedId
    ? manifest.nodes.find(n => n.nodeId === selectedId) ?? null
    : null;

  return (
    <div className="bo-page">
      <SummaryStrip manifest={manifest} />

      <div className="bo-body">
        <div className="bo-dag">
          <DagCanvas
            manifest={manifest}
            selectedId={selectedId}
            onSelect={setSelectedId}
          />
          {selectedId && (
            <div className="bo-dag-toolbar">
              <button
                type="button"
                onClick={() => setSelectedId(null)}
                title={t('unraveling.toolbar.clearSelection')}
              >
                <RotateCw size={11} />
                {t('unraveling.toolbar.showAll')}
              </button>
            </div>
          )}
        </div>

        <div className="bo-inspector">
          <div className="bo-inspector-head">
            {selectedNode ? (
              <Layers size={14} style={{ color: 'var(--fg-secondary)', flexShrink: 0 }} />
            ) : (
              <Filter size={14} style={{ color: 'var(--fg-secondary)', flexShrink: 0 }} />
            )}
            <h3>
              {selectedNode
                ? t('unraveling.inspector.nodeDetail')
                : t('unraveling.inspector.layerList')}
            </h3>
            <div className="bo-inspector-head-meta">
              {selectedNode
                ? t('unraveling.inspector.layerLabel', { n: selectedNode.layer })
                : t('unraveling.inspector.nodeCount', { n: manifest.nodes.length })}
            </div>
          </div>
          <div className="bo-inspector-body">
            {selectedNode ? (
              <NodeDetail
                node={selectedNode}
                bookId={bookId}
                manifest={manifest}
                chapterDist={chapterDist?.distributions[selectedNode.nodeId]}
                onBack={() => setSelectedId(null)}
              />
            ) : (
              <LayerList
                manifest={manifest}
                selectedId={selectedId}
                onSelect={setSelectedId}
              />
            )}
          </div>
        </div>
      </div>
    </div>
  );
}
