import type { EntityResponse, SubgraphResponse } from '@/api/types';
import { entityTypeColors } from './cytoscapeConfig';

interface CytoscapeElement {
  group: 'nodes' | 'edges';
  data: Record<string, unknown>;
}

function mapSize(mentionCount: number): number {
  // Map mention_count to 20-60px
  const min = 20;
  const max = 60;
  const clamped = Math.min(Math.max(mentionCount, 1), 100);
  return min + ((max - min) * Math.log(clamped)) / Math.log(100);
}

export function toCytoscapeElements(
  entities: EntityResponse[],
  subgraph: SubgraphResponse,
): CytoscapeElement[] {
  const elements: CytoscapeElement[] = [];
  const nodeIds = new Set<string>();

  // Add all entities as nodes
  for (const e of entities) {
    nodeIds.add(e.id);
    elements.push({
      group: 'nodes',
      data: {
        id: e.id,
        label: e.name,
        entityType: e.entity_type,
        color: entityTypeColors[e.entity_type] ?? 'var(--color-text-muted)',
        size: mapSize(e.mention_count),
        mentionCount: e.mention_count,
        description: e.description,
      },
    });
  }

  // Add subgraph nodes that aren't already present
  for (const node of subgraph.nodes) {
    const id = String(node.id ?? node.entity_id ?? '');
    if (id && !nodeIds.has(id)) {
      nodeIds.add(id);
      elements.push({
        group: 'nodes',
        data: {
          id,
          label: String(node.name ?? id),
          entityType: node.entity_type ?? 'concept',
          color:
            entityTypeColors[String(node.entity_type ?? 'concept')] ??
            'var(--color-text-muted)',
          size: 25,
        },
      });
    }
  }

  // Add edges
  for (const edge of subgraph.edges) {
    const source = String(edge.source_id ?? edge.source ?? '');
    const target = String(edge.target_id ?? edge.target ?? '');
    if (source && target && nodeIds.has(source) && nodeIds.has(target)) {
      elements.push({
        group: 'edges',
        data: {
          id: `${source}-${target}-${edge.relation_type ?? 'related'}`,
          source,
          target,
          label: String(edge.relation_type ?? ''),
          weight: Math.max(1, Number(edge.weight ?? 1)),
          bidirectional: Boolean(edge.is_bidirectional),
        },
      });
    }
  }

  return elements;
}
