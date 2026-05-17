import type { EntityType, GraphData, GraphEdge, GraphNode } from '@/api/types';

export interface SuperNodeMember {
  id: string;
  name: string;
  chunkCount: number;
}

export interface SuperNode {
  id: string;
  kind: 'super';
  clusterType: EntityType;
  count: number;
  memberIds: string[];
  topMembers: SuperNodeMember[];
}

export interface AggregatedEdge {
  id: string;
  source: string;
  target: string;
  weight: number;
  inferredCount: number;
}

export interface ClusteredGraph {
  superNodes: SuperNode[];
  edges: AggregatedEdge[];
}

const TOP_MEMBER_COUNT = 3;

export function clusterIdForType(type: EntityType): string {
  return `cluster:type:${type}`;
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

export function byCommunity(graph: GraphData): ClusteredGraph {
  throw new Error(
    `kgClustering.byCommunity is not implemented in V1 (got ${graph.nodes.length} nodes). ` +
      'Pending backend F-16 (faction detection): GET /books/:bookId/analysis/factions. ' +
      'See docs/BACKLOG.md F-16.',
  );
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
