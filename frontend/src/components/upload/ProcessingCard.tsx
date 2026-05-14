import { useCallback, useEffect, useRef, useState } from 'react';
import { Link } from 'react-router-dom';
import { useQueryClient } from '@tanstack/react-query';
import { CheckCircle, Loader2 } from 'lucide-react';
import type { TimelineDetectionResponse } from '@/api/graph';
import { deleteBook } from '@/api/books';
import { cancelTask, fetchReviewData, submitReview } from '@/api/ingest';
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
  const queryClient = useQueryClient();
  const doneRef = useRef(false);
  const [acceptingChapters, setAcceptingChapters] = useState(false);
  const [terminating, setTerminating] = useState(false);
  const [reviewError, setReviewError] = useState<string | null>(null);

  const failedSteps     = status?.result?.failedSteps as string[] | undefined;
  const isPartialSuccess = status?.status === 'done' && !!status.result?.bookId && failedSteps && failedSteps.length > 0;
  const bookId           = status?.result?.bookId ? String(status.result.bookId) : null;
  const isDone           = !!status && status.status === 'done' && !!bookId && (!failedSteps || failedSteps.length === 0);
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
      setReviewError(null);
      queryClient.invalidateQueries({ queryKey: ['tasks', task.taskId] });
    } catch {
      setReviewError('章節審閱提交失敗，pipeline 可能已中斷，請刪除此書並重新上傳。');
      queryClient.invalidateQueries({ queryKey: ['tasks', task.taskId] });
    } finally {
      setAcceptingChapters(false);
    }
  }, [bookId, queryClient, task.taskId]);

  const handleTerminate = useCallback(async () => {
    if (!bookId) return;
    setTerminating(true);
    try {
      await cancelTask(task.taskId).catch(() => {});
      await deleteBook(bookId);
    } finally {
      onError(task.taskId, task.fileName);
    }
  }, [bookId, task.taskId, task.fileName, onError]);

  /* ── Done ── */
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

  const progress = status?.progress ?? 0;
  const stageLabel = status?.stage ? `${status.stage} · ` : '';

  return (
    <div className="card" style={{ padding: 0, overflow: 'hidden' }}>
      {/* Card header */}
      <div
        style={{
          padding: '14px 20px',
          borderBottom: '1px solid var(--border)',
          display: 'flex',
          alignItems: 'baseline',
          justifyContent: 'space-between',
          gap: 12,
        }}
      >
        <span style={{ fontFamily: 'var(--font-serif)', fontSize: 16, fontWeight: 700, color: 'var(--fg-primary)' }}>
          {task.title}
        </span>
        {status && !isPartialSuccess && !isAwaitingReview && (
          <span style={{ fontFamily: 'var(--font-sans)', fontSize: 12, color: 'var(--fg-muted)', flexShrink: 0 }}>
            {stageLabel}{progress}%
          </span>
        )}
        {isPartialSuccess && (
          <span style={{ fontFamily: 'var(--font-sans)', fontSize: 12, fontWeight: 500, color: 'var(--status-partial-fg)', flexShrink: 0 }}>
            部分完成
          </span>
        )}
        {isAwaitingReview && (
          <span style={{ fontFamily: 'var(--font-sans)', fontSize: 12, color: 'var(--fg-muted)', flexShrink: 0 }}>
            等待審閱
          </span>
        )}
      </div>

      {/* Progress bar (shown during active processing only) */}
      {status && !isPartialSuccess && !isAwaitingReview && (
        <div style={{ height: 2, backgroundColor: 'var(--bg-tertiary)' }}>
          <div
            className="theme-progress-fill"
            style={{ height: '100%', width: `${progress}%`, transition: 'width 800ms ease' }}
          />
        </div>
      )}

      {/* Card body */}
      <div style={{ padding: 20 }}>
        {/* Awaiting review prompt */}
        {isAwaitingReview && bookId && (
          <div
            className="mb-4 p-3 rounded-md"
            style={{ backgroundColor: 'var(--entity-con-bg)', border: '1px solid var(--entity-con-border)' }}
          >
            <p className="text-xs mb-3" style={{ color: 'var(--entity-con-fg)' }}>
              系統偵測到章節結構，請確認是否正確。
            </p>
            {reviewError && (
              <p className="text-xs mb-2" style={{ color: 'var(--color-error)' }}>
                {reviewError}
              </p>
            )}
            <div className="flex items-center justify-between gap-2">
              <div className="flex gap-2">
                <button
                  className="text-xs px-3 py-1.5 rounded-md font-medium flex items-center gap-1.5"
                  style={{ backgroundColor: 'var(--accent)', color: 'white', border: 'none' }}
                  disabled={acceptingChapters || terminating}
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
              <button
                className="btn text-xs flex items-center gap-1"
                style={{ color: 'var(--color-error)', borderColor: 'var(--color-error)' }}
                disabled={acceptingChapters || terminating}
                onClick={handleTerminate}
              >
                {terminating && <Loader2 size={10} className="animate-spin" />}
                終止處理
              </button>
            </div>
          </div>
        )}

        {/* Partial success */}
        {isPartialSuccess && bookId && (
          <div
            className="p-3 rounded-md"
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

        {/* Timeline + murmur (normal processing) */}
        {status && !isPartialSuccess && !isAwaitingReview && (
          <>
            <div className="flex gap-4">
              <div style={{ minWidth: 160 }}>
                <ProcessingTimeline task={status} />
              </div>
              <div className="flex-1 min-w-0">
                <MurmurWindow events={murmurEvents} />
              </div>
            </div>
            {bookId && (
              <div className="flex justify-end mt-3">
                <button
                  className="btn text-xs flex items-center gap-1"
                  style={{ color: 'var(--color-error)', borderColor: 'var(--color-error)' }}
                  disabled={terminating}
                  onClick={handleTerminate}
                >
                  {terminating && <Loader2 size={10} className="animate-spin" />}
                  終止處理
                </button>
              </div>
            )}
          </>
        )}
      </div>
    </div>
  );
}
