import { useCallback, useEffect, useRef, useState } from 'react';
import { Link } from 'react-router-dom';
import { useQueryClient } from '@tanstack/react-query';
import { AlertTriangle, Check, CheckCircle, Clock, Loader2, RefreshCw, X } from 'lucide-react';
import type { TimelineDetectionResponse } from '@/api/graph';
import { deleteBook } from '@/api/books';
import { acceptReview, cancelTask, fetchTaskStatus, rerunStep, type RerunStep } from '@/api/ingest';
import { useToast } from '@/contexts/ToastContext';
import { useTaskPolling } from '@/hooks/useTaskPolling';
import { ProcessingTimeline } from './ProcessingTimeline';
import { MurmurWindow } from './MurmurWindow';

// Backend failedSteps prefix (underscore) → rerun endpoint step + label.
const RERUN_META: Record<string, { step: RerunStep; label: string }> = {
  summarization: { step: 'summarization', label: '章節摘要' },
  feature_extraction: { step: 'feature-extraction', label: '特徵擷取' },
  kg_extraction: { step: 'knowledge-graph', label: '知識圖譜建構' },
  symbol_discovery: { step: 'symbol-discovery', label: '符號探索' },
};

type RerunState = 'idle' | 'loading' | 'done' | 'failed';

interface FailedStep {
  id: string;
  label: string;
  step: RerunStep | null;
  detail: string;
}

function parseFailedSteps(failed: string[]): FailedStep[] {
  return failed.map((raw) => {
    const idx = raw.indexOf(':');
    const id = (idx === -1 ? raw : raw.slice(0, idx)).trim();
    const detail = idx === -1 ? '' : raw.slice(idx + 1).trim();
    const meta = RERUN_META[id];
    return { id, label: meta?.label ?? id, step: meta?.step ?? null, detail };
  });
}

function RerunButton({ st, canRerun, onRerun }: Readonly<{ st: RerunState; canRerun: boolean; onRerun: () => void }>) {
  if (st === 'loading') {
    return (
      <span style={{ flex: 'none', display: 'inline-flex', alignItems: 'center', gap: 5, font: '600 12px/1 var(--font-sans)', color: 'var(--fg-muted)', padding: '7px 12px' }}>
        <Loader2 size={12} className="animate-spin" />
        重跑中…
      </span>
    );
  }
  if (!canRerun) return null;
  const failed = st === 'failed';
  const color = failed ? 'var(--color-error)' : 'var(--accent)';
  return (
    <button
      onClick={onRerun}
      style={{
        flex: 'none',
        display: 'inline-flex',
        alignItems: 'center',
        gap: 5,
        font: '600 12px/1 var(--font-sans)',
        color,
        background: 'transparent',
        border: `1px solid ${color}`,
        borderRadius: 'var(--btn-radius)',
        padding: '7px 12px',
        cursor: 'pointer',
      }}
    >
      <RefreshCw size={12} />
      {failed ? '再試' : '重跑'}
    </button>
  );
}

function PartialRerunCard({ bookId, failedSteps }: Readonly<{ bookId: string; failedSteps: string[] }>) {
  const { push } = useToast();
  const queryClient = useQueryClient();
  const [state, setState] = useState<Record<string, RerunState>>({});
  const steps = parseFailedSteps(failedSteps);
  const pending = steps.filter((s) => state[s.id] !== 'done');
  const allResolved = pending.length === 0;

  const handleRerun = useCallback(
    async (fs: FailedStep) => {
      if (!fs.step) return;
      setState((s) => ({ ...s, [fs.id]: 'loading' }));
      push({
        type: 'info',
        title: '重跑已排入任務中心',
        body: '重跑本身也是一個任務，可於任務中心追蹤。',
      });
      try {
        const { taskId } = await rerunStep(bookId, fs.step);
        const poll = async (): Promise<void> => {
          const s = await fetchTaskStatus(taskId);
          if (s.status === 'done') {
            setState((prev) => ({ ...prev, [fs.id]: 'done' }));
            push({ type: 'success', title: `${fs.label} 重跑完成`, body: '結果已補齊，可前往書庫查看。' });
            void queryClient.invalidateQueries({ queryKey: ['book', bookId] });
            void queryClient.invalidateQueries({ queryKey: ['tasks', 'list'] });
            return;
          }
          if (s.status === 'error') {
            setState((prev) => ({ ...prev, [fs.id]: 'failed' }));
            push({ type: 'error', title: `${fs.label} 重跑失敗`, body: s.error ?? '請再試一次。' });
            return;
          }
          await new Promise((r) => setTimeout(r, 2000));
          return poll();
        };
        await poll();
      } catch (e) {
        setState((prev) => ({ ...prev, [fs.id]: 'failed' }));
        push({ type: 'error', title: `${fs.label} 重跑失敗`, body: e instanceof Error ? e.message : '請再試一次。' });
      }
    },
    [bookId, push, queryClient],
  );

  return (
    <div
      style={{
        padding: '15px 16px',
        background: 'var(--color-warning-bg)',
        border: '1px solid var(--color-warning)',
        borderRadius: 'var(--card-radius)',
      }}
    >
      <div style={{ font: '500 12.5px/1.5 var(--font-sans)', color: 'var(--fg-primary)', marginBottom: 12 }}>
        書籍已儲存，但以下步驟未能完成 · 可直接重跑
      </div>
      {!allResolved && (
        <div style={{ display: 'flex', flexDirection: 'column', gap: 9 }}>
          {pending.map((fs) => (
            <div
              key={fs.id}
              style={{
                display: 'flex',
                alignItems: 'center',
                gap: 11,
                padding: '10px 12px',
                background: 'var(--bg-primary)',
                border: '1px solid var(--border)',
                borderRadius: 'var(--btn-radius)',
              }}
            >
              <span style={{ width: 20, height: 20, borderRadius: '50%', background: 'var(--color-error-bg)', display: 'grid', placeItems: 'center', color: 'var(--color-error)', flex: 'none' }}>
                <X size={11} strokeWidth={2.4} />
              </span>
              <div style={{ flex: 1, minWidth: 0 }}>
                <div style={{ font: '600 12.5px/1.3 var(--font-sans)', color: 'var(--fg-primary)' }}>{fs.label}</div>
                {fs.detail && (
                  <div style={{ font: '400 11px/1.4 var(--font-mono)', color: 'var(--fg-muted)', marginTop: 2 }}>{fs.detail}</div>
                )}
              </div>
              <RerunButton st={state[fs.id] ?? 'idle'} canRerun={fs.step !== null} onRerun={() => handleRerun(fs)} />
            </div>
          ))}
        </div>
      )}
      {allResolved && (
        <div style={{ display: 'flex', alignItems: 'center', gap: 6, font: '500 12.5px/1.4 var(--font-sans)', color: 'var(--color-success)' }}>
          <CheckCircle size={14} />
          所有步驟皆已補齊。
        </div>
      )}
      <div style={{ marginTop: 13, paddingTop: 12, borderTop: '1px solid var(--color-warning)' }}>
        <Link to={`/books/${bookId}`} style={{ font: '600 12.5px/1 var(--font-sans)', color: 'var(--accent)' }}>
          前往書庫查看 →
        </Link>
      </div>
    </div>
  );
}

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

function formatElapsed(sec: number): string {
  const m = Math.floor(sec / 60);
  const s = sec % 60;
  return `${String(m).padStart(2, '0')}:${String(s).padStart(2, '0')}`;
}

export function ProcessingCard({ task, onDone, onError }: Readonly<ProcessingCardProps>) {
  const { data: status, isError, murmurEvents } = useTaskPolling(task.taskId);
  const queryClient = useQueryClient();
  const doneRef = useRef(false);
  const [acceptingChapters, setAcceptingChapters] = useState(false);
  const [terminating, setTerminating] = useState(false);
  const [reviewError, setReviewError] = useState<string | null>(null);
  // Tick every second so the "已處理 mm:ss" clock advances live while running.
  const [nowTick, setNowTick] = useState(() => Date.now());
  const isActive = status?.status === 'running' || status?.status === 'pending';
  useEffect(() => {
    if (!isActive) return;
    const id = setInterval(() => setNowTick(Date.now()), 1000);
    return () => clearInterval(id);
  }, [isActive]);
  const elapsedText =
    status?.createdAt != null
      ? formatElapsed(Math.max(0, Math.floor((nowTick - Date.parse(status.createdAt)) / 1000)))
      : null;

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
      await acceptReview(bookId);
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
    setTerminating(true);
    try {
      // Cancel first so the pipeline stops writing, then remove the book if
      // one was already persisted (phase 1 done). During early phase 1 there
      // is no bookId yet — cancelling the task is all that's needed.
      await cancelTask(task.taskId).catch(() => {});
      if (bookId) await deleteBook(bookId);
    } finally {
      onError(task.taskId, task.fileName);
    }
  }, [bookId, task.taskId, task.fileName, onError]);

  /* ── Done ── */
  if (isDone && bookId) {
    return (
      <div
        style={{
          display: 'flex',
          alignItems: 'center',
          gap: 12,
          padding: '15px 18px',
          border: '1px solid var(--color-success)',
          borderRadius: 'var(--card-radius)',
          background: 'var(--color-success-bg)',
        }}
      >
        <span style={{ width: 26, height: 26, borderRadius: '50%', background: 'var(--color-success)', display: 'grid', placeItems: 'center', color: '#fff', flex: 'none' }}>
          <Check size={14} strokeWidth={2.6} />
        </span>
        <h3 style={{ font: '700 16px/1.2 var(--font-serif)', color: 'var(--fg-primary)', margin: 0, flex: 1, minWidth: 0 }}>
          {task.title}
        </h3>
        <Link to={`/books/${bookId}`} style={{ font: '600 12.5px/1 var(--font-sans)', color: 'var(--accent)', whiteSpace: 'nowrap' }}>
          前往《{task.title}》→
        </Link>
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
        <span style={{ fontFamily: 'var(--font-serif)', fontSize: 'var(--font-size-base)', fontWeight: 700, color: 'var(--fg-primary)' }}>
          {task.title}
        </span>
        {status && !isPartialSuccess && !isAwaitingReview && (
          <span style={{ display: 'inline-flex', alignItems: 'center', gap: 8, flexShrink: 0 }}>
            <span style={{ fontFamily: 'var(--font-sans)', fontSize: 'var(--font-size-xs)', color: 'var(--fg-secondary)' }}>
              {stageLabel}{progress}%
            </span>
            {isActive && elapsedText && (
              <>
                <span style={{ width: 1, height: 11, background: 'var(--border)' }} />
                <span style={{ display: 'inline-flex', alignItems: 'center', gap: 4, fontFamily: 'var(--font-sans)', fontSize: 'var(--font-size-2xs)', color: 'var(--fg-muted)' }}>
                  <Clock size={11} />
                  已處理 {elapsedText}
                </span>
              </>
            )}
          </span>
        )}
        {isPartialSuccess && (
          <span style={{ display: 'inline-flex', alignItems: 'center', gap: 5, fontFamily: 'var(--font-sans)', fontSize: 'var(--font-size-xs)', fontWeight: 500, color: 'var(--color-warning)', background: 'var(--color-warning-bg)', padding: '5px 9px', borderRadius: 'var(--badge-radius)', flexShrink: 0 }}>
            <AlertTriangle size={12} />
            部分完成
          </span>
        )}
        {isAwaitingReview && (
          <span style={{ display: 'inline-flex', alignItems: 'center', gap: 5, fontFamily: 'var(--font-sans)', fontSize: 'var(--font-size-xs)', fontWeight: 500, color: 'var(--color-warning)', background: 'var(--color-warning-bg)', padding: '5px 9px', borderRadius: 'var(--badge-radius)', flexShrink: 0 }}>
            <Clock size={12} />
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
            style={{
              padding: '15px 16px',
              background: 'var(--color-warning-bg)',
              border: '1px solid var(--color-warning)',
              borderRadius: 'var(--card-radius)',
            }}
          >
            <div style={{ font: '600 13.5px/1.4 var(--font-sans)', color: 'var(--fg-primary)', marginBottom: 3 }}>
              系統偵測到章節結構，請確認是否正確
            </div>
            <div style={{ font: '400 12px/1.5 var(--font-sans)', color: 'var(--fg-secondary)', marginBottom: 13 }}>
              這是送出前最後一道人工閘門
            </div>
            {reviewError && (
              <p className="text-xs mb-2" style={{ color: 'var(--color-error)' }}>
                {reviewError}
              </p>
            )}
            <div style={{ display: 'flex', alignItems: 'center', gap: 9, flexWrap: 'wrap' }}>
              <button
                style={{ font: '600 12.5px/1 var(--font-sans)', color: 'var(--accent-fg)', background: 'var(--accent)', border: '1px solid var(--accent)', borderRadius: 'var(--btn-radius)', padding: '9px 15px', cursor: 'pointer', display: 'inline-flex', alignItems: 'center', gap: 6 }}
                disabled={acceptingChapters || terminating}
                onClick={handleAcceptChapters}
              >
                {acceptingChapters && <Loader2 size={11} className="animate-spin" />}
                接受系統判斷
              </button>
              <Link
                to={`/upload/review/${bookId}?taskId=${task.taskId}`}
                style={{ font: '600 12.5px/1 var(--font-sans)', color: 'var(--fg-primary)', background: 'var(--bg-primary)', border: '1px solid var(--border)', borderRadius: 'var(--btn-radius)', padding: '9px 15px' }}
              >
                開始審閱 →
              </Link>
              <button
                style={{ marginLeft: 'auto', font: '600 12.5px/1 var(--font-sans)', color: 'var(--color-error)', background: 'transparent', border: '1px solid var(--color-error)', borderRadius: 'var(--btn-radius)', padding: '9px 14px', cursor: 'pointer', display: 'inline-flex', alignItems: 'center', gap: 6 }}
                disabled={acceptingChapters || terminating}
                onClick={handleTerminate}
              >
                {terminating && <Loader2 size={10} className="animate-spin" />}
                終止處理
              </button>
            </div>
          </div>
        )}

        {/* Partial success — per-step inline rerun */}
        {isPartialSuccess && bookId && failedSteps && (
          <PartialRerunCard bookId={bookId} failedSteps={failedSteps} />
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
          </>
        )}
      </div>
    </div>
  );
}
