import { useQuery } from '@tanstack/react-query';
import { fetchEntities, fetchEntitySubgraph } from '@/api/entities';
import { toCytoscapeElements } from '@/lib/graphTransform';

export function useGraphData(documentId?: string) {
  return useQuery({
    queryKey: ['graph', documentId],
    queryFn: async () => {
      const entityList = await fetchEntities({ limit: 500 });
      const entities = entityList.items;

      if (entities.length === 0) return { elements: [], entities };

      // Pick the top-mentioned entity for subgraph edges
      const sorted = [...entities].sort(
        (a, b) => b.mention_count - a.mention_count,
      );
      const topEntity = sorted[0];

      const subgraph = await fetchEntitySubgraph(topEntity.id, 4);
      const elements = toCytoscapeElements(entities, subgraph);

      return { elements, entities };
    },
    enabled: true,
  });
}
