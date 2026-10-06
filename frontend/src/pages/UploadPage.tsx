import { useState, useCallback, useRef, useEffect, useMemo } from 'react';
import { useLocation } from 'react-router-dom';
import { useMutation, useQueryClient } from '@tanstack/react-query';
import { useTranslation } from 'react-i18next';
import { AlertTriangle, FileText, Loader2, X } from 'lucide-react';
import type { TimelineDetectionResponse } from '@/api/graph';
import { detectLanguage, uploadBook } from '@/api/ingest';
import { fetchTasks } from '@/api/tasks';
import { failureKind, techDetailOf } from '@/api/failureKind';
import { useBooks } from '@/hooks/useBooks';
import { DropZone } from '@/components/upload/DropZone';
import { ProcessingCard } from '@/components/upload/ProcessingCard';
import { ACCEPT_ATTR, MAX_FILE_MB, partitionFiles, queueNo, type Rejection } from '@/components/upload/uploadModel';
import { PageFailure } from '@/components/ui/PageFailure';
import { clearMurmur } from '@/store/murmurStore';
import { TimelineConfigModal } from '@/components/graph/TimelineConfigModal';
import { qk } from '@/api/queryKeys';
import '@/styles/upload.css';

interface UploadTask {
  taskId: string;
  fileName: string;
  title: string;
  duplicateTitle?: boolean;
}

interface RetryMeta {
  title: string;
  author: string;
  language: string;
}

interface ErroredTask {
  taskId: string;
  fileName: string;
  message?: string;
  meta?: RetryMeta;
}

const LANGUAGE_OPTIONS = [
  { value: '', labelKey: 'languageAuto' },
  { value: 'zh-tw', labelKey: 'languageZhTw' },
  { value: 'zh-cn', labelKey: 'languageZhCn' },
  { value: 'en', labelKey: 'languageEn' },
  { value: 'ja', labelKey: 'languageJa' },
  { value: 'ko', labelKey: 'languageKo' },
  { value: 'fr', labelKey: 'languageFr' },
  { value: 'es', labelKey: 'languageEs' },
  { value: 'de', labelKey: 'languageDe' },
  { value: 'pt', labelKey: 'languagePt' },
  { value: 'ru', labelKey: 'languageRu' },
] as const;

const KNOWN_LANGUAGE_VALUES = new Set<string>(
  LANGUAGE_OPTIONS.map((opt) => opt.value).filter(Boolean),
);

// Above this size, skip the pre-upload language guess: it re-posts the whole
// file (containers like PDF/DOCX/EPUB can't be sampled client-side without
// corrupting them), so for big files just leave the dropdown on auto-detect.
const PREDETECT_MAX_BYTES = 15 * 1024 * 1024;

let pendingSeq = 0;

interface PendingFile {
  id: string;
  file: File;
  title: string;
  author: string;
  language: string;
  langDetected: boolean;
}

function stemOf(name: string): string {
  return name.replace(/\.[^.]+$/, '');
}

function toPending(file: File, meta?: RetryMeta): PendingFile {
  return {
    id: `pf-${++pendingSeq}`,
    file,
    title: meta?.title ?? stemOf(file.name),
    author: meta?.author ?? '',
    language: meta?.language ?? '',
    langDetected: false,
  };
}

function sizeLabel(file: File): string {
  return `${(file.size / 1024 / 1024).toFixed(1)} MB · ${file.name.split('.').pop()?.toUpperCase() ?? ''}`;
}

export default function UploadPage() {
  const location = useLocation();
  const { t } = useTranslation('upload');
  const queryClient = useQueryClient();
  const { t: tc } = useTranslation('common');
  const { t: tn } = useTranslation('nav');

  // queue[0] is the file shown in the metadata form; the rest wait their turn.
  const [queue, setQueue] = useState<PendingFile[]>([]);
  const [tasks, setTasks] = useState<UploadTask[]>(() => {
    try {
      const saved = sessionStorage.getItem('upload-tasks');
      return saved ? (JSON.parse(saved) as UploadTask[]) : [];
    } catch {
      return [];
    }
  });
  const [doneTaskIds, setDoneTaskIds] = useState<Set<string>>(new Set());
  const [erroredTasks, setErroredTasks] = useState<ErroredTask[]>([]);
  // One row per file the last drop/pick turned away; valid files in the same
  // drop still go to the queue, so this outlives the DropZone (03 A 區).
  const [rejections, setRejections] = useState<Rejection[]>([]);
  // The entry GET /tasks (cross-tab recovery) failed — 03 H 區 page failure.
  const [recoveryError, setRecoveryError] = useState<unknown>(null);
  const [recoverySeq, setRecoverySeq] = useState(0);
  const [timelineModal, setTimelineModal] = useState<{ bookId: string; detection: TimelineDetectionResponse } | null>(null);
  const completedTaskIdsRef = useRef<Set<string>>(
    (() => {
      try {
        const saved = sessionStorage.getItem('upload-completed-tasks');
        return saved ? new Set(JSON.parse(saved) as string[]) : new Set<string>();
      } catch {
        return new Set<string>();
      }
    })(),
  );

  const { data: books } = useBooks();
  const libraryTitles = useMemo(
    () => new Set((books ?? []).map((b) => b.title.trim())),
    [books],
  );

  const active = queue[0] ?? null;
  const activeId = active?.id;

  // Metadata that survives past upload, so a failed task can be retried with the
  // original title/author/language (only the file needs re-picking).
  const uploadMetaRef = useRef<Map<string, RetryMeta & { fileName: string }>>(new Map());
  // Hidden input the error-card "retry" button drives; retryMetaRef carries the
  // metadata to reuse for the re-picked file.
  const retryInputRef = useRef<HTMLInputElement>(null);
  const retryMetaRef = useRef<RetryMeta | null>(null);
  const detectTriedRef = useRef<Set<string>>(new Set());

  useEffect(() => {
    const activeTasks = tasks.filter((t) => !doneTaskIds.has(t.taskId));
    if (activeTasks.length === 0) sessionStorage.removeItem('upload-tasks');
    else sessionStorage.setItem('upload-tasks', JSON.stringify(activeTasks));
  }, [tasks, doneTaskIds]);

  // Recover in-flight ingestion tasks from the server: sessionStorage is
  // per-tab, so a new tab / reopened browser would otherwise show an empty
  // upload page while the Task Center still lists the running upload.
  useEffect(() => {
    let cancelled = false;
    fetchTasks(0)
      .then((server) => {
        if (cancelled) return;
        setRecoveryError(null);
        const activeServer = server.filter(
          (task) => task.kind === 'ingestion' && task.status !== 'done' && task.status !== 'error',
        );
        if (activeServer.length === 0) return;
        setTasks((prev) => {
          const known = new Set(prev.map((p) => p.taskId));
          const recovered = activeServer
            .filter((task) => !known.has(task.taskId))
            .map((task) => {
              const title = (task.title ?? '').replace(/ 解析$/, '') || '書籍處理中';
              return { taskId: task.taskId, fileName: title, title };
            });
          return recovered.length > 0 ? [...prev, ...recovered] : prev;
        });
      })
      .catch((err: unknown) => {
        // Not swallowed any more: without this list the page can't tell what
        // is still running, so it shows the page failure with a manual retry.
        if (!cancelled) setRecoveryError(err);
      });
    return () => {
      cancelled = true;
    };
  }, [recoverySeq]);

  useEffect(() => {
    if (!location.hash) return;
    const id = location.hash.slice(1);
    setTimeout(() => {
      document.getElementById(id)?.scrollIntoView({ behavior: 'smooth', block: 'start' });
    }, 100);
  }, [location.hash]);

  // Pre-detect the active file's language once, so the dropdown isn't left on
  // blank "Auto-detect". The user can still override it (which clears the badge).
  useEffect(() => {
    if (!active || detectTriedRef.current.has(active.id)) return;
    detectTriedRef.current.add(active.id);
    if (active.file.size > PREDETECT_MAX_BYTES) return;
    const fileId = active.id;
    detectLanguage(active.file)
      .then(({ language }) => {
        // Chinese keeps its variant suffix (zh-tw / zh-cn) — the backend
        // needs it to pin Traditional vs Simplified in LLM output.
        const normalized = language.startsWith('zh') ? language : language.split('-')[0];
        if (!KNOWN_LANGUAGE_VALUES.has(normalized)) return;
        setQueue((q) =>
          q.length > 0 && q[0].id === fileId
            ? [{ ...q[0], language: normalized, langDetected: true }, ...q.slice(1)]
            : q,
        );
      })
      .catch(() => {
        // Silent fallback — dropdown stays on "Auto-detect".
      });
  }, [active, activeId]);

  const abortRef = useRef<AbortController | null>(null);

  const upload = useMutation({
    mutationFn: ({ file, title, author, language, signal }: { file: File; title: string; author?: string; language?: string; signal: AbortSignal }) =>
      uploadBook(file, title, author, language, signal),
    onSuccess: (data, { file, title, author, language }) => {
      uploadMetaRef.current.set(data.taskId, {
        title,
        author: author ?? '',
        language: language ?? '',
        fileName: file.name,
      });
      setTasks((prev) => [
        ...prev,
        { taskId: data.taskId, fileName: file.name, title, duplicateTitle: data.duplicateTitle },
      ]);
      // Wake the app-level task-notification watcher: it stops polling /tasks
      // when idle, so a freshly started ingestion must invalidate the shared
      // list query to resume polling and eventually fire its completion toast.
      void queryClient.invalidateQueries({ queryKey: qk.tasks.list() });
      // Advance to the next queued file; the last drop's rejections are moot now.
      setQueue((q) => q.slice(1));
      setRejections([]);
    },
    onError: (err: Error) => {
      if (err.name === 'AbortError') return;
    },
  });

  const updateActive = useCallback((patch: Partial<PendingFile>) => {
    setQueue((q) => (q.length > 0 ? [{ ...q[0], ...patch }, ...q.slice(1)] : q));
  }, []);

  const handleFilesSelected = useCallback(
    (files: File[]) => {
      const { valid, rejected } = partitionFiles(files);
      setRejections(rejected);
      if (valid.length === 0) return;
      upload.reset();
      setQueue((q) => [...q, ...valid.map((f) => toPending(f))]);
    },
    [upload],
  );

  const handleConfirmUpload = useCallback(() => {
    if (!active || !active.title.trim()) return;
    const controller = new AbortController();
    abortRef.current = controller;
    upload.mutate({
      file: active.file,
      title: active.title.trim(),
      author: active.author.trim() || undefined,
      language: active.language || undefined,
      signal: controller.signal,
    });
  }, [active, upload]);

  const handleCancelActive = useCallback(() => {
    abortRef.current?.abort();
    abortRef.current = null;
    upload.reset();
    setQueue((q) => q.slice(1));
    setRejections([]);
  }, [upload]);

  const removeQueued = useCallback((id: string) => {
    setQueue((q) => q.filter((p) => p.id !== id));
  }, []);

  const handleTaskDone = useCallback(
    (taskId: string, bookId: string, _fileName: string, detection?: TimelineDetectionResponse) => {
      const alreadySeen = completedTaskIdsRef.current.has(taskId);
      completedTaskIdsRef.current.add(taskId);
      try {
        sessionStorage.setItem('upload-completed-tasks', JSON.stringify([...completedTaskIdsRef.current]));
      } catch {
        // ignore storage errors
      }
      setDoneTaskIds((prev) => new Set([...prev, taskId]));
      if (!alreadySeen && detection?.chapterModeViable) {
        setTimelineModal({ bookId, detection });
      }
    },
    [],
  );

  const handleTaskError = useCallback((taskId: string, fileName: string, message?: string) => {
    const meta = uploadMetaRef.current.get(taskId);
    setTasks((prev) => prev.filter((t) => t.taskId !== taskId));
    // Only removal point for a task, and the errored entry below keeps just
    // {taskId, fileName, message, meta} — so the murmur buffer becomes
    // unreachable here. The store is module-level by design (it has to survive
    // remount and navigation), which also means nothing reclaims it unless
    // someone says so.
    clearMurmur(taskId);
    setErroredTasks((prev) => [
      ...prev,
      { taskId, fileName, message, meta: meta ? { title: meta.title, author: meta.author, language: meta.language } : undefined },
    ]);
  }, []);

  // Terminated by the user, or no longer known to the server: the card just
  // leaves. Not an error, so no errored entry / retry offer.
  const handleTaskGone = useCallback((taskId: string) => {
    setTasks((prev) => prev.filter((t) => t.taskId !== taskId));
    uploadMetaRef.current.delete(taskId);
    clearMurmur(taskId);
  }, []);

  const dismissErroredTask = useCallback((taskId: string) => {
    setErroredTasks((prev) => prev.filter((t) => t.taskId !== taskId));
  }, []);

  const handleRetry = useCallback((et: ErroredTask) => {
    retryMetaRef.current = et.meta ?? null;
    dismissErroredTask(et.taskId);
    retryInputRef.current?.click();
  }, [dismissErroredTask]);

  const handleRetryFilePicked = useCallback((e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    e.target.value = '';
    if (!file) return;
    upload.reset();
    setQueue((q) => [toPending(file, retryMetaRef.current ?? undefined), ...q]);
    retryMetaRef.current = null;
  }, [upload]);


  const titleDup = active ? libraryTitles.has(active.title.trim()) : false;
  // Density switches inside the page: entry (drop / form) is C 入口; once a
  // task is on the page the whole page becomes a work surface (B 檢視).
  const density = tasks.length > 0 ? 'view' : 'entry';
  const detectedLabel = active?.langDetected
    ? t(LANGUAGE_OPTIONS.find((opt) => opt.value === active.language)?.labelKey ?? 'languageAuto')
    : null;

  const rejectionBox = rejections.length > 0 && (
    <div className="up-notice up-notice-error" role="alert">
      <span className="up-notice-icon"><AlertTriangle size={16} /></span>
      <div className="up-notice-lines">
        {rejections.map((r, i) => (
          <span key={`${r.name}-${i}`}>
            {r.name} · {r.reason === 'format'
              ? t('dropzone.errorInvalidFormat')
              : t('dropzone.errorTooLarge', { max: MAX_FILE_MB })}
          </span>
        ))}
      </div>
    </div>
  );

  return (
    <div className="up-page">
      <div className="up-wrap" data-density={density}>
        <div className="up-inner">
          <h1 className="up-title">{t('title')}</h1>

          {/* Hidden input driven by an error card's retry button */}
          <input
            ref={retryInputRef}
            type="file"
            accept={ACCEPT_ATTR}
            className="up-hidden"
            onChange={handleRetryFilePicked}
          />

          {recoveryError != null ? (
            <PageFailure
              variant={failureKind(recoveryError)}
              pageName={tn('upload')}
              onRetry={() => setRecoverySeq((s) => s + 1)}
              techDetail={techDetailOf(recoveryError)}
            />
          ) : (
            <>
              {/* A · Idle — only when nothing is queued */}
              {!active && (
                <>
                  <DropZone onFiles={handleFilesSelected} />
                  {rejectionBox}
                </>
              )}

              {/* B · metadata form for queue[0] */}
              {active && (
                <>
                  {rejectionBox}
                  <div className="up-file">
                    <span className="up-file-icon"><FileText size={18} strokeWidth={1.5} /></span>
                    <span className="up-file-name">{active.file.name}</span>
                    <span className="up-mono-meta">{sizeLabel(active.file)}</span>
                    <button type="button" className="ss-btn ss-btn-sm ss-btn-ghost" onClick={handleCancelActive}>
                      {t('removeFile')}
                    </button>
                  </div>

                  <div className="up-card up-form">
                    <div className="up-field">
                      <label className="up-label" htmlFor="up-title-input">{t('bookTitle')}</label>
                      <input
                        id="up-title-input"
                        className="up-input"
                        value={active.title}
                        onChange={(e) => updateActive({ title: e.target.value })}
                        onKeyDown={(e) => { if (e.key === 'Enter' && !e.nativeEvent.isComposing) handleConfirmUpload(); }}
                        autoFocus
                      />
                      <span className="up-hint">{t('titleHint')}</span>
                    </div>

                    <div className="up-grid2">
                      <div className="up-field">
                        <label className="up-label" htmlFor="up-author-input">{t('author')}</label>
                        <input
                          id="up-author-input"
                          className="up-input"
                          placeholder={t('authorPlaceholder')}
                          value={active.author}
                          onChange={(e) => updateActive({ author: e.target.value })}
                          onKeyDown={(e) => { if (e.key === 'Enter' && !e.nativeEvent.isComposing) handleConfirmUpload(); }}
                        />
                      </div>
                      <div className="up-field">
                        <label className="up-label" htmlFor="up-lang-input">{t('language')}</label>
                        <select
                          id="up-lang-input"
                          className="up-input"
                          value={active.language}
                          onChange={(e) => updateActive({ language: e.target.value, langDetected: false })}
                        >
                          {LANGUAGE_OPTIONS.map((opt) => (
                            <option key={opt.value} value={opt.value}>
                              {t(opt.labelKey)}
                            </option>
                          ))}
                        </select>
                        {detectedLabel && (
                          <span className="up-detect">
                            <span className="ss-llm-glyph" aria-hidden="true" />
                            {t('langDetected', { lang: detectedLabel })}
                          </span>
                        )}
                      </div>
                    </div>

                    {titleDup && (
                      <div className="up-notice up-notice-warning">
                        <span className="up-notice-icon"><AlertTriangle size={16} /></span>
                        <span>{t('duplicateTitleWarning', { title: active.title.trim() })}</span>
                      </div>
                    )}

                    {upload.error && upload.error.name !== 'AbortError' && (
                      <div className="up-notice up-notice-error up-notice-inset" role="alert">
                        <span className="up-notice-icon"><AlertTriangle size={16} /></span>
                        <span>{upload.error.message}</span>
                      </div>
                    )}

                    <div className="up-actions">
                      <button
                        type="button"
                        className="ss-btn ss-btn-md ss-btn-primary"
                        disabled={!active.title.trim() || upload.isPending}
                        onClick={handleConfirmUpload}
                      >
                        {upload.isPending && <Loader2 size={12} className="up-spin" />}
                        {t('confirmUpload')}
                      </button>
                      <button type="button" className="ss-btn ss-btn-md ss-btn-ghost" onClick={handleCancelActive}>
                        {tc('cancel')}
                      </button>
                    </div>
                  </div>

                  {/* Waiting queue (files after the active one) */}
                  {queue.length > 1 && (
                    <div className="up-queue">
                      <span className="up-queue-title">{t('queueTitle')}</span>
                      {queue.slice(1).map((p, i) => (
                        <div key={p.id} className="up-queue-row">
                          <span className="up-mono-meta">{queueNo(i)}</span>
                          <span className="up-queue-name">{p.file.name}</span>
                          <span className="up-muted-2xs">{t('queueWaiting')}</span>
                          <button
                            type="button"
                            className="up-icon-btn"
                            onClick={() => removeQueued(p.id)}
                            aria-label={tc('remove')}
                          >
                            <X size={14} />
                          </button>
                        </div>
                      ))}
                    </div>
                  )}
                </>
              )}

              {/* C–F · processing / awaiting review / partial / done */}
              {tasks.length > 0 && (
                <div className="up-tasks">
                  <span className="up-section-label">{t('processingSection')}</span>
                  {tasks.map((task) => (
                    <div key={task.taskId} id={task.taskId} className="up-task-slot">
                      {task.duplicateTitle && (
                        <div className="up-notice up-notice-warning">
                          <span className="up-notice-icon"><AlertTriangle size={14} /></span>
                          <span>{t('duplicateTitleWarning', { title: task.title })}</span>
                        </div>
                      )}
                      <ProcessingCard task={task} onDone={handleTaskDone} onError={handleTaskError} onGone={handleTaskGone} />
                    </div>
                  ))}
                </div>
              )}

              {/* F · errored tasks — retry only reopens the file picker (zero cost) */}
              {erroredTasks.map((et) => (
                <div key={et.taskId} className="up-failed">
                  <span className="up-failed-icon"><AlertTriangle size={18} /></span>
                  <div className="up-failed-main">
                    <span className="up-failed-name">{et.fileName}</span>
                    {et.message && <code className="up-code">{et.message}</code>}
                  </div>
                  <button type="button" className="ss-btn ss-btn-sm ss-btn-secondary" onClick={() => handleRetry(et)}>
                    {t('retry')}
                  </button>
                  <button
                    type="button"
                    className="up-icon-btn"
                    onClick={() => dismissErroredTask(et.taskId)}
                    aria-label={tc('remove')}
                  >
                    <X size={15} />
                  </button>
                </div>
              ))}
            </>
          )}

          {timelineModal && (
            <TimelineConfigModal
              bookId={timelineModal.bookId}
              detection={timelineModal.detection}
              onClose={() => setTimelineModal(null)}
            />
          )}
        </div>
      </div>
    </div>
  );
}
