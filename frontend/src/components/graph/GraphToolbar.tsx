import { Search, RotateCcw, Link, Loader } from 'lucide-react';
import { useTranslation } from 'react-i18next';
import type { EntityType } from '@/api/types';

export type AnimationMode = 'fade' | 'stagger';
export type ClusterMode = 'node' | 'type' | 'community';

interface GraphToolbarProps {
  readonly searchQuery: string;
  readonly onSearchChange: (q: string) => void;
  readonly onSearchFocus?: () => void;
  readonly onReset: () => void;
  // Type filter chips
  readonly visibleTypes: Set<string>;
  readonly onTypeToggle: (type: EntityType) => void;
  // Cluster mode
  readonly clusterMode: ClusterMode;
  readonly onClusterModeChange: (m: ClusterMode) => void;
  // Inferred chip
  readonly showInferred: boolean;
  readonly inferredCount: number;
  readonly hasInferredData: boolean;
  readonly isRunningInference: boolean;
  readonly onShowInferredChange: (v: boolean) => void;
  readonly onRunInference: () => void;
  // Animation mode (advanced — kept but tucked away)
  readonly animationMode: AnimationMode;
  readonly onAnimationModeChange: (mode: AnimationMode) => void;
}

const CLUSTER_MODES: { mode: ClusterMode; labelKey: string; disabled?: boolean; tooltipKey?: string }[] = [
  { mode: 'node', labelKey: 'v1.cluster.mode.node' },
  { mode: 'type', labelKey: 'v1.cluster.mode.type' },
  { mode: 'community', labelKey: 'v1.cluster.mode.community', disabled: true, tooltipKey: 'v1.cluster.communityDisabled' },
];

const TYPE_CHIPS: { type: EntityType; dotKey: string }[] = [
  { type: 'character', dotKey: 'char' },
  { type: 'location', dotKey: 'loc' },
  { type: 'concept', dotKey: 'con' },
  { type: 'event', dotKey: 'evt' },
];

export function GraphToolbar({
  searchQuery,
  onSearchChange,
  onSearchFocus,
  onReset,
  visibleTypes,
  onTypeToggle,
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
      className="absolute z-10 flex items-center"
      style={{
        top: 12,
        left: 12,
        gap: 6,
        padding: 6,
        backgroundColor: 'var(--bg-primary)',
        border: '1px solid var(--border)',
        borderRadius: 'var(--radius-md)',
        boxShadow: 'var(--shadow-sm)',
      }}
    >
      {/* Search input */}
      <div
        className="inline-flex items-center"
        style={{
          gap: 6,
          padding: '4px 10px',
          borderRadius: 'var(--radius-md)',
          backgroundColor: 'var(--bg-secondary)',
          border: '1px solid var(--border)',
          minWidth: 160,
        }}
      >
        <Search size={11} style={{ color: 'var(--fg-muted)' }} />
        <input
          type="text"
          value={searchQuery}
          onChange={(e) => onSearchChange(e.target.value)}
          onFocus={onSearchFocus}
          placeholder={t('v1.toolbar.searchPlaceholder')}
          className="bg-transparent outline-none border-0"
          style={{
            fontSize: 11,
            color: 'var(--fg-primary)',
            width: '100%',
            fontFamily: 'inherit',
          }}
        />
      </div>

      <Divider />

      {/* Type filter chips */}
      {TYPE_CHIPS.map(({ type, dotKey }) => {
        const on = visibleTypes.has(type);
        return (
          <button
            key={type}
            onClick={() => onTypeToggle(type)}
            className="inline-flex items-center"
            style={{
              gap: 4,
              padding: '3px 8px',
              borderRadius: 12,
              backgroundColor: on ? 'var(--bg-tertiary)' : 'var(--bg-secondary)',
              border: '1px solid var(--border)',
              fontSize: 10,
              color: on ? 'var(--fg-primary)' : 'var(--fg-secondary)',
            }}
          >
            <span
              className="inline-block rounded-full"
              style={{
                width: 6,
                height: 6,
                backgroundColor: `var(--entity-${dotKey}-dot)`,
              }}
            />
            {t(`entityTypes.${type}`)}
          </button>
        );
      })}

      <Divider />

      {/* Cluster mode segmented control */}
      <div
        className="inline-flex"
        role="radiogroup"
        aria-label={t('v1.cluster.label', '群集模式')}
        style={{
          backgroundColor: 'var(--bg-secondary)',
          border: '1px solid var(--border)',
          borderRadius: 'var(--radius-md)',
          padding: 2,
          gap: 1,
        }}
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
              style={{
                padding: '3px 9px',
                borderRadius: 'var(--radius-sm)',
                fontSize: 11,
                backgroundColor: active ? 'var(--bg-primary)' : 'transparent',
                color: active ? 'var(--accent)' : disabled ? 'var(--fg-muted)' : 'var(--fg-secondary)',
                opacity: disabled ? 0.5 : 1,
                cursor: disabled ? 'not-allowed' : 'pointer',
                boxShadow: active ? 'var(--shadow-sm)' : 'none',
              }}
            >
              {t(labelKey)}
            </button>
          );
        })}
      </div>

      <Divider />

      {/* Reset */}
      <ToolButton onClick={onReset} icon={<RotateCcw size={11} />}>
        {t('v1.toolbar.reset')}
      </ToolButton>

      {/* Inferred chip */}
      <InferredChip
        showInferred={showInferred}
        inferredCount={inferredCount}
        hasInferredData={hasInferredData}
        isRunningInference={isRunningInference}
        onShowInferredChange={onShowInferredChange}
        onRunInference={onRunInference}
      />

      {/* Animation mode picker (advanced — kept as small inline toggle) */}
      <Divider />
      <div className="inline-flex" style={{ gap: 2 }}>
        {(['fade', 'stagger'] as AnimationMode[]).map((m) => (
          <button
            key={m}
            onClick={() => onAnimationModeChange(m)}
            title={t(`toolbar.anim_${m}`)}
            style={{
              padding: '3px 6px',
              borderRadius: 'var(--radius-sm)',
              fontSize: 10,
              backgroundColor: animationMode === m ? 'var(--bg-tertiary)' : 'transparent',
              color: animationMode === m ? 'var(--fg-primary)' : 'var(--fg-muted)',
            }}
          >
            {t(`toolbar.anim_${m}`)}
          </button>
        ))}
      </div>
    </div>
  );
}

function Divider() {
  return (
    <div
      style={{
        width: 1,
        height: 16,
        backgroundColor: 'var(--border)',
        margin: '0 2px',
      }}
    />
  );
}

interface ToolButtonProps {
  readonly onClick?: () => void;
  readonly icon: React.ReactNode;
  readonly children: React.ReactNode;
  readonly variant?: 'default' | 'warn' | 'warn-active';
  readonly disabled?: boolean;
  readonly title?: string;
}

function ToolButton({
  onClick,
  icon,
  children,
  variant = 'default',
  disabled,
  title,
}: ToolButtonProps) {
  const palette =
    variant === 'warn-active'
      ? {
          background: 'var(--accent)',
          color: 'var(--bg-primary)',
          border: 'var(--accent)',
        }
      : variant === 'warn'
      ? {
          background: 'var(--color-warning-bg)',
          color: 'var(--color-warning)',
          border: 'var(--color-warning)',
        }
      : {
          background: 'var(--bg-secondary)',
          color: 'var(--fg-secondary)',
          border: 'var(--border)',
        };

  return (
    <button
      onClick={onClick}
      disabled={disabled}
      title={title}
      className="inline-flex items-center"
      style={{
        gap: 5,
        padding: '4px 9px',
        borderRadius: 'var(--radius-md)',
        backgroundColor: palette.background,
        color: palette.color,
        border: `1px solid ${palette.border}`,
        fontSize: 11,
        cursor: disabled ? 'not-allowed' : 'pointer',
        opacity: disabled ? 0.5 : 1,
      }}
    >
      {icon}
      {children}
    </button>
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
      <ToolButton icon={<Loader size={11} className="animate-spin" />} disabled>
        {t('toolbar.runningInference', '推論中…')}
      </ToolButton>
    );
  }

  if (!hasInferredData) {
    return (
      <ToolButton onClick={onRunInference} icon={<Link size={11} />}>
        {t('toolbar.runInference', '執行推論')}
      </ToolButton>
    );
  }

  return (
    <ToolButton
      onClick={() => onShowInferredChange(!showInferred)}
      icon={<Link size={11} />}
      variant={showInferred ? 'warn-active' : 'warn'}
    >
      {t('v1.toolbar.inferredChip', { n: inferredCount })}
    </ToolButton>
  );
}
