import { useState } from 'react';
import {
  Search,
  RotateCcw,
  SlidersHorizontal,
  Circle,
  Shapes,
  Users,
  GitBranch,
  ChevronDown,
  Loader,
  AlertTriangle,
  Eye,
  Share2,
  Download,
  ArrowRight,
} from 'lucide-react';
import { useTranslation } from 'react-i18next';
import type { EntityType } from '@/api/types';

// Kept for GraphCanvas's animateIn() — the toolbar no longer exposes a UI
// control for this (C7: 移除「淡入/逐個」動畫模式 toggle), GraphPage now
// passes a fixed 'fade'.
export type AnimationMode = 'fade' | 'stagger';
export type ClusterMode = 'node' | 'type' | 'community';
export type InferenceState = 'idle' | 'running' | 'ready';

/** Pure: idle (no records yet) / running (mutation in flight) / ready (has records, regardless of pending count). */
// eslint-disable-next-line react-refresh/only-export-components
export function resolveInferenceState(isRunning: boolean, recordTotal: number): InferenceState {
  if (isRunning) return 'running';
  return recordTotal > 0 ? 'ready' : 'idle';
}

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
  // Inference (three-state: idle / running / ready — see brief §4)
  readonly inferenceState: InferenceState;
  readonly pendingCount: number;
  readonly decidedCount: number;
  readonly showInferred: boolean;
  readonly onShowInferredChange: (v: boolean) => void;
  readonly onRunInference: () => void;
  readonly onSafeRerun: () => void;
  readonly onForceRerun: () => void;
  readonly onOpenReview: () => void;
  readonly chapterCount: number;
  readonly nodeCount: number;
  readonly onShareLink: () => void;
  readonly onExportPng: () => void;
}

const CLUSTER_MODES: { mode: ClusterMode; labelKey: string; icon: React.ReactNode }[] = [
  { mode: 'node', labelKey: 'v1.cluster.mode.node', icon: <Circle size={10} /> },
  { mode: 'type', labelKey: 'v1.cluster.mode.type', icon: <Shapes size={10} /> },
  { mode: 'community', labelKey: 'v1.cluster.mode.community', icon: <Users size={10} /> },
];

// 設計 contract：KG 的類型控制一律涵蓋完整 7 類，不用 4 類 demo 子集
// （與 LegendCard 的計數對象一致）。
const TYPE_CHIPS: { type: EntityType; dotKey: string }[] = [
  { type: 'character', dotKey: 'char' },
  { type: 'location', dotKey: 'loc' },
  { type: 'organization', dotKey: 'org' },
  { type: 'object', dotKey: 'obj' },
  { type: 'concept', dotKey: 'con' },
  { type: 'event', dotKey: 'evt' },
  { type: 'other', dotKey: 'other' },
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
  inferenceState,
  pendingCount,
  decidedCount,
  showInferred,
  onShowInferredChange,
  onRunInference,
  onSafeRerun,
  onForceRerun,
  onOpenReview,
  chapterCount,
  nodeCount,
  onShareLink,
  onExportPng,
}: GraphToolbarProps) {
  const { t } = useTranslation('graph');

  return (
    <div
      className="absolute z-10 flex flex-col"
      style={{ top: 12, left: 12, gap: 8 }}
    >
      {/* Row 1: search, cluster mode segmented, reset */}
      <div className="flex items-center flex-wrap" style={{ gap: 8 }}>
        <div
          className="inline-flex items-center"
          style={{
            gap: 6,
            padding: '4px 10px',
            borderRadius: 'var(--radius-md)',
            backgroundColor: 'var(--bg-primary)',
            border: '1px solid var(--border)',
            boxShadow: 'var(--shadow-sm)',
            width: 250,
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
              fontSize: 'var(--font-size-2xs)',
              color: 'var(--fg-primary)',
              width: '100%',
              fontFamily: 'inherit',
            }}
          />
        </div>

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
          {CLUSTER_MODES.map(({ mode, labelKey, icon }) => {
            const active = clusterMode === mode;
            return (
              <button
                key={mode}
                onClick={() => onClusterModeChange(mode)}
                role="radio"
                aria-checked={active}
                className="inline-flex items-center"
                style={{
                  gap: 5,
                  padding: '3px 9px',
                  borderRadius: 'var(--radius-sm)',
                  fontSize: 'var(--font-size-2xs)',
                  backgroundColor: active ? 'var(--bg-primary)' : 'transparent',
                  color: active ? 'var(--accent)' : 'var(--fg-secondary)',
                  boxShadow: active ? 'var(--shadow-sm)' : 'none',
                }}
              >
                {icon}
                {t(labelKey)}
              </button>
            );
          })}
        </div>

        <ToolButton onClick={onReset} icon={<RotateCcw size={11} />}>
          {t('v1.toolbar.reset')}
        </ToolButton>
      </div>

      {/* Row 2: type filter chips, inference cluster, share/export */}
      <div className="flex items-center flex-wrap" style={{ gap: 8 }}>
        <div
          className="inline-flex items-center"
          style={{
            gap: 6,
            padding: '5px 9px',
            borderRadius: 'var(--radius-md)',
            backgroundColor: 'var(--bg-primary)',
            border: '1px solid var(--border)',
            boxShadow: 'var(--shadow-sm)',
          }}
        >
          <SlidersHorizontal size={11} style={{ color: 'var(--fg-muted)', marginRight: 2 }} />
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
                  fontSize: 'var(--font-size-2xs)',
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
        </div>

        <Divider />

        <InferenceControls
          inferenceState={inferenceState}
          pendingCount={pendingCount}
          decidedCount={decidedCount}
          showInferred={showInferred}
          onShowInferredChange={onShowInferredChange}
          onRunInference={onRunInference}
          onSafeRerun={onSafeRerun}
          onForceRerun={onForceRerun}
          onOpenReview={onOpenReview}
          chapterCount={chapterCount}
          nodeCount={nodeCount}
        />

        <Divider />

        <ToolButton icon={<Share2 size={11} />} onClick={onShareLink}>
          {t('v1.toolbar.shareLink')}
        </ToolButton>
        <ToolButton icon={<Download size={11} />} onClick={onExportPng}>
          {t('v1.toolbar.exportPng')}
        </ToolButton>
      </div>
    </div>
  );
}

function Divider() {
  return (
    <div
      style={{
        width: 1,
        height: 20,
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
          background: 'var(--bg-primary)',
          color: 'var(--fg-primary)',
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
        fontSize: 'var(--font-size-2xs)',
        boxShadow: 'var(--shadow-sm)',
        cursor: disabled ? 'not-allowed' : 'pointer',
        opacity: disabled ? 0.5 : 1,
      }}
    >
      {icon}
      {children}
    </button>
  );
}

interface InferenceControlsProps {
  readonly inferenceState: InferenceState;
  readonly pendingCount: number;
  readonly decidedCount: number;
  readonly showInferred: boolean;
  readonly onShowInferredChange: (v: boolean) => void;
  readonly onRunInference: () => void;
  readonly onSafeRerun: () => void;
  readonly onForceRerun: () => void;
  readonly onOpenReview: () => void;
  readonly chapterCount: number;
  readonly nodeCount: number;
}

function InferenceControls({
  inferenceState,
  pendingCount,
  decidedCount,
  showInferred,
  onShowInferredChange,
  onRunInference,
  onSafeRerun,
  onForceRerun,
  onOpenReview,
  chapterCount,
  nodeCount,
}: InferenceControlsProps) {
  const { t } = useTranslation('graph');
  const [popoverOpen, setPopoverOpen] = useState(false);
  const [menuOpen, setMenuOpen] = useState(false);

  if (inferenceState === 'running') {
    return (
      <ToolButton icon={<Loader size={11} className="animate-spin" />} disabled>
        {t('v1.inferred.toolbar.running')}
      </ToolButton>
    );
  }

  if (inferenceState === 'idle') {
    return (
      <div className="relative inline-flex">
        <ToolButton
          onClick={() => setPopoverOpen((v) => !v)}
          icon={<GitBranch size={11} style={{ color: 'var(--accent)' }} />}
        >
          {t('v1.inferred.toolbar.run')}
          <ChevronDown size={11} />
        </ToolButton>
        {popoverOpen && (
          <div
            className="absolute"
            style={{
              top: '100%',
              left: 0,
              marginTop: 6,
              width: 300,
              padding: 14,
              backgroundColor: 'var(--bg-primary)',
              border: '1px solid var(--border)',
              borderRadius: 'var(--radius-md)',
              boxShadow: 'var(--shadow-md, var(--shadow-sm))',
              zIndex: 20,
            }}
          >
            <div
              style={{
                fontFamily: 'var(--font-serif)',
                fontSize: 15,
                fontWeight: 700,
                marginBottom: 8,
                color: 'var(--fg-primary)',
              }}
            >
              {t('v1.inferred.toolbar.popover.title')}
            </div>
            <div className="flex flex-col" style={{ gap: 6, marginBottom: 10 }}>
              <PopoverRow
                label={t('v1.inferred.toolbar.popover.scopeLabel')}
                value={t('v1.inferred.toolbar.popover.scopeValue', { chapters: chapterCount, nodes: nodeCount })}
              />
              <PopoverRow
                label={t('v1.inferred.toolbar.popover.algoLabel')}
                value={t('v1.inferred.toolbar.popover.algoValue')}
              />
              <PopoverRow
                label={t('v1.inferred.toolbar.popover.outputLabel')}
                value={t('v1.inferred.toolbar.popover.outputValue')}
              />
              <PopoverRow
                label={t('v1.inferred.toolbar.popover.costLabel')}
                value={t('v1.inferred.toolbar.popover.costValue')}
              />
            </div>
            <div className="flex items-center justify-end" style={{ gap: 8 }}>
              <button
                onClick={() => setPopoverOpen(false)}
                style={{
                  padding: '5px 10px',
                  fontSize: 'var(--font-size-2xs)',
                  color: 'var(--fg-secondary)',
                  background: 'none',
                  border: 0,
                  cursor: 'pointer',
                }}
              >
                {t('v1.inferred.toolbar.popover.cancel')}
              </button>
              <button
                onClick={() => {
                  onRunInference();
                  setPopoverOpen(false);
                }}
                style={{
                  padding: '5px 12px',
                  borderRadius: 'var(--radius-md)',
                  fontSize: 'var(--font-size-2xs)',
                  backgroundColor: 'var(--accent)',
                  color: 'var(--bg-primary)',
                  border: 0,
                  cursor: 'pointer',
                }}
              >
                {t('v1.inferred.toolbar.popover.start')}
              </button>
            </div>
          </div>
        )}
      </div>
    );
  }

  // inferenceState === 'ready': rerun menu + pending badge + show toggle,
  // each an independently-actuated control (brief §4: 執行/顯示分離).
  return (
    <div className="flex items-center" style={{ gap: 8 }}>
      <div className="relative inline-flex">
        <ToolButton
          onClick={() => setMenuOpen((v) => !v)}
          icon={<GitBranch size={11} style={{ color: 'var(--accent)' }} />}
        >
          {t('v1.inferred.toolbar.rerun')}
          <ChevronDown size={11} />
        </ToolButton>
        {menuOpen && (
          <div
            className="absolute flex flex-col"
            style={{
              top: '100%',
              left: 0,
              marginTop: 6,
              width: 300,
              padding: 6,
              backgroundColor: 'var(--bg-primary)',
              border: '1px solid var(--border)',
              borderRadius: 'var(--radius-md)',
              boxShadow: 'var(--shadow-md, var(--shadow-sm))',
              zIndex: 20,
            }}
          >
            <button
              onClick={() => {
                onSafeRerun();
                setMenuOpen(false);
              }}
              className="flex items-start text-left"
              style={{ gap: 8, padding: 9, background: 'none', border: 0, cursor: 'pointer', borderRadius: 'var(--radius-sm)' }}
            >
              <RotateCcw size={13} style={{ color: 'var(--fg-secondary)', marginTop: 2 }} />
              <div>
                <div style={{ fontSize: 'var(--font-size-2xs)', fontWeight: 600, color: 'var(--fg-primary)' }}>
                  {t('v1.inferred.toolbar.menu.safeRerun')}
                </div>
                <div style={{ fontSize: 'var(--font-size-2xs)', color: 'var(--fg-muted)' }}>
                  {t('v1.inferred.toolbar.menu.safeRerunDesc')}
                </div>
              </div>
            </button>
            <div style={{ borderTop: '1px solid var(--border)', margin: '4px 0' }} />
            <button
              onClick={() => {
                onForceRerun();
                setMenuOpen(false);
              }}
              className="flex items-start text-left"
              style={{ gap: 8, padding: 9, background: 'none', border: 0, cursor: 'pointer', borderRadius: 'var(--radius-sm)' }}
            >
              <AlertTriangle size={13} style={{ color: 'var(--color-error)', marginTop: 2 }} />
              <div>
                <div style={{ fontSize: 'var(--font-size-2xs)', fontWeight: 600, color: 'var(--color-error)' }}>
                  {t('v1.inferred.toolbar.menu.forceRerun')}
                </div>
                <div style={{ fontSize: 'var(--font-size-2xs)', color: 'var(--color-error)', opacity: 0.85 }}>
                  {t('v1.inferred.toolbar.menu.forceRerunDesc', { n: decidedCount })}
                </div>
              </div>
            </button>
          </div>
        )}
      </div>

      {pendingCount > 0 && (
        <button
          onClick={onOpenReview}
          className="inline-flex items-center"
          style={{
            gap: 6,
            padding: '4px 9px',
            borderRadius: 'var(--radius-md)',
            backgroundColor: 'var(--bg-primary)',
            border: '1px solid var(--border)',
            boxShadow: 'var(--shadow-sm)',
            fontSize: 'var(--font-size-2xs)',
            color: 'var(--fg-primary)',
            cursor: 'pointer',
          }}
        >
          <AlertTriangle size={11} style={{ color: 'var(--color-warning)' }} />
          {t('v1.inferred.toolbar.pending')}
          <span
            className="tabular-nums"
            style={{
              padding: '0 6px',
              borderRadius: 'var(--pill-radius, 999px)',
              backgroundColor: 'var(--color-warning-bg)',
              color: 'var(--color-warning)',
            }}
          >
            {pendingCount}
          </span>
          <ArrowRight size={11} style={{ color: 'var(--fg-muted)' }} />
        </button>
      )}

      <ToolButton
        onClick={() => onShowInferredChange(!showInferred)}
        icon={<Eye size={11} />}
        variant={showInferred ? 'warn-active' : 'default'}
      >
        {t('v1.inferred.toolbar.showInferredEdges')}
      </ToolButton>
    </div>
  );
}

function PopoverRow({ label, value }: { readonly label: string; readonly value: string }) {
  return (
    <div className="flex items-start justify-between" style={{ gap: 10, fontSize: 'var(--font-size-2xs)' }}>
      <span style={{ color: 'var(--fg-muted)', flexShrink: 0 }}>{label}</span>
      <span style={{ color: 'var(--fg-secondary)', textAlign: 'right' }}>{value}</span>
    </div>
  );
}
