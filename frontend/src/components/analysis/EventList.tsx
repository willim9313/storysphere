import type { EntityResponse } from '@/api/types';
import { Zap } from 'lucide-react';

interface EventListProps {
  events: EntityResponse[];
  onSelect: (entity: EntityResponse) => void;
  selectedId: string | null;
}

export function EventList({ events, onSelect, selectedId }: EventListProps) {
  if (!events.length) {
    return (
      <p className="text-sm py-8 text-center" style={{ color: 'var(--color-text-muted)' }}>
        No event entities found.
      </p>
    );
  }

  return (
    <div className="flex flex-col gap-1">
      {events.map((e) => (
        <button
          key={e.id}
          onClick={() => onSelect(e)}
          className="flex items-center gap-3 px-3 py-2 rounded-md text-left text-sm transition-colors"
          style={{
            backgroundColor: selectedId === e.id ? 'var(--color-accent-subtle)' : 'transparent',
          }}
        >
          <Zap
            size={16}
            style={{ color: 'var(--color-entity-event)', flexShrink: 0 }}
          />
          <div className="min-w-0">
            <div className="font-medium truncate">{e.name}</div>
            {e.description && (
              <div className="text-xs truncate" style={{ color: 'var(--color-text-muted)' }}>
                {e.description}
              </div>
            )}
          </div>
        </button>
      ))}
    </div>
  );
}
