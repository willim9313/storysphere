import { useEffect, useRef, useState } from 'react';
import { useParams } from 'react-router-dom';
import { useQuery } from '@tanstack/react-query';
import { X } from 'lucide-react';
import cytoscape from 'cytoscape';
import { LoadingSpinner } from '@/components/ui/LoadingSpinner';
import { ErrorMessage } from '@/components/ui/ErrorMessage';
import {
  fetchUnraveling,
  type NodeStatus,
  type UnravelingManifest,
  type UnravelingNode,
} from '@/api/unraveling';

// ── Layout constants ──────────────────────────────────────────────────────────

// X positions per layer
const LAYER_X: Record<number, number> = { 0: 100, 1: 320, 2: 580, 3: 780, 4: 980 };
// KG compound group sits in the same vertical column as Layer 1 (below summaries/keywords)
const KG_CHILD_X = LAYER_X[1];
const NODE_Y_SPACING = 85;
const CANVAS_CENTER_Y = 320;
// Gap between Layer 1 regular nodes and the KG group below them
// (needs to accommodate the "KG Features" label that sits above the group box)
const KG_VERTICAL_GAP = 110;

// KG compound group node ID
const KG_GROUP_ID = 'kg_features';
// Node IDs that are children of the KG group
const KG_CHILD_IDS = new Set(['kg_entity', 'kg_concept', 'kg_relation', 'kg_event', 'kg_temporal_relation']);

// ── Status colour palette ─────────────────────────────────────────────────────

const STATUS: Record<NodeStatus, { bg: string; border: string; text: string }> = {
  complete: { bg: '#f0fdf4', border: '#22c55e', text: '#15803d' },
  partial:  { bg: '#fffbeb', border: '#f59e0b', text: '#92400e' },
  empty:    { bg: '#f3f4f6', border: '#d1d5db', text: '#6b7280' },
};

const STATUS_LABEL: Record<NodeStatus, string> = {
  complete: 'complete',
  partial:  'partial',
  empty:    'empty',
};

// ── Cytoscape stylesheet ──────────────────────────────────────────────────────

const STYLESHEET: cytoscape.Stylesheet[] = [
  // Compound group node (KG Features)
  {
    selector: `#${KG_GROUP_ID}`,
    style: {
      shape: 'round-rectangle',
      'background-color': '#f5ede0',
      'background-opacity': 0.6,
      'border-color': '#8b7355',
      'border-width': 2.5,
      'border-style': 'dashed',
      label: 'data(label)',
      'text-valign': 'top',
      'text-halign': 'center',
      'text-margin-y': -18,
      'font-size': 18,
      'font-weight': 'bold',
      color: '#5c4a32',
      padding: 26,
    } as cytoscape.Css.Node,
  },
  // Regular nodes
  {
    selector: `node:not(#${KG_GROUP_ID})`,
    style: {
      shape: 'data(shape)',
      width: 120,
      height: 52,
      'background-color': 'data(bgColor)',
      'border-color': 'data(borderColor)',
      'border-width': 2,
      label: 'data(label)',
      'text-valign': 'center',
      'text-halign': 'center',
      'text-wrap': 'wrap',
      'text-max-width': '108',
      'font-size': 10,
      color: 'data(textColor)',
      'font-family': 'var(--font-sans, sans-serif)',
    } as cytoscape.Css.Node,
  },
  {
    selector: 'node:selected',
    style: {
      'border-width': 3,
      'border-color': '#8b5e3c',
    } as cytoscape.Css.Node,
  },
  {
    selector: 'edge',
    style: {
      'curve-style': 'bezier',
      'target-arrow-shape': 'triangle',
      'line-color': '#d4c8b8',
      'target-arrow-color': '#d4c8b8',
      width: 1.5,
    } as cytoscape.Css.Edge,
  },
  // Highlighted node (the tapped node + its direct neighbors)
  {
    selector: 'node.highlighted',
    style: {
      'border-width': 3,
      'border-color': '#8b5e3c',
    } as cytoscape.Css.Node,
  },
  // Highlighted edge (connected to tapped node)
  {
    selector: 'edge.highlighted',
    style: {
      'line-color': '#8b5e3c',
      'target-arrow-color': '#8b5e3c',
      width: 2.5,
    } as cytoscape.Css.Edge,
  },
  // Faded — everything not related to the tapped node
  {
    selector: '.faded',
    style: {
      opacity: 0.25,
    } as cytoscape.Css.Node,
  },
];

// ── Shape per layer ───────────────────────────────────────────────────────────

const LAYER_SHAPE: Record<number, string> = {
  0: 'diamond',
  1: 'rectangle',
  2: 'round-rectangle',
  3: 'round-rectangle',
  4: 'round-rectangle',
};

// ── Sublabel helpers ──────────────────────────────────────────────────────────

function getSubLabel(n: UnravelingNode): string {
  if (n.status === 'empty') return 'not built';
  const check = n.status === 'complete' ? ' ✓' : '';
  switch (n.nodeId) {
    case 'summaries':
    case 'keywords':
      return `${n.counts.generated ?? 0} / ${n.counts.total ?? 0}${check}`;
    case 'cep':
    case 'character_analysis_result':
      return `${n.counts.analyzed ?? 0} / ${n.counts.total_characters ?? 0}`;
    case 'eep':
    case 'causality_analysis':
    case 'impact_analysis':
      return `${n.counts.analyzed ?? 0} / ${n.counts.total_events ?? 0}`;
    case 'teu':
      return `${n.counts.analyzed ?? 0} / ${n.counts.total_events ?? 0}`;
    case 'kg_temporal_relation':
    case 'chronological_rank':
      return `${n.counts.events_ranked ?? 0} ranked${check}`;
    case 'kg_event':
      return `${n.counts.events ?? 0} events`;
    case 'kg_entity':
      return `${n.counts.total ?? 0} entities`;
    case 'kg_concept':
      return `${n.counts.total ?? 0} concepts`;
    case 'kg_relation':
      return `${n.counts.relations ?? 0} relations`;
    default:
      return '';
  }
}

// ── Element builder ───────────────────────────────────────────────────────────

function buildElements(
  manifest: UnravelingManifest,
): cytoscape.ElementDefinition[] {
  // Separate KG children from regular nodes
  const regularNodes = manifest.nodes.filter(n => !KG_CHILD_IDS.has(n.nodeId));
  const kgChildren = manifest.nodes.filter(n => KG_CHILD_IDS.has(n.nodeId));

  // Group regular nodes by layer for vertical centering
  const byLayer: Record<number, UnravelingNode[]> = {};
  for (const node of regularNodes) {
    byLayer[node.layer] = byLayer[node.layer] ?? [];
    byLayer[node.layer].push(node);
  }

  // Layer 1 is a special column: regular nodes on top + KG compound group below
  const layer1Regular = byLayer[1] ?? [];
  const layer1TotalCount = layer1Regular.length + kgChildren.length;
  const layer1ColumnHeight =
    (layer1TotalCount - 1) * NODE_Y_SPACING + KG_VERTICAL_GAP;
  const layer1TopY = CANVAS_CENTER_Y - layer1ColumnHeight / 2;

  // Regular node elements
  const regularEls: cytoscape.ElementDefinition[] = regularNodes.map((n) => {
    let y: number;
    if (n.layer === 1) {
      const idx = layer1Regular.indexOf(n);
      y = layer1TopY + idx * NODE_Y_SPACING;
    } else {
      const layerNodes = byLayer[n.layer];
      const idx = layerNodes.indexOf(n);
      const total = layerNodes.length;
      y = CANVAS_CENTER_Y + (idx - (total - 1) / 2) * NODE_Y_SPACING;
    }
    const { bg, border, text } = STATUS[n.status];
    const sub = getSubLabel(n);
    const label = sub ? `${n.label}\n${sub}` : n.label;

    return {
      data: {
        id: n.nodeId,
        label,
        shape: LAYER_SHAPE[n.layer] ?? 'round-rectangle',
        bgColor: bg,
        borderColor: border,
        textColor: text,
        nodeData: n,
      },
      position: { x: LAYER_X[n.layer] ?? 100, y },
    };
  });

  // KG compound group (parent)
  const groupEl: cytoscape.ElementDefinition = {
    data: { id: KG_GROUP_ID, label: 'KG Features' },
  };

  // KG child nodes — stacked below Layer 1 regular nodes, same x column
  const kgStartY =
    layer1TopY + layer1Regular.length * NODE_Y_SPACING + KG_VERTICAL_GAP;
  const kgChildEls: cytoscape.ElementDefinition[] = kgChildren.map((n, idx) => {
    const y = kgStartY + idx * NODE_Y_SPACING;
    const { bg, border, text } = STATUS[n.status];
    const sub = getSubLabel(n);
    const label = sub ? `${n.label}\n${sub}` : n.label;

    return {
      data: {
        id: n.nodeId,
        parent: KG_GROUP_ID,
        label,
        shape: 'rectangle',
        bgColor: bg,
        borderColor: border,
        textColor: text,
        nodeData: n,
      },
      position: { x: KG_CHILD_X, y },
    };
  });

  const edgeEls: cytoscape.ElementDefinition[] = manifest.edges.map(
    (e, i) => ({
      data: { id: `e${i}`, source: e.source, target: e.target },
    }),
  );

  return [...regularEls, groupEl, ...kgChildEls, ...edgeEls];
}

// ── Canvas component ──────────────────────────────────────────────────────────

interface CanvasProps {
  elements: cytoscape.ElementDefinition[];
  onNodeTap: (node: UnravelingNode) => void;
}

function UnravelingCanvas({ elements, onNodeTap }: Readonly<CanvasProps>) {
  const containerRef = useRef<HTMLDivElement>(null);
  const cyRef = useRef<cytoscape.Core | null>(null);
  const onTapRef = useRef(onNodeTap);
  onTapRef.current = onNodeTap;

  useEffect(() => {
    if (!containerRef.current || !elements.length) return;

    const cy = cytoscape({
      container: containerRef.current,
      elements,
      style: STYLESHEET,
      layout: { name: 'preset' },
      userZoomingEnabled: true,
      userPanningEnabled: true,
      minZoom: 0.3,
      maxZoom: 3,
    });

    cy.fit(undefined, 48);

    const clearHighlight = () => {
      cy.elements().removeClass('highlighted faded');
    };

    cy.on('tap', 'node', (evt) => {
      const node = evt.target as cytoscape.NodeSingular;

      // KG compound group: highlight group + all its children + their connected edges
      let targets: cytoscape.Collection = node;
      if (node.id() === KG_GROUP_ID || node.isParent()) {
        targets = node.children();
      }

      const connectedEdges = targets.connectedEdges();
      const neighborNodes = connectedEdges.connectedNodes();
      const highlightSet = targets.union(neighborNodes).union(connectedEdges);

      cy.elements().addClass('faded');
      highlightSet.removeClass('faded').addClass('highlighted');
      // Keep the compound group itself visible (not faded) when a child is highlighted
      if (targets.parents().length) {
        targets.parents().removeClass('faded');
      }

      const nodeData = node.data('nodeData') as UnravelingNode | undefined;
      if (nodeData) onTapRef.current(nodeData);
    });

    cy.on('tap', (evt) => {
      if (evt.target === cy) clearHighlight();
    });

    cyRef.current = cy;

    const ro = new ResizeObserver(() => cy.resize());
    ro.observe(containerRef.current);

    return () => {
      ro.disconnect();
      cy.destroy();
      cyRef.current = null;
    };
  }, [elements]);

  return (
    <div
      ref={containerRef}
      className="absolute inset-0"
      style={{ backgroundColor: 'var(--bg-primary)' }}
    />
  );
}

// ── Detail panel ──────────────────────────────────────────────────────────────

const COUNT_LABELS: Record<string, string> = {
  chapters: 'chapters',
  paragraphs: 'chunks',
  // summaries / keywords
  generated: 'generated',
  total: 'total',
  // kg_entity
  character: 'CHARACTER',
  location: 'LOCATION',
  organization: 'ORGANIZATION',
  object: 'OBJECT',
  other: 'OTHER',
  // kg_concept
  ner: 'NER extracted',
  inferred: 'inferred',
  // kg_relation / kg_event
  relations: 'relations',
  events: 'events',
  events_classified: 'events classified (kernel/satellite)',
  // kg_temporal_relation / chronological_rank
  events_ranked: 'events ranked',
  total_events: 'total events',
  temporal_relations: 'temporal relations',
  // symbols
  imagery_entities: 'imagery entities',
  symbol_occurrences: 'symbol occurrences',
  // cep / eep / teu / character_analysis_result / causality / impact
  analyzed: 'analyzed',
  total_characters: 'total characters',
  // narrative / hero journey / temporal_analysis / tension
  has_ks_classification: 'K/S classification built',
  built: 'built',
};

interface DetailPanelProps {
  node: UnravelingNode;
  onClose: () => void;
}

function NodeDetailPanel({ node, onClose }: Readonly<DetailPanelProps>) {
  const { bg, border, text } = STATUS[node.status];

  return (
    <div
      className="flex-shrink-0 flex flex-col"
      style={{
        width: 280,
        borderLeft: '1px solid var(--border)',
        backgroundColor: 'var(--bg-secondary)',
        overflowY: 'auto',
      }}
    >
      {/* Header */}
      <div
        className="flex items-center justify-between px-4 py-3 flex-shrink-0"
        style={{ borderBottom: '1px solid var(--border)' }}
      >
        <div className="flex items-center gap-2">
          <span
            className="text-sm font-semibold"
            style={{ color: 'var(--fg-primary)' }}
          >
            {node.label}
          </span>
          <span
            className="text-xs px-2 py-0.5 rounded-full font-medium"
            style={{ backgroundColor: bg, color: text, border: `1px solid ${border}` }}
          >
            {STATUS_LABEL[node.status]}
          </span>
        </div>
        <button
          onClick={onClose}
          className="p-1 rounded"
          style={{ color: 'var(--fg-muted)' }}
        >
          <X size={14} />
        </button>
      </div>

      {/* Counts */}
      <div className="p-4 flex flex-col gap-2">
        {Object.entries(node.counts).map(([key, value]) => (
          <div
            key={key}
            className="flex items-center justify-between text-xs"
            style={{ color: 'var(--fg-secondary)' }}
          >
            <span>{COUNT_LABELS[key] ?? key}</span>
            <span
              className="font-mono font-semibold"
              style={{ color: 'var(--fg-primary)' }}
            >
              {value}
            </span>
          </div>
        ))}
      </div>

      {/* Meta */}
      {Object.keys(node.meta).length > 0 && (
        <div
          className="px-4 pb-4 text-xs"
          style={{ color: 'var(--fg-muted)' }}
        >
          {Object.entries(node.meta).map(([k, v]) => (
            <div key={k}>{`${k}: ${v}`}</div>
          ))}
        </div>
      )}
    </div>
  );
}

// ── Legend ────────────────────────────────────────────────────────────────────

function Legend() {
  return (
    <div
      className="absolute bottom-4 left-4 flex items-center gap-4 px-3 py-2 rounded-lg text-xs"
      style={{
        backgroundColor: 'var(--bg-secondary)',
        border: '1px solid var(--border)',
        color: 'var(--fg-muted)',
      }}
    >
      {(Object.entries(STATUS) as [NodeStatus, typeof STATUS[NodeStatus]][]).map(
        ([status, { bg, border, text }]) => (
          <div key={status} className="flex items-center gap-1.5">
            <div
              className="w-3 h-3 rounded-sm"
              style={{ backgroundColor: bg, border: `1px solid ${border}` }}
            />
            <span style={{ color: text }}>{STATUS_LABEL[status]}</span>
          </div>
        ),
      )}
    </div>
  );
}

// ── Page ──────────────────────────────────────────────────────────────────────

export default function UnravelingPage() {
  const { bookId } = useParams<{ bookId: string }>();
  const [selectedNode, setSelectedNode] = useState<UnravelingNode | null>(null);

  const { data, isLoading, error } = useQuery({
    queryKey: ['unraveling', bookId],
    queryFn: () => fetchUnraveling(bookId!),
    enabled: !!bookId,
    staleTime: 60_000,
  });

  if (isLoading) return <LoadingSpinner />;
  if (error) return <ErrorMessage message="無法載入展開卷軸資料" />;
  if (!data) return null;

  const elements = buildElements(data);

  return (
    <div className="flex h-full" style={{ minHeight: 0 }}>
      {/* DAG Canvas */}
      <div className="relative flex-1" style={{ minHeight: 0 }}>
        <UnravelingCanvas
          elements={elements}
          onNodeTap={setSelectedNode}
        />
        <Legend />
      </div>

      {/* Detail Panel */}
      {selectedNode && (
        <NodeDetailPanel
          node={selectedNode}
          onClose={() => setSelectedNode(null)}
        />
      )}
    </div>
  );
}
