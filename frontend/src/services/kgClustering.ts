import type { FactionAnalysisResponse } from '@/api/factions';
import type { EntityType, GraphData, GraphEdge, GraphNode } from '@/api/types';

export interface SuperNodeMember {
  id: string;
  name: string;
  chunkCount: number;
}

export interface SuperNode {
  id: string;
  kind: 'super';
  // For 'type' cluster mode this is an EntityType value; for 'community'
  // mode it is the backend faction id (e.g. "faction:0").
  clusterType: string;
  count: number;
  memberIds: string[];
  topMembers: SuperNodeMember[];
  // Optional override for display label (community mode → "Faction 1"…);
  // falls back to t(`entityTypes.${clusterType}`) when absent.
  label?: string;
}

export interface AggregatedEdge {
  id: string;
  source: string;
  target: string;
  weight: number;
  inferredCount: number;
  // Community mode only — true if this aggregated edge is sourced from
  // ENEMY relations (rendered as a red dashed edge).
  isRivalry?: boolean;
}

export interface ClusteredGraph {
  superNodes: SuperNode[];
  edges: AggregatedEdge[];
}

const TOP_MEMBER_COUNT = 3;

export function clusterIdForType(type: EntityType): string {
  return `cluster:type:${type}`;
}

export function clusterIdForFaction(factionId: string): string {
  return `cluster:${factionId}`;
}

export function byType(graph: GraphData): ClusteredGraph {
  const groups = new Map<EntityType, GraphNode[]>();
  for (const node of graph.nodes) {
    const bucket = groups.get(node.type);
    if (bucket) bucket.push(node);
    else groups.set(node.type, [node]);
  }

  const nodeIdToCluster = new Map<string, string>();
  const superNodes: SuperNode[] = [];
  for (const [type, members] of groups) {
    const clusterId = clusterIdForType(type);
    for (const m of members) nodeIdToCluster.set(m.id, clusterId);
    const sorted = [...members].sort((a, b) => b.chunkCount - a.chunkCount);
    superNodes.push({
      id: clusterId,
      kind: 'super',
      clusterType: type,
      count: members.length,
      memberIds: members.map((m) => m.id),
      topMembers: sorted.slice(0, TOP_MEMBER_COUNT).map((m) => ({
        id: m.id,
        name: m.name,
        chunkCount: m.chunkCount,
      })),
    });
  }

  const edgeMap = new Map<string, AggregatedEdge>();
  for (const edge of graph.edges) {
    const src = nodeIdToCluster.get(edge.source);
    const tgt = nodeIdToCluster.get(edge.target);
    if (!src || !tgt || src === tgt) continue;
    const [a, b] = src < tgt ? [src, tgt] : [tgt, src];
    const key = `${a}::${b}`;
    const existing = edgeMap.get(key);
    if (existing) {
      existing.weight += 1;
      if (edge.inferred) existing.inferredCount += 1;
    } else {
      edgeMap.set(key, {
        id: `agg:${key}`,
        source: a,
        target: b,
        weight: 1,
        inferredCount: edge.inferred ? 1 : 0,
      });
    }
  }

  return { superNodes, edges: [...edgeMap.values()] };
}

export function byCommunity(
  graph: GraphData,
  analysis: FactionAnalysisResponse,
): ClusteredGraph {
  const nodeMap = new Map(graph.nodes.map((n) => [n.id, n]));
  const factions = analysis.factions ?? [];

  const superNodes: SuperNode[] = factions.map((f) => {
    const clusterId = clusterIdForFaction(f.id);
    const members = (f.memberIds ?? [])
      .map((id) => nodeMap.get(id))
      .filter((n): n is GraphNode => !!n);
    const sorted = [...members].sort((a, b) => b.chunkCount - a.chunkCount);
    return {
      id: clusterId,
      kind: 'super',
      clusterType: f.id,
      label: f.label,
      count: f.memberIds?.length ?? 0,
      memberIds: f.memberIds ?? [],
      topMembers: sorted.slice(0, TOP_MEMBER_COUNT).map((m) => ({
        id: m.id,
        name: m.name,
        chunkCount: m.chunkCount,
      })),
    };
  });

  // Aggregate inter-faction edges from FactionRelation (authoritative source
  // for cooperation/rivalry) so the visual matches the panel's matrix.
  const edges: AggregatedEdge[] = [];
  for (const rel of analysis.relations ?? []) {
    const src = clusterIdForFaction(rel.sourceFactionId);
    const tgt = clusterIdForFaction(rel.targetFactionId);
    if (src === tgt) continue;
    if (rel.cooperation > 0) {
      edges.push({
        id: `agg:coop:${src}::${tgt}`,
        source: src,
        target: tgt,
        weight: rel.cooperation,
        inferredCount: 0,
      });
    }
    if (rel.rivalry > 0) {
      edges.push({
        id: `agg:riv:${src}::${tgt}`,
        source: src,
        target: tgt,
        weight: rel.rivalry,
        inferredCount: 0,
        isRivalry: true,
      });
    }
  }

  return { superNodes, edges };
}

export function isSuperNodeId(id: string): boolean {
  return id.startsWith('cluster:');
}

export function isSuperNode(node: GraphNode | SuperNode): node is SuperNode {
  return (node as SuperNode).kind === 'super';
}

export function aggregatedEdgeWidth(edge: AggregatedEdge | GraphEdge): number {
  const w = 'weight' in edge && typeof edge.weight === 'number' ? edge.weight : 1;
  return Math.min(1 + w * 0.6, 6);
}
