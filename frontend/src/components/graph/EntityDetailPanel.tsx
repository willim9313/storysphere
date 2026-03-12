import { X } from 'lucide-react';
import { useQuery } from '@tanstack/react-query';
import { fetchEntity } from '@/api/entities';
import { EntityRelationsList } from './EntityRelationsList';
import { EntityTimelineList } from './EntityTimelineList';
import { LoadingSpinner } from '@/components/ui/LoadingSpinner';

interface EntityDetailPanelProps {
  entityId: string;
  onClose: () => void;
}

export function EntityDetailPanel({ entityId, onClose }: EntityDetailPanelProps) {
  const { data: entity, isLoading } = useQuery({
    queryKey: ['entities', entityId],
    queryFn: () => fetchEntity(entityId),
  });

  return (
    <div
      className="w-80 h-full overflow-y-auto p-4 border-l"
      style={{
        backgroundColor: 'var(--color-surface)',
        borderColor: 'var(--color-border)',
      }}
    >
      <div className="flex items-center justify-between mb-4">
        <h3 className="text-lg font-semibold" style={{ fontFamily: 'var(--font-serif)' }}>
          {isLoading ? '...' : entity?.name}
        </h3>
        <button onClick={onClose} style={{ color: 'var(--color-text-muted)' }}>
          <X size={18} />
        </button>
      </div>

      {isLoading ? (
        <LoadingSpinner />
      ) : entity ? (
        <div className="space-y-6">
          <div>
            <span
              className="inline-block px-2 py-0.5 text-xs rounded-full capitalize"
              style={{
                backgroundColor: 'var(--color-accent-subtle)',
                color: 'var(--color-accent)',
              }}
            >
              {entity.entity_type}
            </span>
            {entity.description && (
              <p className="text-sm mt-2" style={{ color: 'var(--color-text-secondary)' }}>
                {entity.description}
              </p>
            )}
            <div className="text-xs mt-2" style={{ color: 'var(--color-text-muted)' }}>
              {entity.mention_count} mentions
              {entity.first_appearance_chapter != null &&
                ` · First appears in Ch. ${entity.first_appearance_chapter}`}
            </div>
          </div>

          <div>
            <h4
              className="text-sm font-semibold mb-2"
              style={{ color: 'var(--color-text-secondary)' }}
            >
              Relations
            </h4>
            <EntityRelationsList entityId={entityId} />
          </div>

          <div>
            <h4
              className="text-sm font-semibold mb-2"
              style={{ color: 'var(--color-text-secondary)' }}
            >
              Timeline
            </h4>
            <EntityTimelineList entityId={entityId} />
          </div>
        </div>
      ) : null}
    </div>
  );
}
