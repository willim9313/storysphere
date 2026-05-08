import { useEffect, useRef } from 'react';
import { Link } from 'react-router-dom';
import type { TimelineDetectionResponse } from '@/api/graph';
import { useTaskPolling } from '@/hooks/useTaskPolling';
import { ProcessingTimeline } from './ProcessingTimeline';
import { MurmurWindow } from './MurmurWindow';

interface UploadTask {
  taskId: string;
  fileName: string;
}

interface ProcessingCardProps {
  task: UploadTask;
  onDone: (taskId: string, bookId: string, fileName: string, detection?: TimelineDetectionResponse) => void;
  onError: (taskId: string, fileName: string, message?: string) => void;
}

export function ProcessingCard({ task, onDone, onError }: Readonly<ProcessingCardProps>) {
  const { data: status, isError, murmurEvents } = useTaskPolling(task.taskId);
  const doneRef = useRef(false);

  const failedSteps = status?.result?.failedSteps as string[] | undefined;
  const isPartialSuccess = status?.status === 'done' && !!status.result?.bookId && failedSteps && failedSteps.length > 0;
  const bookId = status?.result?.bookId ? String(status.result.bookId) : null;

  useEffect(() => {
    if (!status || doneRef.current) return;
    if (status.status === 'done' && status.result?.bookId) {
      doneRef.current = true;
      // Partial success: stay on card to show failure info, don't call onDone yet
      if (!failedSteps || failedSteps.length === 0) {
        const detection = status.result.timelineDetection as TimelineDetectionResponse | undefined;
        onDone(task.taskId, String(status.result.bookId), task.fileName, detection);
      }
    } else if (status.status === 'error' || isError) {
      doneRef.current = true;
      onError(task.taskId, task.fileName, status.error);
    }
  }, [status, isError, failedSteps, task, onDone, onError]);

  return (
    <div className="card" style={{ border: '1px solid var(--border)' }}>
      <div className="flex items-center justify-between mb-3">
        <span className="text-sm font-medium">{task.fileName}</span>
        {status && !isPartialSuccess && (
          <span className="text-xs" style={{ color: 'var(--fg-muted)' }}>
            {status.stage ? `${status.stage} · ` : ''}{status.progress}%
          </span>
        )}
        {isPartialSuccess && (
          <span className="text-xs font-medium" style={{ color: 'var(--color-warning, #d97706)' }}>
            部分完成
          </span>
        )}
      </div>

      {isPartialSuccess && bookId && (
        <div className="mb-3 p-3 rounded-md" style={{ backgroundColor: 'var(--bg-secondary)', border: '1px solid var(--border)' }}>
          <p className="text-xs mb-2" style={{ color: 'var(--fg-secondary)' }}>
            書籍已儲存，但以下功能未能完成：
          </p>
          <ul className="text-xs mb-3" style={{ color: 'var(--fg-muted)' }}>
            {failedSteps?.map((s) => (
              <li key={s}>· {s.replace(/^(\w+):.*/, '$1')}</li>
            ))}
          </ul>
          <Link
            to={`/books/${bookId}`}
            className="text-xs font-medium"
            style={{ color: 'var(--accent)' }}
          >
            前往書庫查看 →
          </Link>
        </div>
      )}

      {status && !isPartialSuccess && (
        <div className="flex gap-4">
          <div style={{ minWidth: 160 }}>
            <ProcessingTimeline task={status} />
          </div>
          <div className="flex-1 min-w-0">
            <MurmurWindow events={murmurEvents} />
          </div>
        </div>
      )}
    </div>
  );
}
