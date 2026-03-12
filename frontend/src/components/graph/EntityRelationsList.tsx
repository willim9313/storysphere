import { useQuery } from '@tanstack/react-query';
import { fetchEntityRelations } from '@/api/entities';
import { LoadingSpinner } from '@/components/ui/LoadingSpinner';

export function EntityRelationsList({ entityId }: { entityId: string }) {
  const { data: relations, isLoading } = useQuery({
    queryKey: ['entities', entityId, 'relations'],
    queryFn: () => fetchEntityRelations(entityId),
  });

  if (isLoading) return <LoadingSpinner />;
  if (!relations?.length) {
    return <p className="text-sm" style={{ color: 'var(--color-text-muted)' }}>No relations.</p>;
  }

  return (
    <div className="flex flex-col gap-2">
      {relations.map((r) => (
        <div
          key={r.id}
          className="text-sm p-2 rounded"
          style={{ backgroundColor: 'var(--color-bg-secondary)' }}
        >
          <div className="font-medium capitalize">{r.relation_type.replace(/_/g, ' ')}</div>
          {r.description && (
            <div className="text-xs mt-0.5" style={{ color: 'var(--color-text-muted)' }}>
              {r.description}
            </div>
          )}
        </div>
      ))}
    </div>
  );
}
