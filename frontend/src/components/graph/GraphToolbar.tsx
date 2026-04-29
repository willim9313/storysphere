import { Search, RotateCcw, Link, Loader } from 'lucide-react';
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
  readonly searchQuery: string;
  readonly onSearchChange: (q: string) => void;
  readonly visibleTypes: Set<string>;
  readonly onTypeToggle: (type: string) => void;
  readonly onReset: () => void;
  readonly animationMode: AnimationMode;
  readonly onAnimationModeChange: (mode: AnimationMode) => void;
  readonly showInferred: boolean;
  readonly onShowInferredChange: (v: boolean) => void;
  readonly onRunInference: () => void;
  readonly isRunningInference: boolean;
  readonly hasInferredData: boolean;
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
  onRunInference,
  isRunningInference,
  hasInferredData,
}: GraphToolbarProps) {
  const { t } = useTranslation('graph');

  function inferredButton() {
    if (isRunningInference) {
      return { label: t('toolbar.runningInference', '推論中…'), icon: <Loader size={12} className="animate-spin" />, bg: 'var(--bg-secondary)', color: 'var(--fg-muted)', border: '1px solid var(--border)', onClick: undefined };
    }
    if (showInferred) {
      return { label: t('toolbar.hideInferred', '隱藏推斷關係'), icon: <Link size={12} />, bg: '#fef3c7', color: '#b45309', border: '1px solid #f59e0b', onClick: () => onShowInferredChange(false) };
    }
    if (hasInferredData) {
      return { label: t('toolbar.showInferred', '顯示推斷關係'), icon: <Link size={12} />, bg: 'var(--bg-secondary)', color: '#b45309', border: '1px solid #f59e0b', onClick: () => onShowInferredChange(true) };
    }
    return { label: t('toolbar.runInference', '執行推論'), icon: <Link size={12} />, bg: 'var(--bg-secondary)', color: 'var(--fg-secondary)', border: '1px solid var(--border)', onClick: onRunInference };
  }

  const btn = inferredButton();

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

      {/* Inferred relations — single button, state-driven */}
      <button
        className="flex items-center gap-1.5 text-xs w-full justify-center py-1 rounded-md transition-colors"
        style={{ backgroundColor: btn.bg, color: btn.color, border: btn.border }}
        onClick={btn.onClick}
        disabled={isRunningInference}
      >
        {btn.icon}
        {btn.label}
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
