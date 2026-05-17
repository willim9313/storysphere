import { Search, RotateCcw, Link, Loader } from 'lucide-react';
import { useTranslation } from 'react-i18next';

export type AnimationMode = 'fade' | 'stagger';
export type ClusterMode = 'node' | 'type' | 'community';

interface GraphToolbarProps {
  readonly searchQuery: string;
  readonly onSearchChange: (q: string) => void;
  readonly onSearchFocus?: () => void;
  readonly onReset: () => void;
  // Cluster mode (Change ④)
  readonly clusterMode: ClusterMode;
  readonly onClusterModeChange: (m: ClusterMode) => void;
  // Inferred chip (Change ③) — default OFF
  readonly showInferred: boolean;
  readonly inferredCount: number;
  readonly hasInferredData: boolean;
  readonly isRunningInference: boolean;
  readonly onShowInferredChange: (v: boolean) => void;
  readonly onRunInference: () => void;
  // Animation mode (existing, kept)
  readonly animationMode: AnimationMode;
  readonly onAnimationModeChange: (mode: AnimationMode) => void;
}

const CLUSTER_MODES: { mode: ClusterMode; labelKey: string; disabled?: boolean; tooltipKey?: string }[] = [
  { mode: 'node', labelKey: 'v1.cluster.mode.node' },
  { mode: 'type', labelKey: 'v1.cluster.mode.type' },
  { mode: 'community', labelKey: 'v1.cluster.mode.community', disabled: true, tooltipKey: 'v1.cluster.communityDisabled' },
];

export function GraphToolbar({
  searchQuery,
  onSearchChange,
  onSearchFocus,
  onReset,
  clusterMode,
  onClusterModeChange,
  showInferred,
  inferredCount,
  hasInferredData,
  isRunningInference,
  onShowInferredChange,
  onRunInference,
  animationMode,
  onAnimationModeChange,
}: GraphToolbarProps) {
  const { t } = useTranslation('graph');

  return (
    <div
      className="absolute top-4 left-4 z-10 rounded-lg p-3 space-y-3"
      style={{
        backgroundColor: 'var(--bg-primary)',
        border: '1px solid var(--border)',
        borderRadius: 'var(--radius-lg)',
        boxShadow: 'var(--shadow-sm)',
        width: 220,
      }}
    >
      {/* Search */}
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
          onFocus={onSearchFocus}
          placeholder={t('v1.toolbar.searchPlaceholder')}
          className="w-full pl-8 pr-2 py-1.5 rounded-md text-xs"
          style={{
            backgroundColor: 'var(--bg-secondary)',
            color: 'var(--fg-primary)',
            border: '1px solid var(--border)',
          }}
        />
      </div>

      {/* Cluster mode segmented control (Change ④) */}
      <div>
        <div
          className="flex rounded-md overflow-hidden"
          style={{ border: '1px solid var(--border)' }}
          role="radiogroup"
          aria-label={t('v1.cluster.label', '群集模式')}
        >
          {CLUSTER_MODES.map(({ mode, labelKey, disabled, tooltipKey }) => {
            const active = clusterMode === mode;
            return (
              <button
                key={mode}
                onClick={() => !disabled && onClusterModeChange(mode)}
                disabled={disabled}
                title={disabled && tooltipKey ? t(tooltipKey) : undefined}
                role="radio"
                aria-checked={active}
                className="flex-1 text-[11px] py-1 transition-colors"
                style={{
                  backgroundColor: active ? 'var(--accent)' : 'var(--bg-secondary)',
                  color: active ? 'var(--bg-primary)' : disabled ? 'var(--fg-muted)' : 'var(--fg-secondary)',
                  opacity: disabled ? 0.5 : 1,
                  cursor: disabled ? 'not-allowed' : 'pointer',
                }}
              >
                {t(labelKey)}
              </button>
            );
          })}
        </div>
      </div>

      {/* Inferred chip (Change ③) */}
      <InferredChip
        showInferred={showInferred}
        inferredCount={inferredCount}
        hasInferredData={hasInferredData}
        isRunningInference={isRunningInference}
        onShowInferredChange={onShowInferredChange}
        onRunInference={onRunInference}
      />

      {/* Reset */}
      <button
        className="flex items-center gap-1 text-xs w-full justify-center py-1 rounded-md"
        style={{ backgroundColor: 'var(--bg-secondary)', color: 'var(--fg-secondary)' }}
        onClick={onReset}
      >
        <RotateCcw size={12} />
        {t('v1.toolbar.reset')}
      </button>

      {/* Animation mode (advanced) */}
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
                color: animationMode === m ? 'var(--bg-primary)' : 'var(--fg-secondary)',
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

interface InferredChipProps {
  showInferred: boolean;
  inferredCount: number;
  hasInferredData: boolean;
  isRunningInference: boolean;
  onShowInferredChange: (v: boolean) => void;
  onRunInference: () => void;
}

function InferredChip({
  showInferred,
  inferredCount,
  hasInferredData,
  isRunningInference,
  onShowInferredChange,
  onRunInference,
}: InferredChipProps) {
  const { t } = useTranslation('graph');

  if (isRunningInference) {
    return (
      <button
        disabled
        className="flex items-center gap-1.5 text-xs w-full justify-center py-1 rounded-md"
        style={{
          backgroundColor: 'var(--bg-secondary)',
          color: 'var(--fg-muted)',
          border: '1px solid var(--border)',
        }}
      >
        <Loader size={12} className="animate-spin" />
        {t('toolbar.runningInference', '推論中…')}
      </button>
    );
  }

  if (!hasInferredData) {
    return (
      <button
        onClick={onRunInference}
        className="flex items-center gap-1.5 text-xs w-full justify-center py-1 rounded-md"
        style={{
          backgroundColor: 'var(--bg-secondary)',
          color: 'var(--fg-secondary)',
          border: '1px solid var(--border)',
        }}
      >
        <Link size={12} />
        {t('toolbar.runInference', '執行推論')}
      </button>
    );
  }

  // Has data — show toggle chip
  const active = showInferred;
  return (
    <button
      onClick={() => onShowInferredChange(!active)}
      className="flex items-center gap-1.5 text-xs w-full justify-center py-1 rounded-md transition-colors"
      style={{
        backgroundColor: active ? 'var(--color-warning-bg)' : 'var(--bg-secondary)',
        color: active ? 'var(--color-warning)' : 'var(--color-warning)',
        border: `1px solid var(--color-warning)`,
      }}
    >
      <Link size={12} />
      {t('v1.toolbar.inferredChip', { n: inferredCount })}
    </button>
  );
}
