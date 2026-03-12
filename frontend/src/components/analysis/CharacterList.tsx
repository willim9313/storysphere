import type { EntityResponse } from '@/api/types';
import { User } from 'lucide-react';

interface CharacterListProps {
  characters: EntityResponse[];
  onSelect: (entity: EntityResponse) => void;
  selectedId: string | null;
}

export function CharacterList({ characters, onSelect, selectedId }: CharacterListProps) {
  if (!characters.length) {
    return (
      <p className="text-sm py-8 text-center" style={{ color: 'var(--color-text-muted)' }}>
        No character entities found. Ingest a document first.
      </p>
    );
  }

  return (
    <div className="flex flex-col gap-1">
      {characters.map((c) => (
        <button
          key={c.id}
          onClick={() => onSelect(c)}
          className="flex items-center gap-3 px-3 py-2 rounded-md text-left text-sm transition-colors"
          style={{
            backgroundColor: selectedId === c.id ? 'var(--color-accent-subtle)' : 'transparent',
          }}
        >
          <User
            size={16}
            style={{ color: 'var(--color-entity-character)', flexShrink: 0 }}
          />
          <div className="min-w-0">
            <div className="font-medium truncate">{c.name}</div>
            <div className="text-xs" style={{ color: 'var(--color-text-muted)' }}>
              {c.mention_count} mentions
            </div>
          </div>
        </button>
      ))}
    </div>
  );
}
