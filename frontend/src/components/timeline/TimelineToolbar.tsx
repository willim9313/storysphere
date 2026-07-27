/**
 * Timeline toolbar — four segments, ordered by how much each one costs.
 *
 * The previous toolbar put a free view toggle, a free filter, and two
 * multi-minute irreversible LLM runs in one undifferentiated row, with the
 * cost mentioned only in a `title` tooltip and no confirmation step. The
 * segments here exist to separate 檢視 / 篩選 / 疊加 from 分析動作.
 *
 * Each expensive action is an ActionRow with a fixed five-slot structure and
 * *two* lines of status text. One line does not fit: the segment is ~314px
 * wide and any real sentence gets truncated.
 */

import { useTranslation } from 'react-i18next';
import { SlidersHorizontal } from 'lucide-react';
import type { FilterMode } from './filterState';

export interface ActionRowState {
  /** Enabled and clickable. */
  ready: boolean;
  running: boolean;
  /** 0–1 while running, else null. */
  progress: number | null;
  /** Line 1: status and progress. */
  status: string;
  /** Line 2: cost, or the reason it is blocked. */
  sub: string;
  /** True when `sub` explains a blocker and should read as actionable. */
  blocked: boolean;
  onSubClick?: () => void;
}

interface TimelineToolbarProps {
  totalCount: number;
  analyzedCount: number;
  matchCount: number;
  onlyAnalyzed: boolean;
  onOnlyAnalyzedChange: (v: boolean) => void;
  filterCount: number;
  filterMode: FilterMode;
  filterOpen: boolean;
  onToggleFilter: () => void;
  lanesOn: boolean;
  onToggleLanes: () => void;
  storyOrder: ActionRowState;
  onRunStoryOrder: () => void;
  onCancelStoryOrder: () => void;
  displacement: ActionRowState;
  onRunDisplacement: () => void;
  onCancelDisplacement: () => void;
  children?: React.ReactNode;
}

export function TimelineToolbar({
  totalCount,
  analyzedCount,
  matchCount,
  onlyAnalyzed,
  onOnlyAnalyzedChange,
  filterCount,
  filterMode,
  filterOpen,
  onToggleFilter,
  lanesOn,
  onToggleLanes,
  storyOrder,
  onRunStoryOrder,
  onCancelStoryOrder,
  displacement,
  onRunDisplacement,
  onCancelDisplacement,
  children,
}: TimelineToolbarProps) {
  const { t } = useTranslation('analysis');

  return (
    <div className="tl-toolbar">
      <section className="tl-toolbar-seg">
        <div className="tl-toolbar-seg-label">{t('timeline.toolbar.scope')}</div>
        <div className="tl-segmented" role="group" aria-label={t('timeline.toolbar.scope')}>
          <button
            type="button"
            className={`tl-segmented-item${onlyAnalyzed ? '' : ' active'}`}
            onClick={() => onOnlyAnalyzedChange(false)}
            aria-pressed={!onlyAnalyzed}
          >
            {t('timeline.toolbar.scopeAll', { n: totalCount })}
          </button>
          <button
            type="button"
            className={`tl-segmented-item${onlyAnalyzed ? ' active' : ''}`}
            onClick={() => onOnlyAnalyzedChange(true)}
            aria-pressed={onlyAnalyzed}
          >
            {t('timeline.toolbar.scopeAnalyzed', { n: analyzedCount })}
          </button>
        </div>
      </section>

      <section className="tl-toolbar-seg">
        <div className="tl-toolbar-seg-label">{t('timeline.toolbar.filter')}</div>
        <div className="tl-toolbar-filter">
          <button
            type="button"
            className={`tl-btn${filterCount > 0 ? ' tl-btn-on' : ''}`}
            onClick={onToggleFilter}
            aria-expanded={filterOpen}
          >
            <SlidersHorizontal size={13} />
            {t('timeline.filter')}
            {filterCount > 0 && <span className="tl-badge">{filterCount}</span>}
          </button>
          <span className="tl-toolbar-match">
            {t('timeline.toolbar.match', { n: matchCount, total: totalCount })}
            {filterCount > 0 && (
              <span className="tl-toolbar-mode">
                {filterMode === 'dim'
                  ? t('timeline.filterModeDim')
                  : t('timeline.filterModeOnly')}
              </span>
            )}
          </span>
          {children}
        </div>
      </section>

      <section className="tl-toolbar-seg">
        <div className="tl-toolbar-seg-label">{t('timeline.toolbar.overlay')}</div>
        <button
          type="button"
          className={`tl-btn${lanesOn ? ' tl-btn-on-solid' : ''}`}
          onClick={onToggleLanes}
          aria-pressed={lanesOn}
        >
          {lanesOn ? t('timeline.toolbar.lanesOn') : t('timeline.toolbar.lanesOff')}
        </button>
      </section>

      <section className="tl-toolbar-seg tl-toolbar-actions">
        <div className="tl-toolbar-seg-label">
          {t('timeline.toolbar.analysis')}
          <span className="tl-toolbar-seg-note">{t('timeline.toolbar.analysisNote')}</span>
        </div>
        <ActionRow
          name={t('timeline.action.storyOrder')}
          state={storyOrder}
          runLabel={t('timeline.action.storyOrderRun')}
          onRun={onRunStoryOrder}
          onCancel={onCancelStoryOrder}
          emphasis
        />
        <ActionRow
          name={t('timeline.action.displacement')}
          state={displacement}
          runLabel={t('timeline.action.displacementRun')}
          onRun={onRunDisplacement}
          onCancel={onCancelDisplacement}
        />
      </section>
    </div>
  );
}

function ActionRow({
  name,
  state,
  runLabel,
  onRun,
  onCancel,
  emphasis,
}: {
  name: string;
  state: ActionRowState;
  runLabel: string;
  onRun: () => void;
  onCancel: () => void;
  emphasis?: boolean;
}) {
  const { t } = useTranslation('analysis');

  return (
    <div className={`tl-action-row${emphasis ? ' emphasis' : ''}`}>
      <span className={`tl-action-dot${state.ready || state.running ? ' on' : ''}`} />
      <span className={`tl-action-name${state.ready || state.running ? '' : ' muted'}`}>
        {name}
      </span>
      <span className="tl-action-text">
        <span className="tl-action-status">{state.status}</span>
        {state.onSubClick ? (
          <button
            type="button"
            className={`tl-action-sub link${state.blocked ? ' blocked' : ''}`}
            onClick={state.onSubClick}
          >
            {state.sub}
          </button>
        ) : (
          <span className={`tl-action-sub${state.blocked ? ' blocked' : ''}`}>{state.sub}</span>
        )}
      </span>
      {state.running ? (
        <button type="button" className="tl-btn" onClick={onCancel}>
          {t('timeline.action.cancel')}
        </button>
      ) : (
        <button
          type="button"
          className={`tl-btn${state.ready ? ' tl-btn-accent' : ''}`}
          onClick={onRun}
          disabled={!state.ready}
          /* "…" marks an action that opens a confirmation first. */
        >
          {runLabel}
        </button>
      )}
      {/* A solid 3px rail, not a translucent wash over the row: under the Ink
          theme --accent is near-black, and a 35% overlay drops the muted text
          to a 1.4:1 contrast ratio. */}
      {state.running && state.progress !== null && (
        <span className="tl-action-progress" style={{ width: `${state.progress * 100}%` }} />
      )}
    </div>
  );
}
