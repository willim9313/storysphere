import { useState, type CSSProperties, type ReactNode } from 'react';
import {
  Search,
  RotateCcw,
  GitBranch,
  ChevronDown,
  Loader,
  AlertTriangle,
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
  /** Rendered anchored under the search box (the results dropdown). */
  readonly searchDropdown?: ReactNode;
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
}

// 鏡頭是三個不同的問題，不是三種樣式：每格副標寫出它問什麼，
// 這樣導覽條關掉之後畫面上仍說得清三者的差別。
const CLUSTER_MODES: { mode: ClusterMode; labelKey: string; subKey: string }[] = [
  { mode: 'node', labelKey: 'v1.cluster.mode.node', subKey: 'mode.subtitle.node' },
  { mode: 'type', labelKey: 'v1.cluster.mode.type', subKey: 'mode.subtitle.type' },
  { mode: 'community', labelKey: 'v1.cluster.mode.community', subKey: 'mode.subtitle.community' },
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

function chipStyle(dotKey: string): CSSProperties {
  return {
    '--chip-bg': `var(--entity-${dotKey}-bg)`,
    '--chip-border': `var(--entity-${dotKey}-border)`,
    '--chip-fg': `var(--entity-${dotKey}-fg)`,
    '--chip-dot': `var(--entity-${dotKey}-dot)`,
  } as CSSProperties;
}

/**
 * One-row toolbar (control height 32, type chips 22). A flush bar above the
 * canvas rather than floating over it, so it never hides the graph; when the
 * viewport is too narrow the row wraps, nothing is clipped.
 */
export function GraphToolbar({
  searchQuery,
  onSearchChange,
  onSearchFocus,
  searchDropdown,
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
}: GraphToolbarProps) {
  const { t } = useTranslation('graph');

  return (
    <div className="kg-toolbar">
      <div className="kg-mode" role="radiogroup" aria-label={t('v1.cluster.label', '群集模式')}>
        {CLUSTER_MODES.map(({ mode, labelKey, subKey }) => {
          const active = clusterMode === mode;
          return (
            <button
              key={mode}
              type="button"
              role="radio"
              aria-checked={active}
              onClick={() => onClusterModeChange(mode)}
              className={active ? 'kg-mode-item is-active' : 'kg-mode-item'}
            >
              <span className="kg-mode-label">{t(labelKey)}</span>
              <span className="kg-mode-sub">{t(subKey)}</span>
            </button>
          );
        })}
      </div>

      <div className="kg-sep" />

      <div className="kg-search">
        <div className="kg-search-box">
          <Search size={13} />
          <input
            type="text"
            value={searchQuery}
            onChange={(e) => onSearchChange(e.target.value)}
            onFocus={onSearchFocus}
            placeholder={t('v1.toolbar.searchPlaceholder')}
          />
        </div>
        {searchDropdown}
      </div>

      <button type="button" onClick={onReset} className="ss-btn ss-btn-sm ss-btn-secondary">
        <RotateCcw size={11} />
        {t('v1.toolbar.reset')}
      </button>

      {/* Type chips: the ONLY entrance of the type switch (C6) — the legend only explains. */}
      <div className="kg-chips">
        {TYPE_CHIPS.map(({ type, dotKey }) => {
          const on = visibleTypes.has(type);
          return (
            <button
              key={type}
              type="button"
              onClick={() => onTypeToggle(type)}
              aria-pressed={on}
              className={on ? 'kg-chip' : 'kg-chip is-off'}
              style={chipStyle(dotKey)}
            >
              <span className="kg-chip-dot" />
              {t(`entityTypes.${type}`)}
            </button>
          );
        })}
      </div>

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
    </div>
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

/**
 * Inference is a pure graph algorithm — synchronous, no LLM — so it carries NO
 * cost glyph, and the button always has 「無 token 成本」 under it (the popover's
 * fourth row says the same thing; the popover needs a click, this does not).
 * While it runs there is only a spinner and 「推論中…」: nothing to report
 * progress on, so no progress bar.
 */
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
      <div className="kg-infer-running" role="status">
        <Loader size={13} className="animate-spin" />
        {t('v1.inferred.toolbar.running')}
      </div>
    );
  }

  if (inferenceState === 'idle') {
    return (
      <div className="kg-infer">
        <button
          type="button"
          onClick={() => setPopoverOpen((v) => !v)}
          aria-expanded={popoverOpen}
          className="ss-btn ss-btn-sm ss-btn-secondary"
        >
          <GitBranch size={11} style={{ color: 'var(--accent)' }} />
          {t('v1.inferred.toolbar.run')}
          <ChevronDown size={11} />
        </button>
        <span className="kg-infer-note">{t('inference.noTokenCostInline')}</span>
        {popoverOpen && (
          <div className="kg-pop kg-pop-form">
            <span className="kg-pop-title">{t('v1.inferred.toolbar.popover.title')}</span>
            <div className="kg-pop-rows">
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
            <div className="kg-pop-actions">
              <button type="button" onClick={() => setPopoverOpen(false)} className="ss-btn ss-btn-sm ss-btn-ghost">
                {t('v1.inferred.toolbar.popover.cancel')}
              </button>
              <button
                type="button"
                onClick={() => {
                  onRunInference();
                  setPopoverOpen(false);
                }}
                className="ss-btn ss-btn-sm ss-btn-primary"
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
    <div className="kg-infer-row">
      <div className="kg-infer">
        <button
          type="button"
          onClick={() => setMenuOpen((v) => !v)}
          aria-expanded={menuOpen}
          className="ss-btn ss-btn-sm ss-btn-secondary"
        >
          <GitBranch size={11} style={{ color: 'var(--accent)' }} />
          {t('v1.inferred.toolbar.rerun')}
          <ChevronDown size={11} />
        </button>
        <span className="kg-infer-note">{t('inference.noTokenCostInline')}</span>
        {menuOpen && (
          <div className="kg-pop kg-menu">
            {/* Safe rerun is an ordinary row; force rerun is the danger row (it
                destroys decisions) — different visual weight on purpose. */}
            <button
              type="button"
              onClick={() => {
                onSafeRerun();
                setMenuOpen(false);
              }}
              className="kg-menu-item"
            >
              <RotateCcw size={13} className="kg-menu-icon" />
              <span>
                <span className="kg-menu-title" style={{ display: 'block' }}>
                  {t('v1.inferred.toolbar.menu.safeRerun')}
                </span>
                <span className="kg-menu-desc">{t('v1.inferred.toolbar.menu.safeRerunDesc')}</span>
              </span>
            </button>
            <button
              type="button"
              onClick={() => {
                onForceRerun();
                setMenuOpen(false);
              }}
              className="kg-menu-item is-danger"
            >
              <AlertTriangle size={13} className="kg-menu-icon" />
              <span>
                <span className="kg-menu-title" style={{ display: 'block' }}>
                  {t('v1.inferred.toolbar.menu.forceRerun')}
                </span>
                <span className="kg-menu-desc">{t('v1.inferred.toolbar.menu.forceRerunDesc', { n: decidedCount })}</span>
              </span>
            </button>
          </div>
        )}
      </div>

      {pendingCount > 0 && (
        <button type="button" onClick={onOpenReview} className="kg-pending">
          <AlertTriangle size={11} />
          {t('v1.inferred.toolbar.pending')}
          <span className="kg-pending-count">{pendingCount}</span>
          <ArrowRight size={11} />
        </button>
      )}

      <button
        type="button"
        role="switch"
        aria-checked={showInferred}
        onClick={() => onShowInferredChange(!showInferred)}
        className="kg-switch"
      >
        <span className="kg-switch-track">
          <span className="kg-switch-knob" />
        </span>
        {t('v1.inferred.toolbar.showInferredEdges')}
      </button>
    </div>
  );
}

function PopoverRow({ label, value }: { readonly label: string; readonly value: string }) {
  return (
    <div className="kg-pop-row">
      <span className="kg-pop-key">{label}</span>
      <span className="kg-pop-val">{value}</span>
    </div>
  );
}
