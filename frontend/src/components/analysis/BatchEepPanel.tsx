import { Sparkles, Check, Play } from 'lucide-react';
import { useTranslation } from 'react-i18next';
import type { TaskStatus, BatchEepResult } from '@/api/types';

interface BatchEepPanelProps {
  analyzedCount: number;
  totalCount: number;
  batchTask: TaskStatus | undefined;
  isBatchRunning: boolean;
  batchError: string | null;
  batchSummary: BatchEepResult | null;
  onTrigger: () => void;
  onDismissSummary?: () => void;
  isPending: boolean;
  /** i18n key prefix; defaults to `'batch'` (event analysis page).
   * Character page passes `'character.batch'` so keys live under
   * the `character.*` namespace alongside other character-specific strings. */
  i18nPrefix?: string;
}

export function BatchEepPanel({
  analyzedCount,
  totalCount,
  batchTask,
  isBatchRunning,
  batchError,
  batchSummary,
  onTrigger,
  onDismissSummary,
  isPending,
  i18nPrefix = 'batch',
}: BatchEepPanelProps) {
  const { t } = useTranslation('analysis');
  const k = (suffix: string) => `${i18nPrefix}.${suffix}`;
  const allDone = analyzedCount >= totalCount && totalCount > 0;
  const batchResult = batchTask?.result as BatchEepResult | undefined;

  const progressCurrent = batchResult?.progress ?? 0;
  const runningAnalyzed = isBatchRunning ? analyzedCount + progressCurrent : analyzedCount;
  const pct =
    totalCount > 0
      ? Math.round(
          (isBatchRunning ? runningAnalyzed : analyzedCount) / totalCount * 100,
        )
      : 0;
  const showSummary = !isBatchRunning && batchSummary !== null;
  const stage = batchTask?.stage ?? '';

  return (
    <div className={'ea-batch' + (isBatchRunning ? ' running' : '')}>
      <div className="ea-batch-head">
        <span className="ea-batch-label">{t(k('header'))}</span>
        <span className="ea-batch-count">
          {runningAnalyzed}/{totalCount}
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
            <span className="stage" title={stage}>
              {stage || t(k('running'))}
            </span>
            <span className="live">
              <Play size={9} /> live
            </span>
          </>
        ) : batchError ? (
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

      {isBatchRunning ? (
        <button className="ea-batch-btn running" disabled type="button">
          <span className="ea-mini-spinner" />
          {t(k('runningWithCount'), { current: runningAnalyzed, total: totalCount })}
        </button>
      ) : allDone ? (
        <button className="ea-batch-btn" disabled type="button">
          <Check size={12} /> {t(k('allDone'))}
        </button>
      ) : (
        <button
          className="ea-batch-btn"
          type="button"
          onClick={onTrigger}
          disabled={isPending}
        >
          <Sparkles size={12} /> {t(k('triggerAll'))}
        </button>
      )}

      {!showSummary && !isBatchRunning && !allDone && (
        <p className="ea-batch-hint">{t(k('autoSkip'))}</p>
      )}
      {showSummary && onDismissSummary && (
        <p className="ea-batch-hint row">
          <span>{t(k('toastTitle'))}</span>
          <button type="button" className="dismiss" onClick={onDismissSummary}>
            {t(k('toastClose'))}
          </button>
        </p>
      )}
    </div>
  );
}

