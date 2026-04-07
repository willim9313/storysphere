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

const LAYER_X: Record<number, number> = { 0: 120, 1: 290, 2: 460, 3: 650, 4: 840 };
const NODE_Y_SPACING = 90;
const CANVAS_CENTER_Y = 280;

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

// Layer 0 → diamond, Layer 1 → rectangle, Layer 2/3/4 → round-rectangle
const LAYER_SHAPE: Record<number, string> = {
  0: 'diamond',
  1: 'rectangle',
  2: 'round-rectangle',
  3: 'round-rectangle',
  4: 'round-rectangle',
};

const STYLESHEET: cytoscape.Stylesheet[] = [
  {
    selector: 'node',
    style: {
      shape: 'data(shape)',
      width: 130,
      height: 60,
      'background-color': 'data(bgColor)',
      'border-color': 'data(borderColor)',
      'border-width': 2,
      label: 'data(label)',
      'text-valign': 'center',
      'text-halign': 'center',
      'text-wrap': 'wrap',
      'text-max-width': '115',
      'font-size': 11,
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
];

// ── Sublabel helpers ──────────────────────────────────────────────────────────

function getSubLabel(n: UnravelingNode): string {
  if (n.status === 'empty') return 'not built';
  const check = n.status === 'complete' ? ' ✓' : '';
  switch (n.nodeId) {
    case 'summaries':
      return `${n.counts.generated ?? 0} / ${n.counts.total ?? 0}${check}`;
    case 'cep':
      return `${n.counts.analyzed ?? 0} / ${n.counts.total_characters ?? 0}`;
    case 'eep':
      return `${n.counts.analyzed ?? 0} / ${n.counts.total_events ?? 0}`;
    case 'teu':
      return `${n.counts.analyzed ?? 0} / ${n.counts.total_events ?? 0}`;
    case 'timeline':
      return `${n.counts.events_ranked ?? 0} ranked${check}`;
    case 'narrative_structure': {
      const ks = n.counts.has_ks_classification ?? 0;
      const hj = n.counts.has_hero_journey ?? 0;
      if (ks && hj) return 'K/S + Hero Journey ✓';
      if (ks) return 'K/S ✓ · Hero Journey —';
      if (hj) return 'K/S — · Hero Journey ✓';
      return '';
    }
    default:
      return '';
  }
}

// ── Element builder ───────────────────────────────────────────────────────────

function buildElements(
  manifest: UnravelingManifest,
): cytoscape.ElementDefinition[] {
  const byLayer: Record<number, UnravelingNode[]> = {};
  for (const node of manifest.nodes) {
    byLayer[node.layer] = byLayer[node.layer] ?? [];
    byLayer[node.layer].push(node);
  }

  const nodeEls: cytoscape.ElementDefinition[] = manifest.nodes.map((n) => {
    const layerNodes = byLayer[n.layer];
    const idx = layerNodes.indexOf(n);
    const total = layerNodes.length;
    const y = CANVAS_CENTER_Y + (idx - (total - 1) / 2) * NODE_Y_SPACING;
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
      position: { x: LAYER_X[n.layer] ?? 140, y },
    };
  });

  const edgeEls: cytoscape.ElementDefinition[] = manifest.edges.map(
    (e, i) => ({
      data: { id: `e${i}`, source: e.source, target: e.target },
    }),
  );

  return [...nodeEls, ...edgeEls];
}

// ── Canvas component ──────────────────────────────────────────────────────────

interface CanvasProps {
  elements: cytoscape.ElementDefinition[];
  onNodeTap: (node: UnravelingNode) => void;
}

function UnravelingCanvas({ elements, onNodeTap }: CanvasProps) {
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

    cy.on('tap', 'node', (evt) => {
      const nodeData = evt.target.data('nodeData') as UnravelingNode;
      if (nodeData) onTapRef.current(nodeData);
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
  paragraphs: 'paragraphs',
  // summaries node
  generated: 'summaries generated',
  total: 'total chapters',
  // entities
  character: 'CHARACTER',
  location: 'LOCATION',
  organization: 'ORGANIZATION',
  object: 'OBJECT',
  concept: 'CONCEPT',
  other: 'OTHER',
  relations: 'relations',
  events: 'events',
  events_classified: 'events classified (kernel/satellite)',
  // timeline node
  events_ranked: 'events ranked',
  total_events: 'total events',
  temporal_relations: 'temporal relations',
  // imagery / symbols
  imagery_entities: 'imagery entities',
  symbol_occurrences: 'symbol occurrences',
  // cep / eep / teu
  analyzed: 'analyzed',
  total_characters: 'total characters',
  // narrative_structure
  has_ks_classification: 'K/S classification built',
  has_hero_journey: 'Hero Journey built',
  // temporal_analysis / tension_lines / tension_theme
  built: 'built',
};

interface DetailPanelProps {
  node: UnravelingNode;
  onClose: () => void;
}

function NodeDetailPanel({ node, onClose }: DetailPanelProps) {
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

      {/* Meta (scope notes, etc.) */}
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

// ── Layer labels ──────────────────────────────────────────────────────────────


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
