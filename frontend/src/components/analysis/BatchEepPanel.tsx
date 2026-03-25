import { Loader2 } from 'lucide-react';
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
  const allDone = analyzedCount === totalCount && totalCount > 0;
  const batchResult = batchTask?.result as BatchEepResult | undefined;

  // Progress from running task
  const progressCurrent = batchResult?.progress ?? 0;
  const progressTotal = batchResult?.total ?? totalCount;
  const progressPct = progressTotal > 0 ? Math.round((progressCurrent / progressTotal) * 100) : 0;

  return (
    <div
      className="mx-3 my-2 p-3 rounded-lg"
      style={{
        backgroundColor: 'var(--bg-tertiary)',
        border: '1px solid var(--border)',
      }}
    >
      {/* Header with counts */}
      <div className="flex items-center justify-between mb-1.5">
        <span className="text-xs font-medium" style={{ color: 'var(--fg-primary)' }}>
          事件分析
        </span>
        <span className="text-xs" style={{ color: 'var(--fg-muted)' }}>
          {analyzedCount}/{totalCount} 已完成
        </span>
      </div>

      {/* Progress bar */}
      <div
        className="h-1.5 rounded-full overflow-hidden mb-3"
        style={{ backgroundColor: 'var(--border)' }}
      >
        <div
          className="h-full rounded-full transition-all duration-300"
          style={{
            width: `${isBatchRunning ? progressPct : (totalCount > 0 ? (analyzedCount / totalCount) * 100 : 0)}%`,
            backgroundColor: 'var(--accent)',
          }}
        />
      </div>

      {/* Running state */}
      {isBatchRunning && (
        <div className="flex items-center gap-2 mb-2">
          <Loader2 size={14} className="animate-spin" style={{ color: 'var(--accent)' }} />
          <span className="text-xs" style={{ color: 'var(--fg-secondary)' }}>
            分析中 {progressCurrent}/{progressTotal}…
          </span>
        </div>
      )}

      {/* Error */}
      {batchError && (
        <p className="text-xs mb-2" style={{ color: 'var(--color-danger, #e53e3e)' }}>
          {batchError}
        </p>
      )}

      {/* Summary after completion */}
      {batchSummary && !isBatchRunning && (
        <p className="text-xs mb-2" style={{ color: 'var(--color-success, #38a169)' }}>
          完成！已分析 {batchSummary.total - batchSummary.skipped - batchSummary.failed} 個事件
          {batchSummary.skipped > 0 && `，跳過 ${batchSummary.skipped} 個`}
          {batchSummary.failed > 0 && `，失敗 ${batchSummary.failed} 個`}
        </p>
      )}

      {/* Button */}
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
        {allDone ? '全部事件已分析 ✓' : '一鍵生成全部 EEP'}
      </button>

      {!allDone && !isBatchRunning && (
        <p className="text-xs mt-1.5 text-center" style={{ color: 'var(--fg-muted)' }}>
          已分析的事件會自動跳過
        </p>
      )}
    </div>
  );
}
