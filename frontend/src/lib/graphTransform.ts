import type { GraphData } from '@/api/types';

interface CytoscapeElement {
  group: 'nodes' | 'edges';
  data: Record<string, unknown>;
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
