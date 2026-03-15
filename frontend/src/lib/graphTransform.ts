import type { GraphData } from '@/api/types';

interface CytoscapeElement {
  group: 'nodes' | 'edges';
  data: Record<string, unknown>;
}

function mapSize(chunkCount: number): number {
  const min = 20;
  const max = 60;
  const clamped = Math.min(Math.max(chunkCount, 1), 100);
  return min + ((max - min) * Math.log(clamped)) / Math.log(100);
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
      },
    });
  }

  for (const edge of graphData.edges) {
    elements.push({
      group: 'edges',
      data: {
        id: edge.id,
        source: edge.source,
        target: edge.target,
        label: edge.label ?? '',
      },
    });
  }

  return elements;
}
