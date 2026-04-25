/**
 * ClassifyVisibilityButton — triggers retroactive event visibility classification via LLM.
 *
 * TEMPORARY: This component exists to backfill visibility data for books ingested
 * before F-03. It may be replaced by a full re-ingest pipeline in the future.
 */
import { useState, useEffect } from 'react';
import { Wand2, CheckCircle, AlertTriangle, Loader } from 'lucide-react';
import { triggerClassifyVisibility } from '@/api/graph';
import { useTaskPolling } from '@/hooks/useTaskPolling';

interface ClassifyVisibilityButtonProps {
  bookId: string;
  onComplete?: () => void;
}

export function ClassifyVisibilityButton({ bookId, onComplete }: ClassifyVisibilityButtonProps) {
  const [taskId, setTaskId] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  const { data: task } = useTaskPolling(taskId);

  useEffect(() => {
    if (task?.status === 'done') {
      onComplete?.();
    }
  }, [task?.status, onComplete]);

  const handleClick = async () => {
    setError(null);
    try {
      const res = await triggerClassifyVisibility(bookId);
      setTaskId(res.taskId);
    } catch {
      setError('觸發失敗，請稍後再試');
    }
  };

  const isPending = !!taskId && task?.status !== 'done' && task?.status !== 'error';
  const isDone = task?.status === 'done';
  const isFailed = task?.status === 'error';

  if (isDone) {
    const result = task.result as { classified?: number; total?: number } | undefined;
    return (
      <span className="inline-flex items-center gap-1 text-xs" style={{ color: '#16a34a' }}>
        <CheckCircle size={11} />
        已分類 {result?.classified ?? '?'}/{result?.total ?? '?'} 個事件
      </span>
    );
  }

  return (
    <span className="inline-flex items-center gap-1.5">
      <button
        onClick={handleClick}
        disabled={isPending}
        className="inline-flex items-center gap-1 text-xs px-2 py-0.5 rounded"
        style={{
          backgroundColor: 'var(--bg-tertiary)',
          color: 'var(--fg-secondary)',
          border: '1px solid var(--border)',
          opacity: isPending ? 0.6 : 1,
          cursor: isPending ? 'default' : 'pointer',
        }}
        title="以 LLM 補標事件 visibility（臨時功能，未來可能調整）"
      >
        {isPending ? (
          <Loader size={10} className="animate-spin" />
        ) : (
          <Wand2 size={10} />
        )}
        {isPending
          ? (task?.stage ? `${task.stage}…` : '分類中…')
          : '補標 visibility'}
      </button>
      <span className="text-xs opacity-40" style={{ color: 'var(--fg-muted)' }}>
        （臨時）
      </span>
      {(isFailed || error) && (
        <span className="inline-flex items-center gap-1 text-xs" style={{ color: '#dc2626' }}>
          <AlertTriangle size={10} />
          {error ?? task?.error ?? '失敗'}
        </span>
      )}
    </span>
  );
}
