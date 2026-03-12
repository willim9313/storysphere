import { Search, RotateCcw } from 'lucide-react';

const ENTITY_TYPES = ['character', 'location', 'object', 'event', 'concept', 'organization'];

interface GraphToolbarProps {
  searchQuery: string;
  onSearchChange: (q: string) => void;
  visibleTypes: Set<string>;
  onTypeToggle: (type: string) => void;
  onReset: () => void;
}

export function GraphToolbar({
  searchQuery,
  onSearchChange,
  visibleTypes,
  onTypeToggle,
  onReset,
}: GraphToolbarProps) {
  return (
    <div className="flex flex-col gap-4 p-4">
      <div className="relative">
        <Search
          size={16}
          className="absolute left-3 top-1/2 -translate-y-1/2"
          style={{ color: 'var(--color-text-muted)' }}
        />
        <input
          type="text"
          value={searchQuery}
          onChange={(e) => onSearchChange(e.target.value)}
          placeholder="Search entities..."
          className="w-full pl-9 pr-3 py-2 rounded-md text-sm"
          style={{
            backgroundColor: 'var(--color-bg-secondary)',
            color: 'var(--color-text)',
            border: '1px solid var(--color-border)',
          }}
        />
      </div>

      <div className="flex flex-col gap-2">
        <span className="text-xs font-semibold uppercase" style={{ color: 'var(--color-text-muted)' }}>
          Entity Types
        </span>
        {ENTITY_TYPES.map((type) => (
          <label key={type} className="flex items-center gap-2 text-sm cursor-pointer">
            <input
              type="checkbox"
              checked={visibleTypes.has(type)}
              onChange={() => onTypeToggle(type)}
              className="rounded"
            />
            <span className="capitalize">{type}</span>
          </label>
        ))}
      </div>

      <button className="btn btn-secondary text-sm" onClick={onReset}>
        <RotateCcw size={14} />
        Reset View
      </button>
    </div>
  );
}
