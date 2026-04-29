import { Loader2 } from 'lucide-react';
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
  isPending: boolean;
}

export function BatchEepPanel({
  analyzedCount,
  totalCount,
  batchTask,
  isBatchRunning,
  batchError,
  batchSummary,
  onTrigger,
  isPending,
}: BatchEepPanelProps) {
  const { t } = useTranslation('analysis');
  const allDone = analyzedCount === totalCount && totalCount > 0;
  const batchResult = batchTask?.result as BatchEepResult | undefined;

  const progressCurrent = batchResult?.progress ?? 0;
  const progressTotal = batchResult?.total ?? totalCount;
  const progressPct = progressTotal > 0 ? Math.round((progressCurrent / progressTotal) * 100) : 0;

  return (
    <div
      className="mx-3 my-2 p-3 rounded-lg"
      style={{ backgroundColor: 'var(--bg-tertiary)', border: '1px solid var(--border)' }}
    >
      <div className="flex items-center justify-between mb-1.5">
        <span className="text-xs font-medium" style={{ color: 'var(--fg-primary)' }}>
          {t('batch.header')}
        </span>
        <span className="text-xs" style={{ color: 'var(--fg-muted)' }}>
          {analyzedCount}/{totalCount} {t('batch.completed')}
        </span>
      </div>

      <div className="h-1.5 rounded-full overflow-hidden mb-3" style={{ backgroundColor: 'var(--border)' }}>
        <div
          className="h-full rounded-full transition-all duration-300 theme-progress-fill"
          style={{
            width: `${isBatchRunning ? progressPct : (totalCount > 0 ? (analyzedCount / totalCount) * 100 : 0)}%`,
          }}
        />
      </div>

      {isBatchRunning && (
        <div className="flex items-center gap-2 mb-2">
          <Loader2 size={14} className="animate-spin" style={{ color: 'var(--accent)' }} />
          <span className="text-xs" style={{ color: 'var(--fg-secondary)' }}>
            {t('batch.running')} {progressCurrent}/{progressTotal}…
          </span>
        </div>
      )}

      {batchError && (
        <p className="text-xs mb-2" style={{ color: 'var(--color-danger, #e53e3e)' }}>
          {batchError}
        </p>
      )}

      {batchSummary && !isBatchRunning && (
        <p className="text-xs mb-2" style={{ color: 'var(--color-success, #38a169)' }}>
          {t('batch.doneMessage', { analyzed: batchSummary.total - batchSummary.skipped - batchSummary.failed })}
          {batchSummary.skipped > 0 && `，${t('batch.skipped', { count: batchSummary.skipped })}`}
          {batchSummary.failed > 0 && `，${t('batch.failed', { count: batchSummary.failed })}`}
        </p>
      )}

      <button
        className="w-full text-xs py-1.5 rounded-md font-medium transition-colors"
        style={{
          backgroundColor: allDone || isBatchRunning ? 'var(--border)' : 'var(--accent)',
          color: allDone || isBatchRunning ? 'var(--fg-muted)' : 'white',
          cursor: allDone || isBatchRunning || isPending ? 'not-allowed' : 'pointer',
        }}
        disabled={allDone || isBatchRunning || isPending}
        onClick={onTrigger}
      >
        {allDone ? t('batch.allDone') : t('batch.triggerAll')}
      </button>

      {!allDone && !isBatchRunning && (
        <p className="text-xs mt-1.5 text-center" style={{ color: 'var(--fg-muted)' }}>
          {t('batch.autoSkip')}
        </p>
      )}
    </div>
  );
}
