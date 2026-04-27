import { Search, RotateCcw, Link } from 'lucide-react';
import { useTranslation } from 'react-i18next';
import type { EntityType } from '@/api/types';

export type AnimationMode = 'fade' | 'stagger';

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
  animationMode: AnimationMode;
  onAnimationModeChange: (mode: AnimationMode) => void;
  showInferred: boolean;
  onShowInferredChange: (v: boolean) => void;
}

export function GraphToolbar({
  searchQuery,
  onSearchChange,
  visibleTypes,
  onTypeToggle,
  onReset,
  animationMode,
  onAnimationModeChange,
  showInferred,
  onShowInferredChange,
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

      {/* Inferred relations toggle */}
      <button
        className="flex items-center gap-1.5 text-xs w-full justify-center py-1 rounded-md transition-colors"
        style={{
          backgroundColor: showInferred ? '#fef3c7' : 'var(--bg-secondary)',
          color: showInferred ? '#b45309' : 'var(--fg-secondary)',
          border: showInferred ? '1px solid #f59e0b' : '1px solid var(--border)',
        }}
        onClick={() => onShowInferredChange(!showInferred)}
      >
        <Link size={12} />
        {t('toolbar.showInferred', '推斷關係')}
      </button>

      {/* Animation mode toggle */}
      <div>
        <p className="text-[10px] mb-1" style={{ color: 'var(--fg-muted)' }}>
          {t('toolbar.animationMode')}
        </p>
        <div className="flex rounded-md overflow-hidden" style={{ border: '1px solid var(--border)' }}>
          {(['fade', 'stagger'] as AnimationMode[]).map((m) => (
            <button
              key={m}
              onClick={() => onAnimationModeChange(m)}
              className="flex-1 text-[11px] py-1 transition-colors"
              style={{
                backgroundColor: animationMode === m ? 'var(--accent)' : 'var(--bg-secondary)',
                color: animationMode === m ? 'white' : 'var(--fg-secondary)',
              }}
            >
              {t(`toolbar.anim_${m}`)}
            </button>
          ))}
        </div>
      </div>
    </div>
  );
}
