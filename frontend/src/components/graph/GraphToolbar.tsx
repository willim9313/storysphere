import { Search, RotateCcw } from 'lucide-react';
import type { EntityType } from '@/api/types';

const ENTITY_TYPES: { type: EntityType; label: string; cls: string }[] = [
  { type: 'character', label: '角色', cls: 'pill-char' },
  { type: 'location', label: '地點', cls: 'pill-loc' },
  { type: 'concept', label: '概念', cls: 'pill-con' },
  { type: 'event', label: '事件', cls: 'pill-evt' },
];

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
    <div
      className="absolute top-4 left-4 z-10 rounded-lg p-3 space-y-3"
      style={{
        backgroundColor: 'white',
        border: '1px solid var(--border)',
        boxShadow: 'var(--shadow-md)',
        width: 200,
      }}
    >
      <div className="relative">
        <Search
          size={14}
          className="absolute left-2.5 top-1/2 -translate-y-1/2"
          style={{ color: 'var(--fg-muted)' }}
        />
        <input
          type="text"
          value={searchQuery}
          onChange={(e) => onSearchChange(e.target.value)}
          placeholder="搜尋實體..."
          className="w-full pl-8 pr-2 py-1.5 rounded-md text-xs"
          style={{
            backgroundColor: 'var(--bg-secondary)',
            color: 'var(--fg-primary)',
            border: '1px solid var(--border)',
          }}
        />
      </div>

      <div className="space-y-1.5">
        {ENTITY_TYPES.map(({ type, label }) => (
          <label key={type} className="flex items-center gap-2 text-xs cursor-pointer">
            <input
              type="checkbox"
              checked={visibleTypes.has(type)}
              onChange={() => onTypeToggle(type)}
              className="rounded"
            />
            <span>{label}</span>
          </label>
        ))}
      </div>

      <button
        className="flex items-center gap-1 text-xs w-full justify-center py-1 rounded-md"
        style={{ backgroundColor: 'var(--bg-secondary)', color: 'var(--fg-secondary)' }}
        onClick={onReset}
      >
        <RotateCcw size={12} />
        重置視圖
      </button>
    </div>
  );
}
