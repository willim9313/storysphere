import { useState, useCallback, useRef, useEffect, useMemo } from 'react';
import { useLocation } from 'react-router-dom';
import { useMutation } from '@tanstack/react-query';
import { useTranslation } from 'react-i18next';
import { AlertTriangle, FileText, Loader2, RefreshCw, Sparkles, Trash2, X } from 'lucide-react';
import type { TimelineDetectionResponse } from '@/api/graph';
import { detectLanguage, uploadBook } from '@/api/ingest';
import { fetchTasks } from '@/api/tasks';
import { useBooks } from '@/hooks/useBooks';
import { DropZone } from '@/components/upload/DropZone';
import { ProcessingCard } from '@/components/upload/ProcessingCard';
import { TimelineConfigModal } from '@/components/graph/TimelineConfigModal';

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
  { value: 'zh', labelKey: 'languageZh' },
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
  const { t: tc } = useTranslation('common');

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
      .catch(() => {
        // Server unreachable — the sessionStorage-backed list still renders.
      });
    return () => {
      cancelled = true;
    };
  }, []);

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
        const normalized = language.split('-')[0];
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
      // Advance to the next queued file.
      setQueue((q) => q.slice(1));
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
      upload.reset();
      setQueue((q) => [...q, ...files.map((f) => toPending(f))]);
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
    setErroredTasks((prev) => [
      ...prev,
      { taskId, fileName, message, meta: meta ? { title: meta.title, author: meta.author, language: meta.language } : undefined },
    ]);
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

  return (
    <div className="overflow-y-auto flex-1">
      <div className="py-9 px-9 max-w-2xl mx-auto">
      <h1
        className="font-bold mb-6"
        style={{ fontFamily: 'var(--font-serif)', fontSize: 'var(--font-size-2xl)', color: 'var(--fg-primary)' }}
      >
        {t('title')}
      </h1>

      {/* Hidden input driven by an error card's retry button */}
      <input
        ref={retryInputRef}
        type="file"
        accept=".pdf,.docx,.txt,.epub"
        className="hidden"
        onChange={handleRetryFilePicked}
      />

      {/* Upload zone — idle (only when nothing is queued) */}
      {!active && <DropZone onFilesSelected={handleFilesSelected} />}

      {/* Metadata form for the active file */}
      {active && (
        <>
          <div
            style={{
              border: '1px solid var(--border)',
              borderRadius: 'var(--radius-lg)',
              backgroundColor: 'var(--bg-primary)',
              padding: '14px 20px',
              display: 'flex',
              alignItems: 'center',
              gap: 12,
            }}
          >
            <FileText size={18} style={{ color: 'var(--accent)', flexShrink: 0 }} />
            <div style={{ flex: 1, minWidth: 0 }}>
              <div style={{ fontFamily: 'var(--font-serif)', fontSize: 'var(--font-size-sm)', fontWeight: 600, color: 'var(--fg-primary)', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                {active.file.name}
              </div>
              <div style={{ fontFamily: 'var(--font-sans)', fontSize: 'var(--font-size-2xs)', color: 'var(--fg-muted)', marginTop: 2 }}>
                {sizeLabel(active.file)}
              </div>
            </div>
            <button
              onClick={handleCancelActive}
              style={{ background: 'none', border: 'none', cursor: 'pointer', fontFamily: 'var(--font-sans)', fontSize: 'var(--font-size-2xs)', color: 'var(--fg-muted)', flexShrink: 0 }}
            >
              {t('removeFile')}
            </button>
          </div>

          <div className="card mt-4" style={{ display: 'flex', flexDirection: 'column', gap: 'var(--space-md)' }}>
            <div>
              <label style={{ display: 'block', fontFamily: 'var(--font-sans)', fontSize: 'var(--font-size-xs)', fontWeight: 500, color: 'var(--fg-secondary)', marginBottom: 6 }}>
                {t('bookTitle')}
              </label>
              <input
                className="w-full"
                style={{ fontFamily: 'var(--font-sans)', fontSize: 'var(--font-size-sm)', color: 'var(--fg-primary)', backgroundColor: 'var(--bg-primary)', border: '1px solid var(--border)', borderRadius: 'var(--radius-md)', padding: '8px 12px', outline: 'none', boxSizing: 'border-box', transition: 'border-color var(--transition-fast)' }}
                value={active.title}
                onChange={(e) => updateActive({ title: e.target.value })}
                onKeyDown={(e) => { if (e.key === 'Enter' && !e.nativeEvent.isComposing) handleConfirmUpload(); }}
                autoFocus
              />
              {titleDup ? (
                <div style={{ display: 'flex', alignItems: 'center', gap: 6, marginTop: 7, fontFamily: 'var(--font-sans)', fontSize: 'var(--font-size-2xs)', color: 'var(--color-warning)' }}>
                  <AlertTriangle size={13} />
                  {t('duplicateTitleWarning', { title: active.title.trim() })}
                </div>
              ) : (
                <p style={{ fontFamily: 'var(--font-sans)', fontSize: 'var(--font-size-2xs)', color: 'var(--fg-muted)', margin: '7px 0 0' }}>
                  {t('titleHint')}
                </p>
              )}
            </div>

            <div>
              <label style={{ display: 'block', fontFamily: 'var(--font-sans)', fontSize: 'var(--font-size-xs)', fontWeight: 500, color: 'var(--fg-secondary)', marginBottom: 6 }}>
                {t('author')}
              </label>
              <input
                className="w-full"
                style={{ fontFamily: 'var(--font-sans)', fontSize: 'var(--font-size-sm)', color: 'var(--fg-primary)', backgroundColor: 'var(--bg-primary)', border: '1px solid var(--border)', borderRadius: 'var(--radius-md)', padding: '8px 12px', outline: 'none', boxSizing: 'border-box', transition: 'border-color var(--transition-fast)' }}
                placeholder={t('authorPlaceholder')}
                value={active.author}
                onChange={(e) => updateActive({ author: e.target.value })}
                onKeyDown={(e) => { if (e.key === 'Enter' && !e.nativeEvent.isComposing) handleConfirmUpload(); }}
              />
            </div>

            <div>
              <div style={{ display: 'flex', alignItems: 'center', gap: 9, marginBottom: 6 }}>
                <label style={{ fontFamily: 'var(--font-sans)', fontSize: 'var(--font-size-xs)', fontWeight: 500, color: 'var(--fg-secondary)' }}>
                  {t('language')}
                </label>
                {active.langDetected && (
                  <span style={{ display: 'inline-flex', alignItems: 'center', gap: 4, fontFamily: 'var(--font-sans)', fontSize: 'var(--font-size-2xs)', fontWeight: 500, color: 'var(--color-info)', background: 'var(--color-info-bg)', padding: '3px 7px', borderRadius: 'var(--badge-radius)' }}>
                    <Sparkles size={11} />
                    {t('langDetected', { lang: t(`language${(active.language.charAt(0).toUpperCase() + active.language.slice(1)) || 'Auto'}`) })}
                  </span>
                )}
              </div>
              <select
                className="w-full"
                style={{ fontFamily: 'var(--font-sans)', fontSize: 'var(--font-size-sm)', color: 'var(--fg-primary)', backgroundColor: 'var(--bg-primary)', border: '1px solid var(--border)', borderRadius: 'var(--radius-md)', padding: '8px 12px', outline: 'none', boxSizing: 'border-box', transition: 'border-color var(--transition-fast)', cursor: 'pointer' }}
                value={active.language}
                onChange={(e) => updateActive({ language: e.target.value, langDetected: false })}
              >
                {LANGUAGE_OPTIONS.map((opt) => (
                  <option key={opt.value} value={opt.value}>
                    {t(opt.labelKey)}
                  </option>
                ))}
              </select>
            </div>

            {upload.error && upload.error.name !== 'AbortError' && (
              <p style={{ fontFamily: 'var(--font-sans)', fontSize: 'var(--font-size-xs)', color: 'var(--color-error)', margin: 0 }}>
                {upload.error.message}
              </p>
            )}

            <div style={{ display: 'flex', justifyContent: 'flex-end', gap: 8, paddingTop: 'var(--space-sm)', borderTop: '1px solid var(--border)' }}>
              <button className="btn btn-secondary" onClick={handleCancelActive}>
                {tc('cancel')}
              </button>
              <button className="btn btn-primary" disabled={!active.title.trim() || upload.isPending} onClick={handleConfirmUpload}>
                {upload.isPending && <Loader2 size={13} className="animate-spin" />}
                {t('confirmUpload')}
              </button>
            </div>
          </div>

          {/* Waiting queue (files after the active one) */}
          {queue.length > 1 && (
            <div className="mt-5">
              <p style={{ fontFamily: 'var(--font-sans)', fontSize: 'var(--font-size-2xs)', color: 'var(--fg-muted)', marginBottom: 9 }}>
                {t('queueTitle')}
              </p>
              <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
                {queue.slice(1).map((p, i) => (
                  <div
                    key={p.id}
                    style={{ display: 'flex', alignItems: 'center', gap: 11, padding: '12px 14px', border: '1px solid var(--border)', borderRadius: 'var(--card-radius)', background: 'var(--bg-primary)' }}
                  >
                    <span style={{ flex: 'none', width: 24, height: 24, borderRadius: '50%', border: '1px dashed var(--border)', display: 'grid', placeItems: 'center', fontFamily: 'var(--font-sans)', fontSize: 'var(--font-size-2xs)', fontWeight: 600, color: 'var(--fg-muted)' }}>
                      {i + 1}
                    </span>
                    <FileText size={17} style={{ color: 'var(--fg-muted)', flexShrink: 0 }} />
                    <div style={{ flex: 1, minWidth: 0 }}>
                      <div style={{ fontFamily: 'var(--font-sans)', fontSize: 'var(--font-size-sm)', fontWeight: 500, color: 'var(--fg-primary)', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                        {p.file.name}
                      </div>
                      <div style={{ fontFamily: 'var(--font-sans)', fontSize: 'var(--font-size-2xs)', color: 'var(--fg-muted)', marginTop: 3 }}>
                        {t('queueWaiting')}
                      </div>
                    </div>
                    <button onClick={() => removeQueued(p.id)} aria-label={tc('remove')} style={{ flex: 'none', border: 'none', background: 'transparent', color: 'var(--fg-muted)', cursor: 'pointer', padding: 3, lineHeight: 0 }}>
                      <Trash2 size={15} />
                    </button>
                  </div>
                ))}
              </div>
            </div>
          )}
        </>
      )}

      {/* Processing tasks */}
      {tasks.length > 0 && (
        <div className="mt-8">
          <p
            className="mb-3"
            style={{ fontFamily: 'var(--font-sans)', fontSize: 'var(--font-size-2xs)', fontWeight: 500, color: 'var(--fg-muted)', letterSpacing: '0.06em', textTransform: 'uppercase' }}
          >
            {t('processingSection')}
          </p>
          <div className="space-y-4">
            {tasks.map((task) => (
              <div key={task.taskId} id={task.taskId}>
                {task.duplicateTitle && (
                  <p
                    className="text-xs mb-1.5 px-2 py-1 rounded-md"
                    style={{ color: 'var(--color-warning)', backgroundColor: 'var(--color-warning-bg)' }}
                  >
                    {t('duplicateTitleWarning', { title: task.title })}
                  </p>
                )}
                <ProcessingCard task={task} onDone={handleTaskDone} onError={handleTaskError} />
              </div>
            ))}
          </div>
        </div>
      )}

      {/* Errored tasks */}
      {erroredTasks.length > 0 && (
        <div className="mt-6 space-y-2">
          {erroredTasks.map((et) => (
            <div
              key={et.taskId}
              style={{ display: 'flex', alignItems: 'flex-start', gap: 11, padding: '14px 16px', borderRadius: 'var(--card-radius)', backgroundColor: 'var(--color-error-bg)', border: '1px solid var(--color-error)' }}
            >
              <span className="w-2 h-2 rounded-full mt-1.5" style={{ backgroundColor: 'var(--color-error)', flexShrink: 0 }} />
              <div style={{ flex: 1, minWidth: 0 }}>
                <div style={{ fontFamily: 'var(--font-serif)', fontSize: 'var(--font-size-sm)', color: 'var(--fg-primary)' }}>{et.fileName}</div>
                {et.message && (
                  <p className="text-xs mt-0.5" style={{ color: 'var(--color-error)' }}>
                    {et.message}
                  </p>
                )}
                <button
                  onClick={() => handleRetry(et)}
                  style={{ marginTop: 10, display: 'inline-flex', alignItems: 'center', gap: 5, fontFamily: 'var(--font-sans)', fontSize: 'var(--font-size-2xs)', fontWeight: 600, color: 'var(--color-error)', background: 'transparent', border: '1px solid var(--color-error)', borderRadius: 'var(--btn-radius)', padding: '7px 13px', cursor: 'pointer' }}
                >
                  <RefreshCw size={12} />
                  {t('retry')}
                </button>
              </div>
              <button onClick={() => dismissErroredTask(et.taskId)} style={{ color: 'var(--fg-muted)', flexShrink: 0 }} aria-label={tc('remove')}>
                <X size={14} />
              </button>
            </div>
          ))}
        </div>
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
  );
}
