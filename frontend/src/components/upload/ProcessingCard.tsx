import { useCallback, useEffect, useRef, useState } from 'react';
import { Link } from 'react-router-dom';
import { useQueryClient } from '@tanstack/react-query';
import { useTranslation } from 'react-i18next';
import { AlertTriangle, CircleCheck, Clock, Loader2, ShieldAlert } from 'lucide-react';
import type { TimelineDetectionResponse } from '@/api/graph';
import { deleteBook } from '@/api/books';
import { acceptReview, cancelTask, fetchTaskStatus, rerunStep, type RerunStep } from '@/api/ingest';
import { useToast } from '@/contexts/ToastContext';
import { useTaskPolling } from '@/hooks/useTaskPolling';
import { ConfirmDialog } from '@/components/ui/ConfirmDialog';
import { ProcessingTimeline } from './ProcessingTimeline';
import { MurmurWindow } from './MurmurWindow';
import { formatElapsed } from './uploadModel';
import { qk } from '@/api/queryKeys';

// Backend failedSteps prefix (underscore) → rerun endpoint step + label.
// A prefix missing here is listed without a button (no disabled button, no
// "unsupported" copy — 03 E 區).
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
      <span className="up-rerun-busy">
        <Loader2 size={12} className="up-spin" />
        重跑中…
      </span>
    );
  }
  if (!canRerun) return null;
  return (
    <button type="button" className="ss-btn ss-btn-sm ss-btn-secondary ss-btn-llm" onClick={onRerun}>
      {st === 'failed' ? '再試' : '重跑'}
    </button>
  );
}

function PartialRerunCard({ bookId, title, failedSteps }: Readonly<{ bookId: string; title: string; failedSteps: string[] }>) {
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
            void queryClient.invalidateQueries({ queryKey: qk.book(bookId) });
            void queryClient.invalidateQueries({ queryKey: qk.tasks.list() });
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
    <div className="up-card up-task">
      <div className="up-task-head up-task-head-ruled">
        <span className="up-task-title">{title}</span>
        <span className="ss-badge ss-badge-warning">
          <span className="up-badge-icon"><AlertTriangle size={12} /></span>
          部分完成
        </span>
      </div>
      <div className="up-partial">
        <p className="up-partial-lead">書籍已儲存，但以下步驟未能完成 · 可直接重跑</p>
        {allResolved ? (
          <div className="up-resolved">
            <span className="up-resolved-icon"><CircleCheck size={18} strokeWidth={1.5} /></span>
            所有步驟皆已補齊。
          </div>
        ) : (
          pending.map((fs) => (
            <div key={fs.id} className="up-rerun-row">
              <div className="up-rerun-main">
                <span className="up-rerun-name">{fs.label}</span>
                {fs.detail && <code className="up-code">{fs.detail}</code>}
              </div>
              <RerunButton st={state[fs.id] ?? 'idle'} canRerun={fs.step !== null} onRerun={() => handleRerun(fs)} />
            </div>
          ))
        )}
        <div className="up-partial-foot">
          <Link to={`/books/${bookId}`} className="up-link">
            前往書庫查看 →
          </Link>
        </div>
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

export function ProcessingCard({ task, onDone, onError }: Readonly<ProcessingCardProps>) {
  const { t } = useTranslation('upload');
  const { data: status, isError, murmurEvents } = useTaskPolling(task.taskId);
  const queryClient = useQueryClient();
  const doneRef = useRef(false);
  const [acceptingChapters, setAcceptingChapters] = useState(false);
  const [terminating, setTerminating] = useState(false);
  const [confirmTerminate, setConfirmTerminate] = useState(false);
  const [reviewError, setReviewError] = useState<string | null>(null);
  // Tick every second so the "已處理 mm:ss" clock advances live while running.
  const [nowTick, setNowTick] = useState(() => Date.now());
  const isActive = status?.status === 'running' || status?.status === 'pending';
  useEffect(() => {
    if (!isActive) return;
    const id = setInterval(() => setNowTick(Date.now()), 1000);
    return () => clearInterval(id);
  }, [isActive]);
  // Counted from the task's createdAt (decision Q2), so a task picked up from
  // another tab shows its real age rather than a fresh "just started".
  const elapsedText =
    status?.createdAt != null ? formatElapsed((nowTick - Date.parse(status.createdAt)) / 1000) : null;

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
      onError(task.taskId, task.fileName, status.error ?? undefined);
    }
  }, [status, isError, failedSteps, task, onDone, onError]);

  const handleAcceptChapters = useCallback(async () => {
    if (!bookId) return;
    setAcceptingChapters(true);
    try {
      await acceptReview(bookId);
      setReviewError(null);
      queryClient.invalidateQueries({ queryKey: qk.tasks.one(task.taskId) });
    } catch {
      setReviewError('章節審閱提交失敗，pipeline 可能已中斷，請刪除此書並重新上傳。');
      queryClient.invalidateQueries({ queryKey: qk.tasks.one(task.taskId) });
    } finally {
      setAcceptingChapters(false);
    }
  }, [bookId, queryClient, task.taskId]);

  const handleTerminate = useCallback(async () => {
    setConfirmTerminate(false);
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
      <div className="up-done">
        <span className="up-done-icon"><CircleCheck size={18} strokeWidth={1.5} /></span>
        <span className="up-done-title">{task.title}</span>
        <span className="up-spacer" />
        <Link to={`/books/${bookId}`} className="up-link">
          前往《{task.title}》→
        </Link>
      </div>
    );
  }

  /* ── Partial ── */
  if (isPartialSuccess && bookId && failedSteps) {
    return <PartialRerunCard bookId={bookId} title={task.title} failedSteps={failedSteps} />;
  }

  // Shared by the running and awaiting-review cards: the loss-list confirm.
  const terminateButton = (size: 'sm' | 'md') => (
    <button
      type="button"
      className={`ss-btn ss-btn-${size} ss-btn-danger`}
      disabled={acceptingChapters || terminating}
      onClick={() => setConfirmTerminate(true)}
    >
      {terminating && <Loader2 size={12} className="up-spin" />}
      終止處理
    </button>
  );
  const terminateDialog = (
    <ConfirmDialog
      open={confirmTerminate}
      title={t('terminate.title', { title: task.title })}
      message={t('terminate.message')}
      items={[t('terminate.itemTask'), t('terminate.itemBook')]}
      confirmLabel={t('terminate.confirm')}
      danger
      onConfirm={handleTerminate}
      onCancel={() => setConfirmTerminate(false)}
    />
  );

  /* ── Awaiting review — the only human gate ── */
  if (isAwaitingReview && bookId) {
    return (
      <div className="up-gate">
        <div className="up-gate-main">
          <span className="up-gate-icon"><ShieldAlert size={24} strokeWidth={1.5} /></span>
          <div className="up-gate-text">
            <div className="up-gate-meta">
              <span className="ss-badge ss-badge-warning">
                <span className="up-badge-icon"><AlertTriangle size={12} /></span>
                等待審閱
              </span>
              <span className="up-gate-book">{task.title}</span>
            </div>
            <h3 className="up-gate-title">系統偵測到章節結構，請確認是否正確</h3>
            <p className="up-gate-sub">這是送出前最後一道人工閘門</p>
          </div>
          <div className="up-gate-actions">
            <button
              type="button"
              className="ss-btn ss-btn-md ss-btn-primary ss-btn-llm"
              disabled={acceptingChapters || terminating}
              onClick={handleAcceptChapters}
            >
              {acceptingChapters && <Loader2 size={12} className="up-spin" />}
              接受系統判斷
            </button>
            <Link to={`/upload/review/${bookId}?taskId=${task.taskId}`} className="ss-btn ss-btn-md ss-btn-secondary">
              開始審閱 →
            </Link>
            {terminateButton('md')}
          </div>
        </div>
        {reviewError && (
          <div className="up-notice up-notice-error up-notice-inset" role="alert">
            <span className="up-notice-icon"><AlertTriangle size={16} /></span>
            <span>{reviewError}</span>
          </div>
        )}
        {terminateDialog}
      </div>
    );
  }

  /* ── Processing ── */
  const progress = status?.progress ?? 0;
  return (
    <div className="up-card up-task">
      <div className="up-task-head">
        <span className="up-task-title">{task.title}</span>
        {status && (
          <span className="up-task-stage">
            {status.stage ? `${status.stage} · ` : ''}
            {progress}%
          </span>
        )}
        {isActive && elapsedText && (
          <>
            <span className="up-task-sep" />
            <span className="up-task-clock"><Clock size={13} strokeWidth={1.5} /></span>
            <span className="up-task-elapsed">已處理 {elapsedText}</span>
          </>
        )}
        <span className="up-spacer" />
        {terminateButton('sm')}
      </div>
      <div className="up-task-bar">
        <div className="up-task-bar-fill" style={{ width: `${progress}%` }} />
      </div>
      {status && (
        <div className="up-task-body">
          <ProcessingTimeline task={status} />
          <MurmurWindow events={murmurEvents} />
        </div>
      )}
      {terminateDialog}
    </div>
  );
}
