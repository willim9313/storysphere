import { Search, RotateCcw } from 'lucide-react';
import { useTranslation } from 'react-i18next';
import type { EntityType } from '@/api/types';

const ENTITY_TYPE_KEYS: { type: EntityType; cls: string }[] = [
  { type: 'character', cls: 'pill-char' },
  { type: 'location', cls: 'pill-loc' },
  { type: 'concept', cls: 'pill-con' },
  { type: 'event', cls: 'pill-evt' },
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
  const { t } = useTranslation('graph');

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
          placeholder={t('toolbar.searchPlaceholder')}
          className="w-full pl-8 pr-2 py-1.5 rounded-md text-xs"
          style={{
            backgroundColor: 'var(--bg-secondary)',
            color: 'var(--fg-primary)',
            border: '1px solid var(--border)',
          }}
        />
      </div>

      <div className="space-y-1.5">
        {ENTITY_TYPE_KEYS.map(({ type }) => (
          <label key={type} className="flex items-center gap-2 text-xs cursor-pointer">
            <input
              type="checkbox"
              checked={visibleTypes.has(type)}
              onChange={() => onTypeToggle(type)}
              className="rounded"
            />
            <span>{t(`entityTypes.${type}`)}</span>
          </label>
        ))}
      </div>

      <button
        className="flex items-center gap-1 text-xs w-full justify-center py-1 rounded-md"
        style={{ backgroundColor: 'var(--bg-secondary)', color: 'var(--fg-secondary)' }}
        onClick={onReset}
      >
        <RotateCcw size={12} />
        {t('toolbar.resetView')}
      </button>
    </div>
  );
}
