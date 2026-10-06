import { useEffect, useMemo, useRef, useState, type ReactNode } from 'react';
import { Link, useParams } from 'react-router-dom';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { Trans, useTranslation } from 'react-i18next';
import type { TFunction } from 'i18next';
import { AlertTriangle, ArrowLeft, Info, Loader2, ArrowUpRight } from 'lucide-react';
import { ConfirmDialog } from '@/components/ui/ConfirmDialog';
import { GuidanceRibbon } from '@/components/ui/GuidanceRibbon';
import { LlmUnconfiguredNotice } from '@/components/ui/LlmUnconfiguredNotice';
import { PageFailure } from '@/components/ui/PageFailure';
import { Tooltip } from '@/components/ui/Tooltip';
import { useTaskPolling } from '@/hooks/useTaskPolling';
import { rerunStep } from '@/api/ingest';
import { failureKind, isLlmUnconfigured, techDetailOf } from '@/api/failureKind';
import { triggerBatchEntityAnalysis, triggerBatchEventAnalysis } from '@/api/analysis';
import {
  confirmInferredConcept,
  fetchInferredConcepts,
  rejectInferredConcept,
  triggerConceptInference,
} from '@/api/graph';
import { qk } from '@/api/queryKeys';
import {
  fetchBuildOverview,
  fetchChapterDistribution,
  type NodeStatus,
  type BuildOverviewManifest,
  type BuildOverviewNode,
  type ChapterDistribution,
} from '@/api/buildOverview';
import {
  BACK_EDGE_Y,
  COLUMN_CX,
  KG_CHILD_IDS,
  KG_GROUP_BOX,
  LAYERS,
  NODE_H,
  NODE_W,
  SVG_H,
  SVG_W,
  actionModeFor,
  aggregate,
  blockersOf,
  ctaStateFor,
  dropsDerived,
  droppedNodes,
  edgeRole,
  layerProgress,
  layoutEdges,
  metaValueText,
  neighborIds,
  nodeBox,
  scorePct,
  sharedTriggerPeers,
  triggerKeyOf,
  upstreamChain,
  type TriggerKey,
} from '@/components/buildOverview/buildOverviewModel';
import '@/styles/build-overview.css';

// ── Node → in-book page / trigger ─────────────────────────────────────────────

// Map node → corresponding in-book page (empty when no useful destination).
const NODE_TO_ROUTE: Record<string, string> = {
  book_meta: '',
  chapters: '',
  paragraphs: '',
  summaries: '',
  keywords: '',
  kg_entity: 'graph',
  kg_concept: 'graph',
  kg_concept_inferred: 'graph',
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

// What each trigger calls. Which nodes share a trigger, and which of those drop
// derived analyses, lives in buildOverviewModel (NODE_TRIGGER_KEY /
// DROPS_BY_TRIGGER) so the canvas and the confirm dialog read one table.
//
// Summarization skips chapters that already have a summary, so it fills the gap
// rather than rebuilding. A KG rerun refills only the NER concepts — the
// inference half is its own node (`kg_concept_inferred`, B-092).
const TRIGGER_RUN: Record<TriggerKey, (bookId: string) => Promise<{ taskId: string }>> = {
  summarization: (id) => rerunStep(id, 'summarization'),
  'feature-extraction': (id) => rerunStep(id, 'feature-extraction'),
  'symbol-discovery': (id) => rerunStep(id, 'symbol-discovery'),
  'knowledge-graph': (id) => rerunStep(id, 'knowledge-graph'),
  'concept-inference': triggerConceptInference,
  // CEP is the evidence package the character analysis is built from; both
  // nodes report the same counts and come from the same batch run.
  'entity-batch': triggerBatchEntityAnalysis,
  'event-batch': triggerBatchEventAnalysis,
};

// ── Helpers ───────────────────────────────────────────────────────────────────

function nodeLabel(t: TFunction, n: BuildOverviewNode): string {
  // Strip API \n line breaks and prefer i18n; fall back to the raw API label.
  const apiLabel = (n.label || '').replace(/\n/g, ' ');
  return t(`unraveling.node.${n.nodeId}`, { defaultValue: apiLabel });
}

function nodeSubLabel(t: TFunction, n: BuildOverviewNode, pendingConcepts?: number): string {
  if (n.nodeId === 'kg_concept_inferred' && pendingConcepts) {
    // The manifest has no pending count; the review queue does. The node's
    // status stays whatever the manifest says.
    return t('unraveling.concepts.pendingCount', { n: pendingConcepts });
  }
  if (n.status === 'empty') return t('unraveling.notBuilt');
  const c = n.counts;
  switch (n.nodeId) {
    case 'summaries':
    case 'keywords':
      return `${c.generated ?? 0} / ${c.total ?? 0}`;
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
    case 'sep':
    case 'symbol_analysis_result':
      return `${c.analyzed ?? 0} / ${c.total_imagery ?? 0}`;
    case 'voice_profile':
      return `${c.analyzed ?? 0} / ${c.total_characters ?? 0}`;
    case 'kg_temporal_relation':
    case 'chronological_rank':
      return `${c.events_ranked ?? 0} ${t('unraveling.ranked')}`;
    case 'kg_event':
      return `${c.events ?? 0}`;
    case 'kg_entity':
    case 'kg_concept':
    case 'kg_concept_inferred':
      return `${c.total ?? 0}`;
    case 'kg_relation':
      return `${c.relations ?? 0}`;
    case 'book_meta':
      return t('unraveling.counts.built');
    case 'chapters':
      return t('unraveling.counts.chaptersN', { n: c.chapters ?? c.total ?? 0 });
    case 'paragraphs':
      return t('unraveling.counts.paragraphsN', { n: c.paragraphs ?? c.total ?? 0 });
    default:
      return n.status === 'complete' ? t('unraveling.status.complete') : '';
  }
}

// ── Status marks (shape, not hue: Ink's four status colours are all #151515) ──

/** Solid = complete, half = partial, hollow = not built. */
function StatusMark({
  status,
  size = 8,
  onFill = false,
}: Readonly<{ status: NodeStatus; size?: number; onFill?: boolean }>) {
  return (
    <span
      className={`bo-mark is-${status}${onFill ? ' is-on-fill' : ''}`}
      style={{ width: size, height: size }}
      aria-hidden="true"
    />
  );
}

function StatusBadge({ status, label }: Readonly<{ status: NodeStatus; label: string }>) {
  return (
    <span className={`bo-statbadge ${status}`}>
      <StatusMark status={status} onFill />
      {label}
    </span>
  );
}

/** SVG twin of StatusMark, drawn on the node's own fill (so it uses the status
 *  fg colour, which Ink flips to white on its solid complete fill). */
function SvgStatusMark({
  status,
  cx,
  cy,
}: Readonly<{ status: NodeStatus; cx: number; cy: number }>) {
  const r = 3.5;
  const fg = `var(--status-${status}-fg)`;
  if (status === 'complete') {
    return <circle cx={cx} cy={cy} r={r} fill={fg} stroke={fg} strokeWidth={1} />;
  }
  if (status === 'partial') {
    return (
      <g>
        <circle cx={cx} cy={cy} r={r} fill="none" stroke={fg} strokeWidth={1} />
        <path d={`M${cx} ${cy - r} A${r} ${r} 0 0 0 ${cx} ${cy + r}Z`} fill={fg} />
      </g>
    );
  }
  return <circle cx={cx} cy={cy} r={r} fill="none" stroke={fg} strokeWidth={1} />;
}

// ── Selection (B 區) ──────────────────────────────────────────────────────────

interface Selection {
  nodeId: string;
  /** Transitive upstream — "I need these". */
  chain: Set<string>;
  /** Direct neighbours, both directions. */
  neighbors: Set<string>;
  /** What a rerun of the selected node deletes (built nodes only). */
  dropped: BuildOverviewNode[];
}

function selectionOf(manifest: BuildOverviewManifest, nodeId: string | null): Selection | null {
  if (!nodeId) return null;
  return {
    nodeId,
    chain: new Set(upstreamChain(manifest.edges, nodeId)),
    neighbors: new Set(neighborIds(manifest.edges, nodeId)),
    dropped: droppedNodes(nodeId, manifest.nodes),
  };
}

// ── DAG: nodes ────────────────────────────────────────────────────────────────

interface DagNodeProps {
  node: BuildOverviewNode;
  sub: string;
  label: string;
  selection: Selection | null;
  onSelect: (id: string) => void;
  t: TFunction;
}

function DagNode({ node, sub, label, selection, onSelect, t }: Readonly<DagNodeProps>) {
  const box = nodeBox(node.nodeId);
  if (!box) return null;
  const { x, y } = box;
  const id = node.nodeId;

  const isSelected = selection?.nodeId === id;
  const isDrop = !!selection && selection.dropped.some((d) => d.nodeId === id);
  const isUp = !!selection && !isSelected && selection.chain.has(id);
  const lit =
    !selection || isSelected || isDrop || isUp || selection.neighbors.has(id);

  const fg = `var(--status-${node.status}-fg)`;
  const isSource = node.layer === 0;
  const textX = x + (isSource ? 24 : 10);
  let stroke = `var(--status-${node.status}-border)`;
  if (isDrop) stroke = 'var(--color-error)';
  else if (isUp) stroke = 'var(--accent)';

  return (
    <g
      className="bo-node"
      opacity={lit ? 1 : 0.3}
      role="button"
      tabIndex={0}
      aria-label={`${label} · ${t(`unraveling.status.${node.status}`)}`}
      aria-pressed={isSelected}
      onClick={() => onSelect(id)}
      onKeyDown={(e) => {
        if (e.key === 'Enter' || e.key === ' ') {
          e.preventDefault();
          onSelect(id);
        }
      }}
    >
      {isSelected && (
        <rect
          x={x - 4}
          y={y - 4}
          width={NODE_W + 8}
          height={NODE_H + 8}
          rx={8}
          fill="none"
          stroke="var(--accent)"
          strokeWidth={2}
        />
      )}
      <rect
        className="bo-node-box"
        x={x}
        y={y}
        width={NODE_W}
        height={NODE_H}
        rx={4}
        fill={`var(--status-${node.status}-bg)`}
        stroke={stroke}
        strokeWidth={isDrop || isUp ? 1.5 : 1}
        strokeDasharray={isDrop ? '4 3' : undefined}
      />
      <SvgStatusMark status={node.status} cx={x + NODE_W - 10} cy={y + 10} />
      {isSource && (
        <path d={`M${x + 12} ${y + 12} l5 6 -5 6 -5 -6z`} fill="none" stroke={fg} strokeWidth={1.2} />
      )}
      <text className="bo-node-label" x={textX} y={y + 15} fill={fg}>
        {label}
      </text>
      <text
        className={`bo-node-count${isDrop ? ' is-struck' : ''}`}
        x={textX}
        y={y + 29}
        fill={fg}
      >
        {sub}
      </text>
      {isDrop && (
        <text
          className="bo-node-drop"
          x={x + NODE_W - 8}
          y={y + 29}
          textAnchor="end"
          fill="var(--color-error)"
        >
          {t('unraveling.selection.willDelete')}
        </text>
      )}
    </g>
  );
}

// ── DAG canvas ────────────────────────────────────────────────────────────────

interface DagCanvasProps {
  manifest: BuildOverviewManifest;
  selection: Selection | null;
  pendingConcepts?: number;
  onSelect: (id: string | null) => void;
}

function DagCanvas({ manifest, selection, pendingConcepts, onSelect }: Readonly<DagCanvasProps>) {
  const { t } = useTranslation('analysis');
  const laid = useMemo(() => layoutEdges(manifest.edges), [manifest.edges]);

  const kgLit =
    !selection ||
    KG_CHILD_IDS.has(selection.nodeId) ||
    [...KG_CHILD_IDS].some((c) => selection.chain.has(c) || selection.neighbors.has(c));
  const backBox = nodeBox('kg_temporal_relation');
  const sourceNodes = manifest.nodes.filter((n) => n.layer === 0 && nodeBox(n.nodeId));

  return (
    <div className="bo-svgbox">
      <svg
        className="bo-svg"
        viewBox={`0 0 ${SVG_W} ${SVG_H}`}
        width="100%"
        onClick={(e) => {
          // Background click clears selection
          if (e.target === e.currentTarget) onSelect(null);
        }}
      >
        {/* KG feature group — one rerun fills all of it */}
        <g opacity={kgLit ? 1 : 0.5}>
          <rect
            x={KG_GROUP_BOX.x}
            y={KG_GROUP_BOX.y}
            width={KG_GROUP_BOX.w}
            height={KG_GROUP_BOX.h}
            rx={6}
            fill="none"
            stroke="var(--border)"
            strokeWidth={1}
            strokeDasharray="3 3"
          />
          <text className="bo-svg-note" x={KG_GROUP_BOX.x + 4} y={KG_GROUP_BOX.y - 2}>
            {t('unraveling.dag.kgGroup')}
          </text>
        </g>

        {/* Edges. Failure scope is a per-trigger table, not a walk along edges,
            so edges never turn red: only the upstream chain and the direct
            links to the selected node are drawn differently. */}
        {laid.map((e) => {
          const role = selection ? edgeRole(manifest.edges[e.index], selection.nodeId, selection.chain) : 'rest';
          let stroke = 'var(--border)';
          if (role === 'up') stroke = 'var(--accent)';
          else if (role === 'link') stroke = 'var(--fg-secondary)';
          let opacity: number;
          if (selection) opacity = role === 'rest' ? 0.14 : 1;
          else if (e.kind === 'back') opacity = 0.7;
          else opacity = e.spansColumns ? 0.3 : 0.55;
          return (
            <path
              key={`${e.source}-${e.target}-${e.index}`}
              d={e.d}
              fill="none"
              stroke={stroke}
              strokeWidth={role === 'rest' ? 1 : 1.5}
              strokeDasharray={e.kind === 'back' ? '5 3' : undefined}
              strokeLinejoin="round"
              opacity={opacity}
            />
          );
        })}

        {/* The one edge that runs against the columns: eep → kg_temporal_relation */}
        {backBox && laid.some((e) => e.kind === 'back') && (
          <g opacity={selection ? 0.35 : 1}>
            <path
              d={`M${COLUMN_CX[1] - 4} ${backBox.y + NODE_H + 8} L${COLUMN_CX[1]} ${backBox.y + NODE_H} L${COLUMN_CX[1] + 4} ${backBox.y + NODE_H + 8}`}
              fill="none"
              stroke="var(--border)"
              strokeWidth={1.2}
            />
            <text className="bo-svg-note" x={COLUMN_CX[1] + 32} y={BACK_EDGE_Y + 13}>
              {t('unraveling.dag.backEdge')}
            </text>
          </g>
        )}

        {manifest.nodes.map((n) => (
          <DagNode
            key={n.nodeId}
            node={n}
            label={nodeLabel(t, n)}
            sub={nodeSubLabel(t, n, pendingConcepts)}
            selection={selection}
            onSelect={onSelect}
            t={t}
          />
        ))}
      </svg>

      {/* The L0 diamond explains itself. An SVG shape cannot host the shared
          Tooltip (it is a DOM span), so a transparent hit area sits over it. */}
      {sourceNodes.map((n) => {
        const box = nodeBox(n.nodeId)!;
        return (
          <span
            key={n.nodeId}
            className="bo-diahit"
            style={{
              left: `${((box.x + 4) / SVG_W) * 100}%`,
              top: `${((box.y + 4) / SVG_H) * 100}%`,
            }}
          >
            <Tooltip label={t('unraveling.layer.sourceHint')}>
              <span className="bo-diahit-inner" onClick={() => onSelect(n.nodeId)} />
            </Tooltip>
          </span>
        );
      })}
    </div>
  );
}

// ── Summary strip（完成度總覽收成一列） ───────────────────────────────────────

function SummaryStrip({ manifest }: Readonly<{ manifest: BuildOverviewManifest }>) {
  const { t } = useTranslation('analysis');
  const ov = aggregate(manifest.nodes);
  const segments: { status: NodeStatus; count: number; label: string }[] = [
    { status: 'complete', count: ov.complete, label: t('unraveling.summary.complete') },
    { status: 'partial', count: ov.partial, label: t('unraveling.summary.partial') },
    { status: 'empty', count: ov.empty, label: t('unraveling.summary.empty') },
  ];

  return (
    <div className="bo-summary">
      <div className="bo-summary-left">
        <span className="bo-eyebrow">{t('unraveling.summary.eyebrow')}</span>
        <div className="bo-summary-figure">
          <span className="bo-pct">{scorePct(ov)}%</span>
          <span className="bo-rule">
            {t('unraveling.summary.completionRule', { done: ov.complete, total: ov.total })}
          </span>
        </div>
      </div>
      <div className="bo-summary-right">
        <div className="bo-bar">
          {segments
            .filter((s) => s.count > 0)
            .map((s) => (
              <div
                key={s.status}
                className="bo-bar-seg"
                style={{
                  flex: s.count,
                  background: `var(--status-${s.status}-bg)`,
                  borderColor: `var(--status-${s.status}-border)`,
                }}
              />
            ))}
        </div>
        <div className="bo-legend">
          {segments.map((s) => (
            <span key={s.status} className="bo-legend-item">
              <StatusMark status={s.status} />
              <span className="bo-num">
                {s.count} {s.label}
              </span>
            </span>
          ))}
          <span className="bo-legend-total">{t('unraveling.summary.totalNodes', { n: ov.total })}</span>
        </div>
      </div>
    </div>
  );
}

// ── DAG column heads（五層卡片下沉成欄頭） ────────────────────────────────────

function LayerHeads({ manifest }: Readonly<{ manifest: BuildOverviewManifest }>) {
  const { t } = useTranslation('analysis');
  return (
    <div className="bo-heads">
      {LAYERS.map((layer) => {
        const lp = layerProgress(manifest.nodes, layer);
        return (
          <div key={layer} className="bo-head">
            <span className="bo-head-name">
              L{layer} · {t(`unraveling.layer.${layer}`)}
            </span>
            <span className="bo-head-count">
              {lp.complete}/{lp.total}
              {lp.partial > 0 && ` · ${lp.partial} ${t('unraveling.summary.partial')}`}
            </span>
            <div className="bo-head-bar">
              <div className="bo-head-fill" style={{ width: `${lp.score * 100}%` }} />
            </div>
          </div>
        );
      })}
    </div>
  );
}

// ── Selection legend + clear ──────────────────────────────────────────────────

function SelectionBar({
  selection,
  onClear,
}: Readonly<{ selection: Selection; onClear: () => void }>) {
  const { t } = useTranslation('analysis');
  return (
    <div className="bo-selbar">
      <div className="bo-selbar-legend">
        <span className="bo-selbar-item">
          <span className="bo-swatch is-up" aria-hidden="true" />
          {t('unraveling.selection.upstreamCount', { n: selection.chain.size })}
        </span>
        {selection.dropped.length > 0 && (
          <span className="bo-selbar-item is-drop">
            <span className="bo-swatch is-drop" aria-hidden="true" />
            {t('unraveling.cta.confirm.dropsDownstream', { n: selection.dropped.length })}
          </span>
        )}
      </div>
      <button type="button" className="ss-btn ss-btn-sm ss-btn-secondary" onClick={onClear}>
        {t('unraveling.toolbar.clearSelection')}
      </button>
    </div>
  );
}

// ── Inspector — layer list ────────────────────────────────────────────────────

interface LayerListProps {
  manifest: BuildOverviewManifest;
  pendingConcepts?: number;
  onSelect: (nodeId: string) => void;
}

function LayerList({ manifest, pendingConcepts, onSelect }: Readonly<LayerListProps>) {
  const { t } = useTranslation('analysis');
  return (
    <div className="bo-list">
      {LAYERS.map((layer) => {
        const nodes = manifest.nodes
          .filter((n) => n.layer === layer)
          .sort((a, b) => (nodeBox(a.nodeId)?.row ?? 0) - (nodeBox(b.nodeId)?.row ?? 0));
        // 「已析」只算完整的節點。
        const analyzed = nodes.filter((n) => n.status === 'complete').length;
        return (
          <div key={layer} className="bo-lgroup">
            <div className="bo-lgroup-head">
              <span className="bo-lgroup-name">
                L{layer} · {t(`unraveling.layer.${layer}`)}
              </span>
              <span className="bo-num">
                {t('unraveling.layerList.counts', { n: nodes.length, done: analyzed })}
              </span>
            </div>
            <div className="bo-rows">
              {nodes.map((n) => (
                <button
                  key={n.nodeId}
                  type="button"
                  className="bo-row"
                  onClick={() => onSelect(n.nodeId)}
                >
                  <span className="bo-row-lead" aria-hidden="true">
                    {layer === 0 && (
                      <svg width="12" height="12" viewBox="0 0 12 12" fill="none" stroke="currentColor" strokeWidth="1.2">
                        <path d="M6 1l4 5-4 5-4-5z" />
                      </svg>
                    )}
                  </span>
                  <span className="bo-row-name">{nodeLabel(t, n)}</span>
                  <span className={`bo-row-sub${n.status === 'empty' ? ' is-empty' : ''}`}>
                    {nodeSubLabel(t, n, pendingConcepts)}
                  </span>
                  <span className="bo-row-mark">
                    <StatusMark status={n.status} />
                  </span>
                </button>
              ))}
            </div>
          </div>
        );
      })}
    </div>
  );
}

// ── Inspector — chapter distribution ──────────────────────────────────────────

function ChapterDistMini({ values }: Readonly<{ values: number[] }>) {
  if (values.length === 0) return null;
  const max = Math.max(1, ...values);
  return (
    <div className="bo-distbox">
      <div className="bo-dist">
        {values.map((v, i) => (
          <Tooltip key={i} label={`Ch.${i + 1}: ${v}`}>
            <span
              className={`bo-dist-bar${v === 0 ? ' is-zero' : ''}`}
              style={{ height: `${(v / max) * 100}%` }}
            />
          </Tooltip>
        ))}
      </div>
      <div className="bo-dist-axis">
        <span>Ch.1</span>
        <span>Ch.{values.length}</span>
      </div>
    </div>
  );
}

// ── Inferred concept review (B-092 · E 區) ────────────────────────────────────
//
// Propositions the LLM inferred wait in a side-store rather than going straight
// into the graph: TEU assembly reads Concept nodes into its prompt as
// established fact, so a wrong one would keep being handed forward as a
// premise. This is where someone rules on them — the same place the run is
// triggered, so the result is visible where the button was.
//
// Both buttons write data and cost nothing, so neither carries the LLM glyph.
// Adopting is idempotent (plain secondary); dismissing is permanent (danger).

function InferredConceptReview({ bookId }: Readonly<{ bookId: string }>) {
  const { t } = useTranslation('analysis');
  const queryClient = useQueryClient();
  const [open, setOpen] = useState(true);

  const { data, isLoading } = useQuery({
    queryKey: qk.inferredConcepts.pending(bookId),
    queryFn: () => fetchInferredConcepts(bookId, 'pending'),
  });

  const settle = () => {
    void queryClient.invalidateQueries({ queryKey: qk.inferredConcepts.all(bookId) });
    // Adopting writes a Concept node, so the node's own counts move too.
    void queryClient.invalidateQueries({ queryKey: ['buildOverview', bookId] });
  };

  const adopt = useMutation({
    mutationFn: (conceptId: string) => confirmInferredConcept(bookId, conceptId),
    onSuccess: settle,
  });
  const dismiss = useMutation({
    mutationFn: (conceptId: string) => rejectInferredConcept(bookId, conceptId),
    onSuccess: settle,
  });

  const items = data?.items ?? [];
  if (isLoading || items.length === 0) return null;

  const busy = adopt.isPending || dismiss.isPending;

  return (
    <div className="bo-section">
      <div className="bo-queue-head">
        <span className="bo-queue-title">{t('unraveling.concepts.pendingTitle', { n: items.length })}</span>
        <button
          type="button"
          className="bo-queue-toggle"
          aria-expanded={open}
          onClick={() => setOpen((o) => !o)}
        >
          {open ? t('unraveling.concepts.collapse') : t('unraveling.concepts.expand')}
        </button>
      </div>
      {open && (
        <>
          <p className="bo-queue-note">{t('unraveling.concepts.rejectPermanent')}</p>
          <div className="bo-queue">
            {items.map((c) => (
              <div key={c.id} className="bo-concept">
                <div className="bo-concept-head">
                  <span className="bo-concept-name">{c.name}</span>
                  <span className="bo-concept-conf">
                    {t('unraveling.concepts.confidence', { v: Math.round(c.confidence * 100) })}
                  </span>
                </div>
                {c.description && <p className="bo-concept-desc">{c.description}</p>}
                {c.evidence.length > 0 && (
                  <div className="bo-evidence">
                    {c.evidence.map((e) => (
                      <div key={e} className="bo-evidence-row">
                        <span className="bo-evidence-dot" aria-hidden="true">·</span>
                        <span>{e}</span>
                      </div>
                    ))}
                  </div>
                )}
                <div className="bo-concept-actions">
                  <button
                    type="button"
                    className="ss-btn ss-btn-sm ss-btn-secondary"
                    disabled={busy}
                    onClick={() => adopt.mutate(c.id)}
                  >
                    {t('unraveling.concepts.adopt')}
                  </button>
                  <button
                    type="button"
                    className="ss-btn ss-btn-sm ss-btn-danger"
                    disabled={busy}
                    onClick={() => dismiss.mutate(c.id)}
                  >
                    {t('unraveling.concepts.dismiss')}
                  </button>
                </div>
              </div>
            ))}
          </div>
        </>
      )}
    </div>
  );
}

// ── Inspector — node detail（六態） ───────────────────────────────────────────

interface NodeDetailProps {
  node: BuildOverviewNode;
  bookId: string;
  manifest: BuildOverviewManifest;
  chapterDist?: number[];
  onSelectNode: (nodeId: string) => void;
}

function Note({ children }: Readonly<{ children: ReactNode }>) {
  return (
    <div className="bo-note">
      <Info size={12} className="bo-note-icon" aria-hidden="true" />
      <span>{children}</span>
    </div>
  );
}

function NodeDetail({
  node, bookId, manifest, chapterDist, onSelectNode,
}: Readonly<NodeDetailProps>) {
  const { t } = useTranslation('analysis');
  const queryClient = useQueryClient();
  const statusLabel = t(`unraveling.status.${node.status}`);
  const blockers = blockersOf(node.nodeId, manifest.nodes, manifest.edges);
  const mode = actionModeFor(node, blockers.length);
  const route = NODE_TO_ROUTE[node.nodeId];

  const triggerKey = triggerKeyOf(node.nodeId);
  const danger = dropsDerived(node.nodeId);
  const dropped = droppedNodes(node.nodeId, manifest.nodes);
  const peers = sharedTriggerPeers(node.nodeId);

  const [confirmOpen, setConfirmOpen] = useState(false);
  const [taskId, setTaskId] = useState<string | null>(null);
  const [triggerFailure, setTriggerFailure] = useState<unknown>(null);
  const { data: task } = useTaskPolling(taskId);

  // Derived rather than stored: the task's own status already says whether the
  // run is over, so clearing taskId on completion would only duplicate it (and
  // stop the polling query from reporting how it ended). Polling halts on its
  // own once the status is terminal.
  const taskStatus = task?.status;
  const running = taskId !== null && taskStatus !== 'done' && taskStatus !== 'error';
  // The app's own 503 (no LLM provider) is a state of the feature, not a failed
  // run: it gets its own in-place notice and the rest of the panel stays put.
  const llmBlocked = isLlmUnconfigured(triggerFailure);
  const failed = !llmBlocked && (triggerFailure !== null || taskStatus === 'error');
  // The task's error is a free string with no status or reason, so the
  // 「供應商回傳 {status}」 line cannot be built (4-UN-7); keep the raw text as
  // technical detail rather than dropping what the old panel showed.
  const failTech = triggerFailure !== null ? techDetailOf(triggerFailure) : task?.error ?? undefined;

  useEffect(() => {
    if (taskStatus !== 'done') return;
    // The manifest is where the whole page reads node status from, so refetch
    // it rather than patching the one node we know changed.
    void queryClient.invalidateQueries({ queryKey: ['buildOverview', bookId] });
  }, [taskStatus, queryClient, bookId]);

  const handleConfirm = async () => {
    if (!triggerKey) return;
    setConfirmOpen(false);
    setTriggerFailure(null);
    setTaskId(null);
    try {
      const { taskId: id } = await TRIGGER_RUN[triggerKey](bookId);
      setTaskId(id);
    } catch (e) {
      setTriggerFailure(e);
    }
  };

  // Node-specific copy ("補齊剩餘章節摘要"), falling back to a generic phrasing
  // for nodes whose CTA has no dedicated line yet. A complete node keeps the
  // "continue" wording: it can still be rerun.
  const ctaState = ctaStateFor(node.status);
  const ctaLabel = t(`unraveling.cta.node.${node.nodeId}.${ctaState}`, {
    defaultValue: t(`unraveling.cta.generic.${ctaState}`),
  });

  const triggerButton = (variant: 'primary' | 'secondary') => (
    <button
      type="button"
      className={`ss-btn ss-btn-md ${danger ? 'ss-btn-danger' : `ss-btn-${variant}`} ss-btn-llm bo-wide`}
      onClick={() => setConfirmOpen(true)}
    >
      {ctaLabel}
    </button>
  );

  const goTo = route ? (
    <Link to={`/books/${bookId}/${route}`} className="bo-goto">
      <ArrowUpRight size={12} aria-hidden="true" />
      {t('unraveling.detail.openPage')}
    </Link>
  ) : (
    <span className="bo-goto is-planned">
      <ArrowUpRight size={12} aria-hidden="true" />
      {t('unraveling.detail.openPage')} · {t('unraveling.openPageNotImplemented')}
    </span>
  );

  const metaEntries = Object.entries(node.meta);

  let action: ReactNode = null;
  if (running) {
    // 建構中只留 spinner：任務 API 不即時回報進度，不顯示 stage／%。
    action = (
      <div className="bo-box is-running" role="status">
        <Loader2 size={14} className="animate-spin bo-box-spin" aria-hidden="true" />
        <span className="bo-box-title">{t('unraveling.cta.running')}</span>
      </div>
    );
  } else if (mode === 'hazard') {
    action = (
      <div className="bo-box is-hazard">
        <AlertTriangle size={13} className="bo-box-icon" aria-hidden="true" />
        <span className="bo-box-text">{t('unraveling.detail.blockedByHazard')}</span>
      </div>
    );
  } else if (mode === 'blocked') {
    action = (
      <div className="bo-box is-blocked">
        <span className="bo-box-title">{t('unraveling.detail.blockedTitle')}</span>
        <span className="bo-box-text">{t('unraveling.detail.blockedHint', { n: blockers.length })}</span>
        <div className="bo-chips">
          {blockers.map((b) => (
            <button
              key={b.nodeId}
              type="button"
              className="bo-chip"
              style={{ borderColor: `var(--status-${b.status}-border)` }}
              onClick={() => onSelectNode(b.nodeId)}
            >
              <StatusMark status={b.status} />
              <span>{nodeLabel(t, b)}</span>
              <span className="bo-chip-count">{nodeSubLabel(t, b)}</span>
              <span className="bo-chip-go" aria-hidden="true">→</span>
            </button>
          ))}
        </div>
        <button type="button" className="ss-btn ss-btn-md ss-btn-secondary bo-wide" disabled>
          {t('unraveling.detail.missingPrereq', { n: blockers.length })}
        </button>
      </div>
    );
  } else if (mode === 'soon') {
    action = (
      <button type="button" className="ss-btn ss-btn-md ss-btn-secondary bo-wide" disabled>
        {t('unraveling.detail.triggerSoon')}
      </button>
    );
  } else if (mode === 'trigger') {
    action = (
      <div className="bo-action">
        {llmBlocked && <LlmUnconfiguredNotice />}
        {failed ? (
          <div className="bo-box is-fail" role="alert">
            <span className="bo-box-title is-error">
              <AlertTriangle size={13} aria-hidden="true" />
              {t('unraveling.cta.failed')}
            </span>
            {failTech && <code className="bo-box-tech">{failTech}</code>}
            {triggerButton('secondary')}
          </div>
        ) : (
          triggerButton('primary')
        )}
        <span className="bo-cost">{t('tension.state.tokenHintShort')}</span>
      </div>
    );
  }

  return (
    <div className="bo-detail">
      <div className="bo-detail-head">
        <div className="bo-title-row">
          <span className="bo-title">{nodeLabel(t, node)}</span>
          <StatusBadge status={node.status} label={statusLabel} />
        </div>
        <span className="bo-detail-id">L{node.layer} · {node.nodeId}</span>
      </div>

      {mode === 'source' && <Note>{t('unraveling.layer.sourceHint')}</Note>}

      {chapterDist && chapterDist.length > 0 && (
        <div className="bo-section">
          <span className="bo-section-h">{t('unraveling.detail.chapterDist')}</span>
          <ChapterDistMini values={chapterDist} />
        </div>
      )}

      {peers.length > 0 && (
        <Note>
          {t('unraveling.detail.sharedTrigger', {
            names: peers.map((id) => t(`unraveling.node.${id}`)).join(t('unraveling.detail.nameJoin')),
          })}
        </Note>
      )}

      {mode === 'trigger' && !running && dropped.length > 0 && (
        <Note>{t('unraveling.cta.confirm.dropsDownstream', { n: dropped.length })}</Note>
      )}

      {action}

      {goTo}

      {node.nodeId === 'kg_concept_inferred' && <InferredConceptReview bookId={bookId} />}

      {mode !== 'source' && Object.keys(node.counts).length > 0 && (
        <div className="bo-section">
          <span className="bo-section-h">{t('unraveling.detail.rawCounts')}</span>
          <div className="bo-kv">
            {Object.entries(node.counts).map(([k, v]) => (
              <div key={k} className="bo-kv-row">
                <span className="bo-kv-key">{t(`unraveling.counts.${k}`, { defaultValue: k })}</span>
                <span className="bo-kv-val">{v}</span>
              </div>
            ))}
          </div>
        </div>
      )}

      {(metaEntries.length > 0 || mode === 'source') && (
        <div className="bo-section">
          <span className="bo-section-h">{t('unraveling.detail.meta')}</span>
          <div className="bo-kv">
            {metaEntries.length === 0 ? (
              <div className="bo-kv-row">
                <span className="bo-kv-val">—</span>
              </div>
            ) : (
              metaEntries.map(([k, v]) => (
                <div key={k} className="bo-kv-row">
                  <span className="bo-kv-key">{t(`unraveling.counts.${k}`, { defaultValue: k })}</span>
                  <span className="bo-kv-val">{metaValueText(v)}</span>
                </div>
              ))
            )}
          </div>
        </div>
      )}

      {/* The three dialogs differ in what they promise about downstream output:
          fill-a-gap says nothing is touched; a rerun that drops derived data
          lists what goes (the same table the canvas draws); a dangerous rerun
          with nothing to list says it overwrites. */}
      {triggerKey && (
        <ConfirmDialog
          open={confirmOpen}
          title={ctaLabel}
          message={
            !danger
              ? t('unraveling.cta.confirm.keepsDownstream')
              : dropped.length > 0
                ? t('unraveling.cta.confirm.affectsDownstream')
                : t('unraveling.cta.confirm.overwrites')
          }
          confirmLabel={ctaLabel}
          costHint={t('tension.state.tokenHintShort')}
          sections={
            danger
              ? [
                  {
                    title: t('unraveling.cta.confirm.dropsDownstream', { n: dropped.length }),
                    items: dropped.map((d) => `${nodeLabel(t, d)} · ${nodeSubLabel(t, d)}`),
                  },
                ]
              : undefined
          }
          danger={danger}
          spendsTokens
          onConfirm={() => void handleConfirm()}
          onCancel={() => setConfirmOpen(false)}
        />
      )}
    </div>
  );
}

// ── Loading skeleton（形狀已知：五欄固定、節點集寫死） ────────────────────────

function Skel({ w, h }: Readonly<{ w: string; h: number }>) {
  return <span className="bo-skel" style={{ width: w, height: h }} />;
}

function BuildOverviewSkeleton() {
  return (
    <div className="bo-inner" aria-busy="true" role="status">
      <div className="bo-summary">
        <Skel w="96px" h={28} />
        <Skel w="220px" h={10} />
      </div>
      <div className="bo-main">
        <div className="bo-dagpane">
          <div className="bo-heads">
            {LAYERS.map((l) => (
              <div key={l} className="bo-head">
                <Skel w="70%" h={9} />
                <Skel w="45%" h={8} />
                <Skel w="100%" h={4} />
              </div>
            ))}
          </div>
          <div className="bo-skel-cols">
            {[3, 6, 3, 5, 2].map((count, ci) => (
              <div key={ci} className="bo-skel-col">
                {Array.from({ length: count }, (_, ri) => (
                  <span key={ri} className="bo-skel bo-skel-node" />
                ))}
              </div>
            ))}
          </div>
        </div>
        <div className="bo-side">
          <div className="bo-skel-list">
            {Array.from({ length: 8 }, (_, i) => (
              <div key={i} className="bo-skel-row">
                <Skel w="7px" h={7} />
                <Skel w={`${45 + (i % 4) * 12}%`} h={8} />
              </div>
            ))}
          </div>
        </div>
      </div>
    </div>
  );
}

// ── Page ──────────────────────────────────────────────────────────────────────

export default function BuildOverviewPage() {
  const { bookId } = useParams<{ bookId: string }>();
  const { t } = useTranslation('analysis');
  const { t: tn } = useTranslation('nav');
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const sideBodyRef = useRef<HTMLDivElement>(null);

  const { data: manifest, isLoading, error, refetch } = useQuery({
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

  // The manifest carries no pending count for inferred concepts; the review
  // queue does. Same query key as the queue itself, so it is fetched once.
  const { data: pendingConcepts } = useQuery({
    queryKey: qk.inferredConcepts.pending(bookId ?? ''),
    queryFn: () => fetchInferredConcepts(bookId!, 'pending'),
    enabled: !!bookId,
  });
  const pendingCount = pendingConcepts?.items.length;

  const selection = useMemo(
    () => (manifest ? selectionOf(manifest, selectedId) : null),
    [manifest, selectedId],
  );

  // Picking another node (a blocker chip jumps to one) should show its top.
  useEffect(() => {
    sideBodyRef.current?.scrollTo?.({ top: 0 });
  }, [selectedId]);

  if (isLoading) {
    return (
      <div className="bo-page">
        <BuildOverviewSkeleton />
      </div>
    );
  }

  if (error) {
    return (
      <div className="bo-page">
        <div className="bo-inner">
          <PageFailure
            variant={failureKind(error)}
            pageName={tn('tabs.unraveling')}
            onRetry={() => void refetch()}
            secondaryAction={
              <Link to={`/books/${bookId}`} className="ss-btn ss-btn-md ss-btn-secondary">
                {t('character.error.backToBook')}
              </Link>
            }
            techDetail={techDetailOf(error)}
          />
        </div>
      </div>
    );
  }

  if (!manifest || !bookId) return null;

  const selectedNode = selectedId
    ? manifest.nodes.find((n) => n.nodeId === selectedId) ?? null
    : null;

  return (
    <div className="bo-page">
      <div className="bo-inner">
        <GuidanceRibbon surface="build-overview">
          <strong>{t('unraveling.guide.prefix')}</strong>{' '}
          <Trans i18nKey="unraveling.guide.body" ns="analysis" components={{ strong: <strong /> }} />
        </GuidanceRibbon>

        <SummaryStrip manifest={manifest} />

        <div className="bo-main">
          <div className="bo-dagpane">
            <div className="bo-dagscroll">
              <div className="bo-dagwrap">
                <LayerHeads manifest={manifest} />
                {selection && (
                  <SelectionBar selection={selection} onClear={() => setSelectedId(null)} />
                )}
                <DagCanvas
                  manifest={manifest}
                  selection={selection}
                  pendingConcepts={pendingCount}
                  onSelect={setSelectedId}
                />
              </div>
            </div>
          </div>

          <aside className="bo-side">
            <div className="bo-side-head">
              <span className="bo-side-title">
                {selectedNode ? t('unraveling.inspector.nodeDetail') : t('unraveling.inspector.layerList')}
              </span>
              {selectedNode ? (
                <button type="button" className="bo-back" onClick={() => setSelectedId(null)}>
                  <ArrowLeft size={12} aria-hidden="true" />
                  {t('unraveling.inspector.backToList')}
                </button>
              ) : (
                <span className="bo-side-meta">
                  {t('unraveling.inspector.nodeCount', { n: manifest.nodes.length })}
                </span>
              )}
            </div>
            <div className="bo-side-body" ref={sideBodyRef}>
              {selectedNode ? (
                <NodeDetail
                  // Keyed so switching nodes resets the CTA state — otherwise a
                  // run started on one node reads as running on the next.
                  key={selectedNode.nodeId}
                  node={selectedNode}
                  bookId={bookId}
                  manifest={manifest}
                  chapterDist={chapterDist?.distributions[selectedNode.nodeId]}
                  onSelectNode={setSelectedId}
                />
              ) : (
                <LayerList manifest={manifest} pendingConcepts={pendingCount} onSelect={setSelectedId} />
              )}
            </div>
          </aside>
        </div>
      </div>
    </div>
  );
}
