import { useCallback, useEffect, useRef, useState } from 'react';
import { Link } from 'react-router-dom';
import { CheckCircle, Loader2 } from 'lucide-react';
import type { TimelineDetectionResponse } from '@/api/graph';
import { fetchReviewData, submitReview } from '@/api/ingest';
import type { ReviewSubmitChapter } from '@/api/types';
import { useTaskPolling } from '@/hooks/useTaskPolling';
import { ProcessingTimeline } from './ProcessingTimeline';
import { MurmurWindow } from './MurmurWindow';

interface UploadTask {
  taskId: string;
  fileName: string;
  title: string;
}

interface ProcessingCardProps {
  task: UploadTask;
  onDone: (taskId: string, bookId: string, fileName: string, detection?: TimelineDetectionResponse) => void;
  onError: (taskId: string, fileName: string, message?: string) => void;
}

export function ProcessingCard({ task, onDone, onError }: Readonly<ProcessingCardProps>) {
  const { data: status, isError, murmurEvents } = useTaskPolling(task.taskId);
  const doneRef = useRef(false);
  const [acceptingChapters, setAcceptingChapters] = useState(false);

  const failedSteps = status?.result?.failedSteps as string[] | undefined;
  const isPartialSuccess = status?.status === 'done' && !!status.result?.bookId && failedSteps && failedSteps.length > 0;
  const bookId = status?.result?.bookId ? String(status.result.bookId) : null;
  const isDone = !!status && status.status === 'done' && !!bookId && (!failedSteps || failedSteps.length === 0);
  const isAwaitingReview = status?.status === 'awaiting_review' && !!bookId;

  useEffect(() => {
    if (!status || doneRef.current) return;
    if (status.status === 'done' && status.result?.bookId) {
      doneRef.current = true;
      if (!failedSteps || failedSteps.length === 0) {
        const detection = status.result.timelineDetection as TimelineDetectionResponse | undefined;
        onDone(task.taskId, String(status.result.bookId), task.fileName, detection);
      }
    } else if (status.status === 'error' || isError) {
      doneRef.current = true;
      onError(task.taskId, task.fileName, status.error);
    }
  }, [status, isError, failedSteps, task, onDone, onError]);

  const handleAcceptChapters = useCallback(async () => {
    if (!bookId) return;
    setAcceptingChapters(true);
    try {
      const reviewData = await fetchReviewData(bookId);
      const chapters: ReviewSubmitChapter[] = reviewData.chapters.map((ch) => ({
        title: ch.title ?? '',
        startParagraphIndex: ch.paragraphs[0]?.paragraphIndex ?? 0,
      }));
      await submitReview(bookId, chapters);
    } catch {
      // best-effort: if it fails the pipeline will eventually error
    } finally {
      setAcceptingChapters(false);
    }
  }, [bookId]);

  if (isDone && bookId) {
    return (
      <div
        className="card p-3"
        style={{ border: '1px solid var(--color-success)', backgroundColor: 'var(--color-success-bg)' }}
      >
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-2">
            <CheckCircle size={15} style={{ color: 'var(--color-success)', flexShrink: 0 }} />
            <span className="text-sm font-medium" style={{ color: 'var(--fg-primary)' }}>
              {task.title}
            </span>
          </div>
          <Link
            to={`/books/${bookId}`}
            className="text-xs font-medium ml-3 whitespace-nowrap"
            style={{ color: 'var(--color-success)' }}
          >
            前往《{task.title}》→
          </Link>
        </div>
      </div>
    );
  }

  return (
    <div className="card" style={{ border: '1px solid var(--border)' }}>
      <div className="flex items-center justify-between mb-3">
        <span className="text-sm font-medium">{task.title}</span>
        {status && !isPartialSuccess && !isAwaitingReview && (
          <span className="text-xs" style={{ color: 'var(--fg-muted)' }}>
            {status.stage ? `${status.stage} · ` : ''}{status.progress}%
          </span>
        )}
        {isPartialSuccess && (
          <span className="text-xs font-medium" style={{ color: 'var(--status-partial-fg)' }}>
            部分完成
          </span>
        )}
      </div>

      {isAwaitingReview && bookId && (
        <div
          className="mb-3 p-3 rounded-md"
          style={{ backgroundColor: 'var(--entity-con-bg)', border: '1px solid var(--entity-con-border)' }}
        >
          <p className="text-xs mb-3" style={{ color: 'var(--entity-con-fg)' }}>
            系統偵測到章節結構，請確認是否正確。
          </p>
          <div className="flex gap-2">
            <button
              className="text-xs px-3 py-1.5 rounded-md font-medium flex items-center gap-1.5"
              style={{ backgroundColor: 'var(--accent)', color: 'white', border: 'none' }}
              disabled={acceptingChapters}
              onClick={handleAcceptChapters}
            >
              {acceptingChapters && <Loader2 size={11} className="animate-spin" />}
              接受系統判斷
            </button>
            <Link
              to={`/upload/review/${bookId}?taskId=${task.taskId}`}
              className="text-xs px-3 py-1.5 rounded-md font-medium"
              style={{ color: 'var(--entity-con-fg)', border: '1px solid var(--entity-con-border)', backgroundColor: 'transparent' }}
            >
              開始審閱 →
            </Link>
          </div>
        </div>
      )}

      {isPartialSuccess && bookId && (
        <div
          className="mb-3 p-3 rounded-md"
          style={{ backgroundColor: 'var(--status-partial-bg)', border: '1px solid var(--status-partial-border)' }}
        >
          <p className="text-xs mb-2" style={{ color: 'var(--status-partial-fg)' }}>
            書籍已儲存，但以下功能未能完成：
          </p>
          <ul className="text-xs mb-3" style={{ color: 'var(--status-partial-fg)' }}>
            {failedSteps?.map((s) => (
              <li key={s}>· {s.replace(/^(\w+):.*/, '$1')}</li>
            ))}
          </ul>
          <Link
            to={`/books/${bookId}`}
            className="text-xs font-medium"
            style={{ color: 'var(--status-partial-fg)' }}
          >
            前往書庫查看 →
          </Link>
        </div>
      )}

      {status && !isPartialSuccess && !isAwaitingReview && (
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
