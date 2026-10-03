import { Check, Play, CheckSquare } from 'lucide-react';
import { useTranslation } from 'react-i18next';

import { BatchFailureList } from '@/components/analysis/BatchFailureList';
import { LlmUnconfiguredNotice } from '@/components/ui/LlmUnconfiguredNotice';
import { Tooltip } from '@/components/ui/Tooltip';
import type { TaskStatus, BatchEepResult } from '@/api/types';

interface BatchEepPanelProps {
  analyzedCount: number;
  totalCount: number;
  batchTask: TaskStatus | undefined;
  isBatchRunning: boolean;
  batchError: string | null;
  batchSummary: BatchEepResult | null;
  onTrigger: () => void;
  /** The batch trigger came back 503 "no LLM provider": say so in place of the generic error. */
  llmBlocked?: boolean;
  isPending: boolean;
  /** i18n key prefix; defaults to `'batch'` (event analysis page).
   * Character page passes `'character.batch'` so keys live under
   * the `character.*` namespace alongside other character-specific strings. */
  i18nPrefix?: string;
  /** Optional subset controls (event analysis page). Omit for a plain
   *  "run everything" panel. */
  subset?: {
    /** Unanalyzed KERNEL events. Stays 0 until EEPs exist — the backend only
     *  assigns importance during analysis — so the button self-disables. */
    kernelRemaining: number;
    onBatchKernel: () => void;
    /** Chapter of the currently selected event, or null when nothing is selected. */
    currentChapter: number | null;
    onBatchChapter: () => void;
    checkMode: boolean;
    onToggleCheckMode: () => void;
    checkedCount: number;
    onBatchChecked: () => void;
    etaLabel: string;
  };
}

export function BatchEepPanel({
  analyzedCount,
  totalCount,
  batchTask,
  isBatchRunning,
  batchError,
  batchSummary,
  onTrigger,
  llmBlocked = false,
  isPending,
  i18nPrefix = 'batch',
  subset,
}: BatchEepPanelProps) {
  const { t } = useTranslation('analysis');
  const k = (suffix: string) => `${i18nPrefix}.${suffix}`;
  const allDone = analyzedCount >= totalCount && totalCount > 0;

  /* `analyzedCount` is the server's own count and the page refetches it as the
     batch advances, so it is live during a run. It used to have the task's own
     tally added on top — which read `result.progress`, a field that only
     exists once the task is done, so the count sat frozen for the whole run.
     The per-item counter lives in `stage` ("分析事件 12/57"), rendered below. */
  const pct = totalCount > 0 ? Math.round((analyzedCount / totalCount) * 100) : 0;
  const showSummary = !isBatchRunning && batchSummary !== null;
  const stage = batchTask?.stage ?? '';

  return (
    <div className={'ea-batch' + (isBatchRunning ? ' running' : '')}>
      <div className="ea-batch-head">
        <span className="ea-batch-label">{t(k('header'))}</span>
        <span className="ea-batch-count">
          {analyzedCount}/{totalCount}
          <span className="total"> · {pct}%</span>
        </span>
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

      <div className="ea-batch-pct">
        {isBatchRunning ? (
          <>
            <Tooltip label={stage || t(k('running'))} disabled={!stage}>
              <span className="stage">{stage || t(k('running'))}</span>
            </Tooltip>
            <span className="live">
              <Play size={9} /> live
            </span>
          </>
        ) : batchError && !llmBlocked ? (
          <span style={{ color: 'var(--color-error)' }}>
            {batchError || t(k('errorFallback'))}
          </span>
        ) : showSummary && batchSummary ? (
          <span>{t(k('summaryProgress'), { count: batchSummary.progress })}</span>
        ) : allDone ? (
          <span>{t(k('allDone'))}</span>
        ) : (
          <span>{t(k('remaining'), { count: totalCount - analyzedCount })}</span>
        )}
      </div>

      {showSummary && batchSummary && (
        <div className="ea-batch-stats">
          <div className="ea-batch-stat">
            <span className="ea-batch-stat-n">
              {batchSummary.progress - batchSummary.skipped - batchSummary.failed}
            </span>
            <span className="ea-batch-stat-l">{t(k('stat.generated'))}</span>
          </div>
          <div className="ea-batch-stat skipped">
            <span className="ea-batch-stat-n">{batchSummary.skipped}</span>
            <span className="ea-batch-stat-l">{t(k('stat.skipped'))}</span>
          </div>
          <div className="ea-batch-stat failed">
            <span className="ea-batch-stat-n">{batchSummary.failed}</span>
            <span className="ea-batch-stat-l">{t(k('stat.failed'))}</span>
          </div>
        </div>
      )}

      {/* Next to the count it explains, not in the toast: the toast is
          dismissible and auto-hides, so a list inside it would take the only
          answer to "which ones?" off screen with it (B-113). */}
      {showSummary && batchSummary && (
        <BatchFailureList failures={batchSummary.failures ?? []} />
      )}

      {isBatchRunning ? (
        <button className="ss-btn ss-btn-md ss-btn-secondary ea-batch-main" disabled type="button">
          <span className="ea-mini-spinner" />
          {t(k('runningWithCount'), { current: analyzedCount, total: totalCount })}
        </button>
      ) : allDone ? (
        <button className="ss-btn ss-btn-md ss-btn-secondary ea-batch-main" disabled type="button">
          <Check size={12} /> {t(k('allDone'))}
        </button>
      ) : (
        <button
          className="ss-btn ss-btn-md ss-btn-primary ss-btn-llm ea-batch-main"
          type="button"
          onClick={onTrigger}
          disabled={isPending}
        >
          {t(k('triggerAll'))}
        </button>
      )}

      {llmBlocked && !isBatchRunning && <LlmUnconfiguredNotice />}

      {/* Subset controls: same card, straight under the main button, not behind a
          fold — they are how a 60-event book gets affordable. The three buttons
          run immediately (no confirm dialog, by design); gating is the guard. */}
      {subset && !isBatchRunning && !allDone && (
        <div className="ea-batch-subset">
          <div className="ea-batch-subset-row">
            <Tooltip
              label={t(k('kernelOnlyDisabled'))}
              disabled={subset.kernelRemaining !== 0}
            >
              <button
                type="button"
                className="ss-btn ss-btn-sm ss-btn-secondary ss-btn-llm"
                disabled={subset.kernelRemaining === 0 || isPending}
                onClick={subset.onBatchKernel}
              >
                {t(k('kernelOnly'), { count: subset.kernelRemaining })}
              </button>
            </Tooltip>
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
          <button
            type="button"
            className={
              'ss-btn ss-btn-sm ss-btn-ghost' + (subset.checkMode ? ' is-active' : '')
            }
            aria-pressed={subset.checkMode}
            onClick={subset.onToggleCheckMode}
          >
            <CheckSquare size={11} />{' '}
            {subset.checkMode ? t(k('checkModeOff')) : t(k('checkModeOn'))}
          </button>
          {subset.checkMode && (
            <button
              type="button"
              className="ss-btn ss-btn-sm ss-btn-primary ss-btn-llm"
              disabled={subset.checkedCount === 0 || isPending}
              onClick={subset.onBatchChecked}
            >
              {t(k('generateChecked'))} ({subset.checkedCount})
            </button>
          )}
        </div>
      )}

      {!showSummary && !isBatchRunning && !allDone && (
        <p className="ea-batch-hint">
          {subset ? `${subset.etaLabel} · ${t(k('autoSkip'))}` : t(k('autoSkip'))}
        </p>
      )}
    </div>
  );
}

