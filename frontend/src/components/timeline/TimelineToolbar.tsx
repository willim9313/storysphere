/**
 * Timeline toolbar — two halves split by one solid rule.
 *
 * Left is 看什麼 (scope, filter, how non-matching events are drawn, the lane
 * overlay) and costs nothing; right is 跑什麼 (the analysis actions, which
 * spend tokens). Side by side they read as one kind of control, hence the
 * rule. The right half is passed in as `actions`.
 */

import { useTranslation } from 'react-i18next';
import { SlidersHorizontal } from 'lucide-react';
import type { FilterMode } from './filterState';

interface TimelineToolbarProps {
  totalCount: number;
  analyzedCount: number;
  matchCount: number;
  onlyAnalyzed: boolean;
  onOnlyAnalyzedChange: (v: boolean) => void;
  filterCount: number;
  filterMode: FilterMode;
  onFilterModeChange: (m: FilterMode) => void;
  filterOpen: boolean;
  onToggleFilter: () => void;
  lanesOn: boolean;
  onToggleLanes: () => void;
  /** Filter popover, anchored to the 篩選 cluster. */
  children?: React.ReactNode;
  /** The 分析動作 panel. */
  actions: React.ReactNode;
}

export function TimelineToolbar({
  totalCount,
  analyzedCount,
  matchCount,
  onlyAnalyzed,
  onOnlyAnalyzedChange,
  filterCount,
  filterMode,
  onFilterModeChange,
  filterOpen,
  onToggleFilter,
  lanesOn,
  onToggleLanes,
  children,
  actions,
}: TimelineToolbarProps) {
  const { t } = useTranslation('analysis');

  return (
    <div className="tl-toolbar">
      <div className="tl-toolbar-left">
        <div className="tl-cluster">
          <span className="tl-cluster-label">{t('timeline.toolbar.scope')}</span>
          <div className="ss-seg" role="group" aria-label={t('timeline.toolbar.scope')}>
            <button
              type="button"
              className={`ss-seg-item${onlyAnalyzed ? '' : ' active'}`}
              onClick={() => onOnlyAnalyzedChange(false)}
              aria-pressed={!onlyAnalyzed}
            >
              {t('timeline.toolbar.scopeAll', { n: totalCount })}
            </button>
            <button
              type="button"
              className={`ss-seg-item${onlyAnalyzed ? ' active' : ''}`}
              onClick={() => onOnlyAnalyzedChange(true)}
              aria-pressed={onlyAnalyzed}
            >
              {t('timeline.toolbar.scopeAnalyzed', { n: analyzedCount })}
            </button>
          </div>
        </div>

        <div className="tl-cluster">
          <span className="tl-cluster-label">{t('timeline.toolbar.filter')}</span>
          <div className="tl-cluster-row tl-filter-anchor">
            <button
              type="button"
              className="ss-btn ss-btn-sm ss-btn-secondary"
              onClick={onToggleFilter}
              aria-expanded={filterOpen}
            >
              <SlidersHorizontal size={12} aria-hidden="true" />
              {t('timeline.filter')}
              {filterCount > 0 && <span className="tl-badge">{filterCount}</span>}
            </button>
            <span className="tl-toolbar-match">
              {t('timeline.toolbar.match', { n: matchCount, total: totalCount })}
            </span>
            {children}
          </div>
        </div>

        <div className="tl-cluster">
          <span className="tl-cluster-label">{t('timeline.filterModeLabel')}</span>
          <div className="ss-seg" role="group" aria-label={t('timeline.filterModeLabel')}>
            <button
              type="button"
              className={`ss-seg-item${filterMode === 'dim' ? ' active' : ''}`}
              onClick={() => onFilterModeChange('dim')}
              aria-pressed={filterMode === 'dim'}
            >
              {t('timeline.filterModeDim')}
            </button>
            <button
              type="button"
              className={`ss-seg-item${filterMode === 'only' ? ' active' : ''}`}
              onClick={() => onFilterModeChange('only')}
              aria-pressed={filterMode === 'only'}
            >
              {t('timeline.filterModeOnly')}
            </button>
          </div>
          <span className="tl-cluster-hint">
            {filterMode === 'dim'
              ? t('timeline.filterModeDimHint')
              : t('timeline.filterModeOnlyHint')}
          </span>
        </div>

        <div className="tl-cluster">
          <span className="tl-cluster-label">{t('timeline.toolbar.overlay')}</span>
          <button
            type="button"
            className={`ss-btn ss-btn-sm ${lanesOn ? 'ss-btn-primary' : 'ss-btn-secondary'}`}
            onClick={onToggleLanes}
            aria-pressed={lanesOn}
          >
            {lanesOn ? t('timeline.toolbar.lanesOn') : t('timeline.toolbar.lanesOff')}
          </button>
        </div>
      </div>

      <div className="tl-toolbar-right">{actions}</div>
    </div>
  );
}
