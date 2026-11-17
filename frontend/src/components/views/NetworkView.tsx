import { useCallback, useMemo, useRef, useState } from 'react';
import cytoscape, { type ElementDefinition, type LayoutOptions, type StylesheetJson } from 'cytoscape';
import fcose from 'cytoscape-fcose';
import { useEvidenceByType } from '@/api/evidence';
import { useViewData } from '@/api/runs';
import { characterName, toRelationNetwork, type EvidenceLike, type RelationNetwork } from './graph/content';
import { DetailPanel, DetailRow, GraphFrame, GraphHeader, GraphStatus } from './graph/GraphParts';
import { categoryToken, CATEGORY_COUNT, colorToken, rawToken } from './graph/themeTokens';
import { useCytoscape } from './graph/useCytoscape';
import type { ViewProps } from './types';

cytoscape.use(fcose);

const CLAIM_TYPES = ['relation_network', 'character'];
const MIN_SIZE = 14;
const MAX_SIZE = 52;

const FCOSE = {
  name: 'fcose',
  quality: 'default',
  randomize: true,
  animate: false,
  fit: true,
  padding: 24,
  nodeRepulsion: 6000,
  idealEdgeLength: 90,
  nestingFactor: 0.6,
  nodeDimensionsIncludeLabels: true,
} as LayoutOptions;

interface Member {
  id: string;
  name: string;
  factionId: string;
  factionLabel: string;
  centrality: number;
}

interface GraphData {
  network: RelationNetwork;
  members: Map<string, Member>;
}

function useNetworkData({ bookId, evidenceIds }: ViewProps) {
  const byType = useEvidenceByType(bookId, CLAIM_TYPES, { includeL1: true, enabled: !evidenceIds });
  const picked = useViewData(bookId, 'network', evidenceIds ? { evidenceIds } : {});
  const query = evidenceIds ? picked : byType;

  const data = useMemo<GraphData | null>(() => {
    const primary: EvidenceLike[] | undefined = evidenceIds ? picked.data?.primary : byType.data;
    if (!primary) return null;
    // 書層級一筆；萬一有多筆取最新。
    const networkItem = primary
      .filter((item) => item.claimType === 'relation_network')
      .sort((a, b) => (b.createdAt ?? '').localeCompare(a.createdAt ?? ''))[0];
    if (!networkItem) return null;
    const names = new Map<string, string>();
    for (const item of primary) if (item.claimType === 'character') names.set(item.id, characterName(item));
    for (const ref of picked.data?.referenced ?? []) {
      if (evidenceIds && ref.claimType === 'character' && !names.has(ref.id)) names.set(ref.id, ref.label);
    }
    const network = toRelationNetwork(networkItem);
    const members = new Map<string, Member>();
    for (const faction of network.factions) {
      for (const id of faction.memberIds) {
        if (members.has(id)) continue; // 一個角色只放進第一個派系（compound node 只能有一個 parent）
        members.set(id, {
          id,
          name: names.get(id) ?? '（未知角色）',
          factionId: faction.id,
          factionLabel: faction.label,
          centrality: network.centrality[id] ?? 0,
        });
      }
    }
    return { network, members };
  }, [evidenceIds, picked.data, byType.data]);

  return { data, isLoading: query.isLoading, error: query.error };
}

const factionNodeId = (id: string) => `faction:${id}`;

function buildElements({ network, members }: GraphData): ElementDefinition[] {
  const elements: ElementDefinition[] = [];
  const maxCentrality = Math.max(0, ...[...members.values()].map((m) => m.centrality));
  network.factions.forEach((faction, index) => {
    elements.push({
      group: 'nodes',
      data: { id: factionNodeId(faction.id), label: faction.label },
      classes: `faction cat-${index % CATEGORY_COUNT}`,
    });
  });
  const factionIndex = new Map(network.factions.map((f, i) => [f.id, i]));
  for (const m of members.values()) {
    const ratio = maxCentrality > 0 ? m.centrality / maxCentrality : 0;
    elements.push({
      group: 'nodes',
      data: {
        id: m.id,
        parent: factionNodeId(m.factionId),
        label: m.name,
        size: MIN_SIZE + Math.sqrt(ratio) * (MAX_SIZE - MIN_SIZE),
      },
      classes: `member cat-${(factionIndex.get(m.factionId) ?? 0) % CATEGORY_COUNT}`,
    });
  }
  const values = network.interFaction.flatMap((x) => [x.cooperation, x.rivalry]);
  const maxValue = Math.max(0, ...values);
  const width = (v: number) => 1 + (maxValue > 0 ? (v / maxValue) * 7 : 0);
  for (const x of network.interFaction) {
    if (!factionIndex.has(x.a) || !factionIndex.has(x.b) || x.a === x.b) continue;
    const ends = { source: factionNodeId(x.a), target: factionNodeId(x.b) };
    if (x.cooperation > 0) {
      elements.push({ group: 'edges', data: { id: `co:${x.a}:${x.b}`, ...ends, width: width(x.cooperation) }, classes: 'cooperation' });
    }
    if (x.rivalry > 0) {
      elements.push({ group: 'edges', data: { id: `ri:${x.a}:${x.b}`, ...ends, width: width(x.rivalry) }, classes: 'rivalry' });
    }
  }
  return elements;
}

function buildStyle(): StylesheetJson {
  const fg = colorToken('--fg-primary');
  const muted = colorToken('--fg-muted');
  const font = rawToken('--font-sans');
  const categories: StylesheetJson = Array.from({ length: CATEGORY_COUNT }, (_, i) => {
    const color = colorToken(categoryToken(i));
    return [
      { selector: `node.member.cat-${i}`, style: { 'background-color': color } },
      { selector: `node.faction.cat-${i}`, style: { 'background-color': color, 'border-color': color } },
    ];
  }).flat();
  return [
    {
      selector: 'node.member',
      style: {
        width: 'data(size)',
        height: 'data(size)',
        'border-width': 1,
        'border-color': colorToken('--bg-primary'),
        label: 'data(label)',
        color: fg,
        'font-family': font,
        'font-size': 10,
        'text-valign': 'bottom',
        'text-margin-y': 3,
        'min-zoomed-font-size': 6,
      },
    },
    {
      selector: 'node.faction',
      style: {
        shape: 'round-rectangle',
        'background-opacity': 0.12,
        'border-width': 1.5,
        'border-style': 'dashed',
        label: 'data(label)',
        color: fg,
        'font-family': font,
        'font-size': 13,
        'font-weight': 'bold',
        'text-valign': 'top',
        'text-halign': 'center',
        'text-margin-y': -4,
        padding: '14px',
      },
    },
    ...categories,
    { selector: 'node.member:selected', style: { 'border-width': 3, 'border-color': colorToken('--accent') } },
    {
      selector: 'edge',
      style: { width: 'data(width)', 'line-color': muted, 'curve-style': 'bezier', opacity: 0.75 },
    },
    { selector: 'edge.rivalry', style: { 'line-style': 'dashed', 'line-color': colorToken('--color-error') } },
  ];
}

/** `network`：角色網路，依派系群聚（05 §4.1）。 */
export function NetworkView(props: Readonly<ViewProps>) {
  const { onSelectEvidence } = props;
  const { data, isLoading, error } = useNetworkData(props);
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const containerRef = useRef<HTMLDivElement>(null);

  const elements = useMemo(() => (data ? buildElements(data) : []), [data]);
  const onNodeTap = useCallback(
    (id: string) => {
      if (!data?.members.has(id)) return; // 派系框不算證據
      setSelectedId(id);
      onSelectEvidence?.(id);
    },
    [data, onSelectEvidence],
  );
  const onBackgroundTap = useCallback(() => setSelectedId(null), []);
  useCytoscape(containerRef, { elements, layout: FCOSE, buildStyle, onNodeTap, onBackgroundTap });

  if (isLoading || error || !data || data.members.size === 0) {
    return <GraphStatus isLoading={isLoading} error={error} empty emptyText="這本書還沒有角色網路。" />;
  }

  const { network, members } = data;
  const summary =
    `${members.size} 個角色、${network.factions.length} 個派系` +
    (network.modularity !== null ? `；模組度 ${network.modularity.toFixed(2)}` : '') +
    '。派系之間實線＝合作、虛線＝對立，線越粗越強';
  const selected = selectedId ? members.get(selectedId) : undefined;

  return (
    <div>
      <GraphHeader summary={summary} />
      <GraphFrame>
        <div ref={containerRef} role="img" aria-label={`角色網路：${summary}`} style={{ position: 'absolute', inset: 0 }} />
        {selected && (
          <DetailPanel title={selected.name} onClose={() => setSelectedId(null)}>
            <DetailRow label="派系">{selected.factionLabel}</DetailRow>
            <DetailRow label="中心度">{selected.centrality.toFixed(3)}</DetailRow>
          </DetailPanel>
        )}
      </GraphFrame>
    </div>
  );
}
