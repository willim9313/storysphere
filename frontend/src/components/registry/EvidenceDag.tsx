import { useCallback, useMemo, useRef, useState } from 'react';
import type { ElementDefinition, LayoutOptions, StylesheetJson } from 'cytoscape';
import type { MethodSummary } from '@/api/registry';
import { useRegistryDag, type Dag, type Methodology } from '@/api/registryExtra';
import { claimTypeLabel } from '@/components/views/labels';
import { DetailPanel, DetailRow, GraphFrame, GraphHeader, GraphStatus } from '@/components/views/graph/GraphParts';
import { colorToken, rawToken } from '@/components/views/graph/themeTokens';
import { useCytoscape } from '@/components/views/graph/useCytoscape';
import { layerLabel } from './labels';

const COLUMN = 170;
const ROW = 46;
const LAYOUT: LayoutOptions = { name: 'preset', fit: true, padding: 24 };
const KIND_LABEL: Record<string, string> = { claim_type: '證據類型', method: '方法', methodology: '方法論' };

/** 最長路徑分層：沒有上游的在第 0 欄，其餘排在所有上游的右邊一欄（由左而右＝由上游到下游）。 */
function columns(dag: Dag): Map<string, number> {
  const depth = new Map(dag.nodes.map((n) => [n.id, 0]));
  // DAG 最多 |V| 輪就收斂；多跑也不會無窮迴圈。
  for (let round = 0; round < dag.nodes.length; round++) {
    let changed = false;
    for (const e of dag.edges) {
      const next = (depth.get(e.from) ?? 0) + 1;
      if (next > (depth.get(e.to) ?? 0)) {
        depth.set(e.to, next);
        changed = true;
      }
    }
    if (!changed) break;
  }
  return depth;
}

function buildElements(dag: Dag, methods: Map<string, MethodSummary>, methodologies: Map<string, Methodology>): ElementDefinition[] {
  const depth = columns(dag);
  const rows = new Map<number, number>();
  const ordered = [...dag.nodes].sort((a, b) => (a.mechanism ?? '').localeCompare(b.mechanism ?? '') || a.id.localeCompare(b.id));
  const elements: ElementDefinition[] = ordered.map((n) => {
    const col = depth.get(n.id) ?? 0;
    const row = rows.get(col) ?? 0;
    rows.set(col, row + 1);
    const implemented = n.kind === 'method' ? methods.get(n.id)?.implemented : n.kind === 'methodology' ? methodologies.get(n.id)?.implemented : true;
    const label =
      n.kind === 'method' ? methods.get(n.id)?.code ?? n.id : n.kind === 'methodology' ? methodologies.get(n.id)?.code ?? n.id : n.id;
    return {
      group: 'nodes',
      data: { id: n.id, label },
      position: { x: col * COLUMN, y: row * ROW },
      classes: `${n.kind}${n.kind === 'claim_type' && n.level === 1 ? ' l1' : ''}${implemented === false ? ' pending' : ''}`,
    };
  });
  // 每欄垂直置中，欄跟欄的高度差不會讓圖歪一邊。
  const tallest = Math.max(0, ...rows.values());
  for (const el of elements) {
    const col = depth.get(el.data.id!) ?? 0;
    el.position!.y += ((tallest - (rows.get(col) ?? 0)) * ROW) / 2;
  }
  for (const e of dag.edges) {
    elements.push({ group: 'edges', data: { id: `${e.kind}:${e.from}:${e.to}`, source: e.from, target: e.to }, classes: e.kind });
  }
  return elements;
}

function buildStyle(): StylesheetJson {
  const fg = colorToken('--fg-primary');
  const muted = colorToken('--fg-muted');
  const border = colorToken('--border');
  const font = rawToken('--font-mono');
  return [
    {
      selector: 'node',
      style: {
        label: 'data(label)',
        color: fg,
        'font-family': font,
        'font-size': 10,
        'text-valign': 'center',
        'text-halign': 'center',
        'text-wrap': 'ellipsis',
        'text-max-width': '120px',
        width: 130,
        height: 26,
        'border-width': 1,
        'border-color': border,
        'background-color': colorToken('--bg-primary'),
        'min-zoomed-font-size': 5,
      },
    },
    { selector: 'node.claim_type', style: { shape: 'round-rectangle' } },
    { selector: 'node.claim_type.l1', style: { 'background-color': colorToken('--bg-secondary'), color: muted } },
    { selector: 'node.method', style: { shape: 'ellipse', width: 70, 'background-color': colorToken('--cat-1'), 'background-opacity': 0.25, 'border-color': colorToken('--cat-1') } },
    { selector: 'node.methodology', style: { shape: 'diamond', width: 80, height: 40, 'background-color': colorToken('--cat-3'), 'background-opacity': 0.25, 'border-color': colorToken('--cat-3') } },
    { selector: 'node.pending', style: { 'border-style': 'dashed', opacity: 0.6 } },
    { selector: 'node:selected', style: { 'border-width': 3, 'border-color': colorToken('--accent') } },
    {
      selector: 'edge',
      style: {
        width: 1,
        'line-color': muted,
        'target-arrow-color': muted,
        'target-arrow-shape': 'triangle',
        'arrow-scale': 0.7,
        'curve-style': 'bezier',
        opacity: 0.6,
      },
    },
    { selector: 'edge.produces', style: { 'line-color': colorToken('--cat-1'), 'target-arrow-color': colorToken('--cat-1') } },
    { selector: 'edge.step', style: { 'line-style': 'dashed', 'line-color': colorToken('--cat-3'), 'target-arrow-color': colorToken('--cat-3') } },
  ];
}

/** 證據 DAG（N-07f）：證據類型 → 方法 → 產出類型；方法論的步驟用虛線。點節點看上下游，方法可開宣告。 */
export function EvidenceDag({
  methods,
  methodologies,
  onOpenMethod,
}: Readonly<{ methods: MethodSummary[]; methodologies: Methodology[]; onOpenMethod: (id: string) => void }>) {
  const { data, isLoading, error } = useRegistryDag();
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const containerRef = useRef<HTMLDivElement>(null);
  const methodMap = useMemo(() => new Map(methods.map((m) => [m.id, m])), [methods]);
  const methodologyMap = useMemo(() => new Map(methodologies.map((m) => [m.id, m])), [methodologies]);
  const elements = useMemo(() => (data ? buildElements(data, methodMap, methodologyMap) : []), [data, methodMap, methodologyMap]);
  const onNodeTap = useCallback((id: string) => setSelectedId(id), []);
  const onBackgroundTap = useCallback(() => setSelectedId(null), []);
  useCytoscape(containerRef, { elements, layout: LAYOUT, buildStyle, onNodeTap, onBackgroundTap });

  if (isLoading || error || !data || data.nodes.length === 0) {
    return <GraphStatus isLoading={isLoading} error={error} empty emptyText="registry 沒有節點。" />;
  }
  const count = (kind: string) => data.nodes.filter((n) => n.kind === kind).length;
  const summary = `${count('claim_type')} 種證據類型、${count('method')} 個方法、${count('methodology')} 個方法論。由左到右＝上游到下游；虛線框＝尚未支援`;
  const node = selectedId ? data.nodes.find((n) => n.id === selectedId) : undefined;
  const name = (id: string) => methodMap.get(id)?.code ?? methodologyMap.get(id)?.code ?? id;
  const upstream = node ? data.edges.filter((e) => e.to === node.id).map((e) => name(e.from)) : [];
  const downstream = node ? data.edges.filter((e) => e.from === node.id).map((e) => name(e.to)) : [];

  return (
    <div>
      <GraphHeader summary={summary} />
      <GraphFrame>
        <div ref={containerRef} style={{ position: 'absolute', inset: 0 }} />
        {node && (
          <DetailPanel title={node.kind === 'claim_type' ? claimTypeLabel(node.id) : name(node.id)} onClose={() => setSelectedId(null)}>
            <DetailRow label="種類">
              {KIND_LABEL[node.kind] ?? node.kind}
              {node.level ? ` · 第 ${node.level} 層` : ''}
            </DetailRow>
            <DetailRow label="層／機制">
              {layerLabel(node.layer)}
              {node.mechanism ? ` · ${node.mechanism}` : ''}
            </DetailRow>
            {node.kind === 'method' && methodMap.get(node.id) && <DetailRow label="問題">{methodMap.get(node.id)!.question}</DetailRow>}
            {node.kind === 'methodology' && methodologyMap.get(node.id) && <DetailRow label="問題">{methodologyMap.get(node.id)!.question}</DetailRow>}
            <DetailRow label="上游">{upstream.join('、') || '—'}</DetailRow>
            <DetailRow label="下游">{downstream.join('、') || '—'}</DetailRow>
            {node.kind === 'method' && (
              <button type="button" className="ss-btn ss-btn-sm ss-btn-secondary" style={{ alignSelf: 'flex-start' }} onClick={() => onOpenMethod(node.id)}>
                看宣告
              </button>
            )}
          </DetailPanel>
        )}
      </GraphFrame>
    </div>
  );
}
