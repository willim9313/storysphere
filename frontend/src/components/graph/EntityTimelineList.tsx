import { useQuery } from '@tanstack/react-query';
import { fetchEntityTimeline } from '@/api/entities';
import { LoadingSpinner } from '@/components/ui/LoadingSpinner';

export function EntityTimelineList({ entityId }: { entityId: string }) {
  const { data: timeline, isLoading } = useQuery({
    queryKey: ['entities', entityId, 'timeline'],
    queryFn: () => fetchEntityTimeline(entityId),
  });

  if (isLoading) return <LoadingSpinner />;
  if (!timeline?.length) {
    return <p className="text-sm" style={{ color: 'var(--color-text-muted)' }}>No timeline events.</p>;
  }

  return (
    <div className="flex flex-col gap-2">
      {timeline.map((t) => (
        <div
          key={t.event_id}
          className="text-sm p-2 rounded"
          style={{ backgroundColor: 'var(--color-bg-secondary)' }}
        >
          <div className="font-medium">{t.title}</div>
          {t.chapter != null && (
            <div className="text-xs" style={{ color: 'var(--color-text-muted)' }}>
              Chapter {t.chapter}
            </div>
          )}
          {t.description && (
            <div className="text-xs mt-0.5" style={{ color: 'var(--color-text-secondary)' }}>
              {t.description}
            </div>
          )}
        </div>
      ))}
    </div>
  );
}
