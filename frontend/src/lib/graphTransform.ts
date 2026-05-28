import type { GraphData } from '@/api/types';
import type { ClusteredGraph } from '@/services/kgClustering';

interface CytoscapeElement {
  group: 'nodes' | 'edges';
  data: Record<string, unknown>;
}

function clusterSize(count: number): number {
  const min = 60;
  const max = 130;
  const clamped = Math.min(Math.max(count, 1), 50);
  return min + (max - min) * Math.sqrt(clamped / 50);
}

function mapSize(chunkCount: number): number {
  const min = 14;
  const max = 32;
  const clamped = Math.min(Math.max(chunkCount, 1), 100);
  return min + (max - min) * Math.sqrt(clamped / 100);
}

export function toCytoscapeElements(graphData: GraphData): CytoscapeElement[] {
  const elements: CytoscapeElement[] = [];

  for (const node of graphData.nodes) {
    elements.push({
      group: 'nodes',
      data: {
        id: node.id,
        label: node.name,
        entityType: node.type,
        size: mapSize(node.chunkCount),
        chunkCount: node.chunkCount,
        description: node.description,
        eventType: node.eventType,
        chapter: node.chapter,
      },
    });
  }

  for (const edge of graphData.edges) {
    const w = edge.weight ?? 0.5;
    elements.push({
      group: 'edges',
      data: {
        id: edge.id,
        source: edge.source,
        target: edge.target,
        label: edge.label ?? '',
        weight: w,
        edgeLength: 190 - 100 * w,
        inferred: edge.inferred ?? false,
        inferredId: edge.inferredId ?? null,
        confidence: edge.confidence ?? null,
      },
    });
  }

  return elements;
}

export function toClusteredCytoscapeElements(
  clustered: ClusteredGraph,
  labelFor: (clusterType: string, count: number) => string,
): CytoscapeElement[] {
  const elements: CytoscapeElement[] = [];

  for (const sn of clustered.superNodes) {
    elements.push({
      group: 'nodes',
      data: {
        id: sn.id,
        label: labelFor(sn.clusterType, sn.count),
        cluster: true,
        clusterType: sn.clusterType,
        count: sn.count,
        memberIds: sn.memberIds,
        topMembers: sn.topMembers,
        size: clusterSize(sn.count),
      },
    });
  }

  for (const edge of clustered.edges) {
    elements.push({
      group: 'edges',
      data: {
        id: edge.id,
        source: edge.source,
        target: edge.target,
        label: edge.weight > 1 ? String(edge.weight) : '',
        weight: edge.weight,
        edgeLength: Math.max(80, 200 - edge.weight * 6),
        aggregated: true,
        inferredCount: edge.inferredCount,
        isRivalry: edge.isRivalry ?? false,
      },
    });
  }

  return elements;
}
