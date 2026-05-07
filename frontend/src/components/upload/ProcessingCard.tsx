import { useEffect, useRef } from 'react';
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

  useEffect(() => {
    if (!status || doneRef.current) return;
    if (status.status === 'done' && status.result?.bookId) {
      doneRef.current = true;
      const detection = status.result.timelineDetection as TimelineDetectionResponse | undefined;
      onDone(task.taskId, String(status.result.bookId), task.fileName, detection);
    } else if (status.status === 'error' || isError) {
      doneRef.current = true;
      onError(task.taskId, task.fileName, status.error);
    }
  }, [status, isError, task, onDone, onError]);

  return (
    <div className="card" style={{ border: '1px solid var(--border)' }}>
      <div className="flex items-center justify-between mb-3">
        <span className="text-sm font-medium">{task.fileName}</span>
        {status && (
          <span className="text-xs" style={{ color: 'var(--fg-muted)' }}>
            {status.stage ? `${status.stage} · ` : ''}{status.progress}%
          </span>
        )}
      </div>

      {status && (
        <div className="flex gap-4">
          {/* Left: step timeline */}
          <div style={{ minWidth: 160 }}>
            <ProcessingTimeline task={status} />
          </div>

          {/* Right: murmur window */}
          <div className="flex-1 min-w-0">
            <MurmurWindow events={murmurEvents} />
          </div>
        </div>
      )}
    </div>
  );
}
