import { useCallback, useEffect, useRef, useState } from 'react';
import { Link } from 'react-router-dom';
import { useQueryClient } from '@tanstack/react-query';
import { useTranslation } from 'react-i18next';
import { AlertTriangle, CircleCheck, Clock, Loader2, ShieldAlert, Unplug } from 'lucide-react';
import type { TimelineDetectionResponse } from '@/api/graph';
import type { PipelineStatus } from '@/api/types';
import { ApiError } from '@/api/client';
import { fetchRunningUnraveling, type RunningUnraveling } from '@/api/buildOverview';
import { isLlmUnconfigured } from '@/api/failureKind';
import { deleteBook } from '@/api/books';
import { acceptReview, cancelTask, rerunStep, type RerunStep } from '@/api/ingest';
import { isCancelled } from '@/api/tasks';
import { useToast } from '@/contexts/ToastContext';
import { useBook } from '@/hooks/useBook';
import { isGone, useTaskPolling } from '@/hooks/useTaskPolling';
import { ConfirmDialog } from '@/components/ui/ConfirmDialog';
import { LlmUnconfiguredNotice } from '@/components/ui/LlmUnconfiguredNotice';
import { ProcessingTimeline } from './ProcessingTimeline';
import { MurmurWindow } from './MurmurWindow';
import { formatElapsed } from './uploadModel';
import { qk } from '@/api/queryKeys';

// Backend failedSteps prefix (underscore) → rerun endpoint step + label, and
// the book's pipelineStatus key that says whether it has been made good since.
// A prefix missing here is listed without a button (no disabled button, no
// "unsupported" copy — 03 E 區).
const RERUN_META: Record<string, { step: RerunStep; status: keyof PipelineStatus; label: string }> = {
  summarization: { step: 'summarization', status: 'summarization', label: '章節摘要' },
  feature_extraction: { step: 'feature-extraction', status: 'featureExtraction', label: '特徵擷取' },
  kg_extraction: { step: 'knowledge-graph', status: 'knowledgeGraph', label: '知識圖譜建構' },
  symbol_discovery: { step: 'symbol-discovery', status: 'symbolDiscovery', label: '符號探索' },
};

type RerunState = 'idle' | 'loading' | 'failed';

interface FailedStep {
  id: string;
  label: string;
  step: RerunStep | null;
  status: keyof PipelineStatus | null;
  detail: string;
}

function parseFailedSteps(failed: string[]): FailedStep[] {
  return failed.map((raw) => {
    const idx = raw.indexOf(':');
    const id = (idx === -1 ? raw : raw.slice(0, idx)).trim();
    const detail = idx === -1 ? '' : raw.slice(idx + 1).trim();
    const meta = RERUN_META[id];
    return { id, label: meta?.label ?? id, step: meta?.step ?? null, status: meta?.status ?? null, detail };
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

/**
 * One failed step. Its rerun is polled through useTaskPolling, so leaving the
 * page stops the polling; a rerun already going for this step (another tab, or
 * started before a remount) is adopted rather than offered again — the backend
 * would refuse a second one with 409 (#8d / #19c).
 */
function RerunRow({ bookId, fs, adoptTaskId }: Readonly<{ bookId: string; fs: FailedStep; adoptTaskId: string | null }>) {
  const { t } = useTranslation('reader');
  const { push } = useToast();
  const queryClient = useQueryClient();
  // Started here; until then, the rerun found running for this step (if any).
  const [ownTaskId, setOwnTaskId] = useState<string | null>(null);
  const taskId = ownTaskId ?? adoptTaskId;
  // Another rerun (or concept inference) holds the book's lock: not a failure.
  const [busy, setBusy] = useState(false);
  // The app's own 503 (no LLM provider): a feature state, shown in place.
  const [unconfigured, setUnconfigured] = useState(false);
  const [requestFailed, setRequestFailed] = useState(false);
  const { data: status, error: pollError } = useTaskPolling(taskId);

  // 404 = the rerun task is gone (store restarted / cleaned up): no outcome to
  // report, the step is offered again. A cancelled rerun is the user's choice.
  const gone = isGone(pollError);
  const done = status?.status === 'done';
  const failed = status?.status === 'error' && !isCancelled(status);
  const settled = gone || done || status?.status === 'error';

  // Side effects only, once per rerun task: toast and refetch the book (its
  // pipelineStatus drops the row) and the task list.
  const notifiedRef = useRef<string | null>(null);
  useEffect(() => {
    if (!taskId || !settled || notifiedRef.current === taskId) return;
    notifiedRef.current = taskId;
    if (done) push({ type: 'success', title: `${fs.label} 重跑完成`, body: '結果已補齊，可前往書庫查看。' });
    else if (failed) push({ type: 'error', title: `${fs.label} 重跑失敗`, body: status?.error ?? '請再試一次。' });
    void queryClient.invalidateQueries({ queryKey: qk.book(bookId) });
    void queryClient.invalidateQueries({ queryKey: qk.tasks.list() });
  }, [taskId, settled, done, failed, status, bookId, fs.label, push, queryClient]);

  const handleRerun = useCallback(async () => {
    if (!fs.step) return;
    setBusy(false);
    setUnconfigured(false);
    setRequestFailed(false);
    try {
      const res = await rerunStep(bookId, fs.step);
      // Only once the backend took it: a 409 / 503 queues nothing.
      push({
        type: 'info',
        title: '重跑已排入任務中心',
        body: '重跑本身也是一個任務，可於任務中心追蹤。',
      });
      setOwnTaskId(res.taskId);
    } catch (e) {
      if (isLlmUnconfigured(e)) {
        setUnconfigured(true);
      } else if (e instanceof ApiError && e.status === 409 && e.code === 'batch_running') {
        const running = await fetchRunningUnraveling(bookId).catch(() => null);
        if (running?.op === fs.step && running.taskId) setOwnTaskId(running.taskId);
        else setBusy(true);
      } else {
        setRequestFailed(true);
        push({ type: 'error', title: `${fs.label} 重跑失敗`, body: e instanceof Error ? e.message : '請再試一次。' });
      }
    }
  }, [bookId, fs, push]);

  if (done) return null;
  const st: RerunState = taskId && !settled ? 'loading' : failed || requestFailed ? 'failed' : 'idle';

  return (
    <div className="up-rerun-row">
      <div className="up-rerun-main">
        <span className="up-rerun-name">{fs.label}</span>
        {fs.detail && <code className="up-code">{fs.detail}</code>}
        {busy && (
          <div className="up-notice up-notice-warning up-notice-inset" role="status">
            <span>
              {t('rerun.busy')}{' '}
              <Link to={`/books/${bookId}/unraveling`} className="up-link">{t('unanalyzed.cta')}</Link>
            </span>
          </div>
        )}
        {unconfigured && <LlmUnconfiguredNotice />}
      </div>
      <RerunButton st={st} canRerun={fs.step !== null} onRerun={() => void handleRerun()} />
    </div>
  );
}

function PartialRerunCard({ bookId, title, failedSteps }: Readonly<{ bookId: string; title: string; failedSteps: string[] }>) {
  // failedSteps is the ingestion task's snapshot and never changes; the book's
  // pipelineStatus says which steps a rerun has made good since, so a remount
  // does not offer (and charge for) the same rerun twice. Until the book loads
  // every snapshot step is listed, as before.
  const { data: book } = useBook(bookId);
  const [running, setRunning] = useState<RunningUnraveling | null>(null);
  useEffect(() => {
    let live = true;
    fetchRunningUnraveling(bookId)
      .then((r) => { if (live) setRunning(r); })
      .catch(() => {});
    return () => { live = false; };
  }, [bookId]);

  const pending = parseFailedSteps(failedSteps).filter(
    (s) => !(s.status && book?.pipelineStatus?.[s.status] === 'done'),
  );
  const allResolved = pending.length === 0;

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
            <RerunRow
              key={fs.id}
              bookId={bookId}
              fs={fs}
              adoptTaskId={running?.op && running.op === fs.step ? (running.taskId ?? null) : null}
            />
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
  /** The task is over without a failure: the user terminated it, or it no
   *  longer exists on the server. The card just leaves — no retry card. */
  onGone: (taskId: string) => void;
}

export function ProcessingCard({ task, onDone, onError, onGone }: Readonly<ProcessingCardProps>) {
  const { t } = useTranslation('upload');
  const { data: status, isError, error: pollError, murmurEvents } = useTaskPolling(task.taskId);
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
  const pollDisconnected = isError && !isGone(pollError);

  useEffect(() => {
    if (doneRef.current) return;
    // Remembered in sessionStorage but unknown to the server (404): without
    // this the card waits forever on a status that will never arrive.
    if (isGone(pollError)) {
      doneRef.current = true;
      onGone(task.taskId);
      return;
    }
    if (!status) return;
    if (isCancelled(status)) {
      doneRef.current = true;
      onGone(task.taskId);
    } else if (status.status === 'done' && status.result?.bookId) {
      doneRef.current = true;
      if (!failedSteps || failedSteps.length === 0) {
        const detection = status.result.timelineDetection as TimelineDetectionResponse | undefined;
        onDone(task.taskId, String(status.result.bookId), task.fileName, detection);
      }
    } else if (status.status === 'error') {
      doneRef.current = true;
      onError(task.taskId, task.fileName, status.error ?? undefined);
    }
  }, [status, pollError, failedSteps, task, onDone, onError, onGone]);

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
      // A terminated upload is not a failure: no error card, no retry.
      doneRef.current = true;
      onGone(task.taskId);
    }
  }, [bookId, task.taskId, onGone]);

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
      <div
        className="up-task-bar"
        role="progressbar"
        aria-label={task.title}
        aria-valuemin={0}
        aria-valuemax={100}
        aria-valuenow={progress}
      >
        <div className="up-task-bar-fill" style={{ width: `${progress}%` }} />
      </div>
      {/* A failed poll is not a failed task: the backend may still be running
          it, and treating it as failed invites a re-upload that pays twice.
          Polling carries on with the last status; the line goes once it answers. */}
      {pollDisconnected && (
        <div className="up-notice up-notice-warning" role="status">
          <span className="up-notice-icon"><Unplug size={16} /></span>
          <span>{t('pollDisconnected')}</span>
        </div>
      )}
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
