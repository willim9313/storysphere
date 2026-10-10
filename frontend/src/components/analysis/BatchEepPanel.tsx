import { CheckSquare, ChevronDown, ChevronRight } from 'lucide-react';
import { useTranslation } from 'react-i18next';

import { LlmUnconfiguredNotice } from '@/components/ui/LlmUnconfiguredNotice';
import { Tooltip } from '@/components/ui/Tooltip';
import { useBatchPanelCollapse } from '@/hooks/useBatchPanelCollapse';
import type { TaskStatus, BatchEepResult } from '@/api/types';
import { batchPanelState, type BatchPanelPage } from './batchPanelModel';

interface BatchEepPanelProps {
  /** Collapse override is remembered per book × page (09·10 決議紀錄 B 區). */
  bookId: string;
  page: BatchPanelPage;
  analyzedCount: number;
  totalCount: number;
  batchTask: TaskStatus | undefined;
  /** The run's stage line, worded by `useBatchTask`; falls back to the task's own text. */
  stage?: string;
  isBatchRunning: boolean;
  batchError: string | null;
  batchSummary: BatchEepResult | null;
  onTrigger: () => void;
  /** The batch trigger came back 503 "no LLM provider": say so in place of the generic error. */
  llmBlocked?: boolean;
  isPending: boolean;
  /** i18n key prefix; defaults to `'batch'` (event analysis page).
   * The character page passes `'character.batch'` so its keys live under
   * the `character.*` namespace. */
  i18nPrefix?: string;
  /** The idle status line, composed by the page: events add the ETA, characters
   *  have no estimate formula so they leave it out. */
  pendingLine: string;
  /** Items from the last run that are still failing (面板只放失敗「數」，不列清單). */
  failedCount: number;
  /** Narrows the list below to the failed items. Omitted when the run carried
   *  no ids to filter by — the count still shows, the link does not. */
  onShowFailures?: () => void;
  /** Subset controls (event analysis page). */
  subset?: {
    /** Chapter of the currently selected event, or null when nothing is selected. */
    currentChapter: number | null;
    onBatchChapter: () => void;
    checkMode: boolean;
    onToggleCheckMode: () => void;
  };
  /** The one subset the character page has: the top-N by mentions. */
  topSubset?: {
    count: number;
    onTrigger: () => void;
  };
}

/**
 * Left-column batch panel, shared by the event and character pages
 * (DS v3 第 5 批 · 09·10).
 *
 * Four states, derived from data only (see `batchPanelState`): 1 pending ·
 * 2 running · 3 finished with failures or leftovers · 4 all analyzed, which
 * shrinks to a status row with no fold and no progress bar. States 1–3 fold to
 * one line; the whole header row is the toggle. The progress bar stays in the
 * first three states folded or not, so the column top never jumps.
 *
 * Failures are a number and a link, never a list: the failed items are rows in
 * the list below, which "只看失敗" narrows to them.
 */
export function BatchEepPanel({
  bookId,
  page,
  analyzedCount,
  totalCount,
  batchTask,
  stage: stageProp,
  isBatchRunning,
  batchError,
  batchSummary,
  onTrigger,
  llmBlocked = false,
  isPending,
  i18nPrefix = 'batch',
  pendingLine,
  failedCount,
  onShowFailures,
  subset,
  topSubset,
}: BatchEepPanelProps) {
  const { t } = useTranslation('analysis');
  const k = (suffix: string) => `${i18nPrefix}.${suffix}`;
  const unanalyzedCount = Math.max(totalCount - analyzedCount, 0);

  const state = batchPanelState({
    totalCount,
    unanalyzedCount,
    running: isBatchRunning,
    hasSummary: batchSummary !== null,
    failedCount,
  });
  const { collapsed, toggle } = useBatchPanelCollapse(bookId, page, state);

  /* `analyzedCount` is the server's own count and the page refetches it as the
     batch advances, so it is live during a run. The per-item counter lives in
     `stage` ("分析事件 12/57"), rendered below. */
  const pct = totalCount > 0 ? Math.round((analyzedCount / totalCount) * 100) : 0;
  const stage = stageProp ?? batchTask?.stage ?? '';
  // 「分析中 N/M…」 counts this run (README §3.5): N = items the run has walked,
  // M = items it was given — a subset run says 3, not the whole book. Before
  // the task reports its first stage it has no total, so fall back to the book.
  const runTotal = batchTask?.subTotal ?? 0;
  const runningLabel =
    runTotal > 0
      ? t(k('runningWithCount'), { current: Math.min(batchTask?.subProgress ?? 0, runTotal), total: runTotal })
      : t(k('runningWithCount'), { current: analyzedCount, total: totalCount });

  const cardClass =
    'ea-batch' +
    (state === 'running' ? ' running' : '') +
    (collapsed ? ' is-collapsed' : '') +
    (state === 'done' ? ' is-done' : '');

  const showFailNumber = failedCount > 0 && state === 'attention';
  const failNumberText = t(k('failedShort'), { count: failedCount });

  /* Right end of the header row. Folded, it says what is most worth knowing:
     running > failures > pending count. Open, it is the count and percentage. */
  let value: React.ReactNode;
  if (collapsed) {
    if (state === 'running') {
      value = (
        <span className="ea-batch-value is-live">
          <span className="ea-batch-spinner" aria-hidden="true" />
          {runningLabel}
        </span>
      );
    } else if (showFailNumber) {
      value = onShowFailures ? null : (
        <span className="ea-batch-value is-failed">{failNumberText}</span>
      );
    } else {
      value = (
        <span className="ea-batch-value">{t(k('remaining'), { count: unanalyzedCount })}</span>
      );
    }
  } else {
    value = (
      <span className="ea-batch-value is-count">
        {analyzedCount}/{totalCount} · {pct}%
      </span>
    );
  }

  if (state === 'done') {
    return (
      <div className="ea-batch-wrap">
        <div className={cardClass}>
          <div className="ea-batch-head">
            <span className="ea-batch-label">{t(k('header'))}</span>
            <span className="ea-batch-value">{t(k('allDone'))}</span>
          </div>
        </div>
        {llmBlocked && <LlmUnconfiguredNotice />}
      </div>
    );
  }

  const Chevron = collapsed ? ChevronRight : ChevronDown;

  return (
    <div className="ea-batch-wrap">
      <div className={cardClass}>
        <div className="ea-batch-head">
          <button
            type="button"
            className="ea-batch-toggle"
            aria-expanded={!collapsed}
            onClick={toggle}
          >
            <Chevron size={12} aria-hidden="true" />
            <span className="ea-batch-label">{t(k('header'))}</span>
            {value}
          </button>
          {collapsed && showFailNumber && onShowFailures && (
            <button
              type="button"
              className="ea-batch-value is-failed ea-batch-failnum"
              onClick={onShowFailures}
            >
              {failNumberText}
            </button>
          )}
        </div>

        <div
          className="ea-batch-track"
          role="progressbar"
          aria-valuenow={pct}
          aria-valuemin={0}
          aria-valuemax={100}
        >
          <div className="ea-batch-fill" style={{ width: pct + '%' }} />
        </div>

        {!collapsed && (
          <>
            {state === 'running' ? (
              <div className="ea-batch-pct">
                <span className="ea-batch-spinner" aria-hidden="true" />
                <Tooltip label={stage || t(k('running'))} disabled={!stage}>
                  <span className="stage">{stage || t(k('running'))}</span>
                </Tooltip>
                <span className="live">▶ live</span>
              </div>
            ) : (
              <p className="ea-batch-status">
                {batchError && !llmBlocked ? (
                  <span className="is-error">{batchError}</span>
                ) : state === 'attention' && batchSummary ? (
                  t(k('summaryProgress'), { count: batchSummary.progress })
                ) : (
                  pendingLine
                )}
              </p>
            )}

            {state === 'running' ? (
              <button
                className="ss-btn ss-btn-sm ss-btn-secondary ea-batch-main"
                disabled
                type="button"
              >
                <span className="ea-batch-spinner" aria-hidden="true" />
                {runningLabel}
              </button>
            ) : (
              <button
                className="ss-btn ss-btn-sm ss-btn-primary ss-btn-llm ea-batch-main"
                type="button"
                onClick={onTrigger}
                disabled={isPending || unanalyzedCount === 0}
              >
                {t(k('triggerAll'))}
              </button>
            )}

            {state === 'attention' && batchSummary && (
              <div className="ea-batch-section">
                <div className="ea-batch-stats">
                  <div className="ea-batch-stat">
                    <span className="ea-batch-stat-n">
                      {batchSummary.progress - batchSummary.skipped - batchSummary.failed}
                    </span>
                    <span className="ea-batch-stat-l">{t(k('stat.generated'))}</span>
                  </div>
                  <div className="ea-batch-stat">
                    <span className="ea-batch-stat-n">{batchSummary.skipped}</span>
                    <span className="ea-batch-stat-l">{t(k('stat.skipped'))}</span>
                  </div>
                  <div className="ea-batch-stat">
                    <span className="ea-batch-stat-n">{batchSummary.failed}</span>
                    <span className="ea-batch-stat-l">{t(k('stat.failed'))}</span>
                  </div>
                </div>
                {failedCount > 0 && onShowFailures && (
                  <button type="button" className="ea-batch-link" onClick={onShowFailures}>
                    {t(k('showFailures'), { count: failedCount })}
                  </button>
                )}
                {/* Run-scoped (README 共通規則): the failure list belongs to this run and
                    a refresh drops it. Shared wording, so both pages say the same thing. */}
                {failedCount > 0 && <p className="ea-batch-hint">{t('batch.failures.hint')}</p>}
              </div>
            )}

            {/* Subset controls: same card, straight under the main button, not behind a
                fold — they are how a 60-event book gets affordable. They fold with the
                main button (same card, in and out together). The event buttons run
                immediately (no confirm dialog, by design); gating is the guard. */}
            {subset && state === 'pending' && (
              <div className="ea-batch-subset">
                <div className="ea-batch-subset-row">
                  <Tooltip
                    label={t(k('chapterOnlyDisabled'))}
                    disabled={subset.currentChapter !== null}
                  >
                    <button
                      type="button"
                      className="ss-btn ss-btn-sm ss-btn-secondary ss-btn-llm"
                      disabled={subset.currentChapter === null || isPending}
                      onClick={subset.onBatchChapter}
                    >
                      {t(k('chapterOnly'))}
                    </button>
                  </Tooltip>
                </div>
                {/* In check mode the list takes over (取消勾選 / 生成已勾選 live there, 10 C 區). */}
                {!subset.checkMode && (
                  <button
                    type="button"
                    className="ss-btn ss-btn-sm ss-btn-secondary"
                    onClick={subset.onToggleCheckMode}
                  >
                    <CheckSquare size={11} /> {t(k('checkModeOn'))}
                  </button>
                )}
              </div>
            )}

            {topSubset && state === 'pending' && (
              <div className="ea-batch-subset is-top">
                <button
                  type="button"
                  className="ss-btn ss-btn-sm ss-btn-secondary ss-btn-llm"
                  disabled={topSubset.count === 0 || isPending}
                  onClick={topSubset.onTrigger}
                >
                  {t(k('topSubset'))}
                </button>
              </div>
            )}
          </>
        )}
      </div>

      {/* Outside the fold: this is a state of the feature, and it must not be
          hidden by a folded panel. */}
      {llmBlocked && state !== 'running' && <LlmUnconfiguredNotice />}
    </div>
  );
}
