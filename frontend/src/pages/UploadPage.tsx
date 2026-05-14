import { useState, useCallback, useRef, useEffect } from 'react';
import { useLocation } from 'react-router-dom';
import { useMutation } from '@tanstack/react-query';
import { useTranslation } from 'react-i18next';
import { FileText, Loader2, X } from 'lucide-react';
import type { TimelineDetectionResponse } from '@/api/graph';
import { uploadBook } from '@/api/ingest';
import { DropZone } from '@/components/upload/DropZone';
import { ProcessingCard } from '@/components/upload/ProcessingCard';
import { TimelineConfigModal } from '@/components/graph/TimelineConfigModal';

interface UploadTask {
  taskId: string;
  fileName: string;
  title: string;
}

interface ErroredTask {
  taskId: string;
  fileName: string;
  message?: string;
}

interface PendingFile {
  file: File;
  title: string;
  author: string;
}

export default function UploadPage() {
  const location = useLocation();

  const [pending, setPending] = useState<PendingFile | null>(null);
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

  useEffect(() => {
    const activeTasks = tasks.filter((t) => !doneTaskIds.has(t.taskId));
    if (activeTasks.length === 0) sessionStorage.removeItem('upload-tasks');
    else sessionStorage.setItem('upload-tasks', JSON.stringify(activeTasks));
  }, [tasks, doneTaskIds]);

  useEffect(() => {
    if (!location.hash) return;
    const id = location.hash.slice(1);
    setTimeout(() => {
      document.getElementById(id)?.scrollIntoView({ behavior: 'smooth', block: 'start' });
    }, 100);
  }, [location.hash]);

  const { t } = useTranslation('upload');
  const { t: tc } = useTranslation('common');

  const abortRef = useRef<AbortController | null>(null);

  const upload = useMutation({
    mutationFn: ({ file, title, author, signal }: { file: File; title: string; author?: string; signal: AbortSignal }) =>
      uploadBook(file, title, author, signal),
    onSuccess: (data, { file, title }) => {
      setTasks((prev) => [...prev, { taskId: data.taskId, fileName: file.name, title }]);
      setPending(null);
    },
    onError: (err: Error) => {
      if (err.name === 'AbortError') return;
    },
  });

  const handleFileSelected = useCallback(
    (file: File) => {
      upload.reset();
      const stem = file.name.replace(/\.[^.]+$/, '');
      setPending({ file, title: stem, author: '' });
    },
    [upload],
  );

  const handleConfirmUpload = useCallback(() => {
    if (!pending || !pending.title.trim()) return;
    const controller = new AbortController();
    abortRef.current = controller;
    upload.mutate({
      file: pending.file,
      title: pending.title.trim(),
      author: pending.author.trim() || undefined,
      signal: controller.signal,
    });
  }, [pending, upload]);

  const handleCancel = useCallback(() => {
    abortRef.current?.abort();
    abortRef.current = null;
    upload.reset();
    setPending(null);
  }, [upload]);

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
    setTasks((prev) => prev.filter((t) => t.taskId !== taskId));
    setErroredTasks((prev) => [...prev, { taskId, fileName, message }]);
  }, []);

  const dismissErroredTask = useCallback((taskId: string) => {
    setErroredTasks((prev) => prev.filter((t) => t.taskId !== taskId));
  }, []);

  const fileSizeMB = pending ? (pending.file.size / 1024 / 1024).toFixed(1) : '';

  return (
    <div className="overflow-y-auto flex-1">
      <div className="py-9 px-9 max-w-2xl mx-auto">
      <h1
        className="font-bold mb-6"
        style={{ fontFamily: 'var(--font-serif)', fontSize: 26, color: 'var(--fg-primary)' }}
      >
        {t('title')}
      </h1>

      {/* Upload zone — idle */}
      {!pending && <DropZone onFileSelected={handleFileSelected} />}

      {/* Upload zone — file selected (compact bar) */}
      {pending && (
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
            <div
              style={{
                fontFamily: 'var(--font-serif)',
                fontSize: 14,
                fontWeight: 600,
                color: 'var(--fg-primary)',
                overflow: 'hidden',
                textOverflow: 'ellipsis',
                whiteSpace: 'nowrap',
              }}
            >
              {pending.file.name}
            </div>
            <div style={{ fontFamily: 'var(--font-sans)', fontSize: 11, color: 'var(--fg-muted)', marginTop: 2 }}>
              {fileSizeMB}&nbsp;MB · PDF
            </div>
          </div>
          <button
            onClick={handleCancel}
            style={{
              background: 'none',
              border: 'none',
              cursor: 'pointer',
              fontFamily: 'var(--font-sans)',
              fontSize: 11,
              color: 'var(--fg-muted)',
              flexShrink: 0,
            }}
          >
            更換檔案
          </button>
        </div>
      )}

      {/* Metadata card */}
      {pending && (
        <div
          className="card mt-4"
          style={{ display: 'flex', flexDirection: 'column', gap: 'var(--space-md)' }}
        >
          <div>
            <label
              style={{
                display: 'block',
                fontFamily: 'var(--font-sans)',
                fontSize: 12,
                fontWeight: 500,
                color: 'var(--fg-secondary)',
                marginBottom: 6,
              }}
            >
              {t('bookTitle')}
            </label>
            <input
              className="w-full"
              style={{
                fontFamily: 'var(--font-sans)',
                fontSize: 14,
                color: 'var(--fg-primary)',
                backgroundColor: 'var(--bg-primary)',
                border: '1px solid var(--border)',
                borderRadius: 'var(--radius-md)',
                padding: '8px 12px',
                outline: 'none',
                boxSizing: 'border-box',
                transition: 'border-color var(--transition-fast)',
              }}
              value={pending.title}
              onChange={(e) => setPending({ ...pending, title: e.target.value })}
              onKeyDown={(e) => { if (e.key === 'Enter') handleConfirmUpload(); }}
              autoFocus
            />
            <p style={{ fontFamily: 'var(--font-sans)', fontSize: 11, color: 'var(--fg-muted)', margin: '4px 0 0' }}>
              {t('titleHint')}
            </p>
          </div>

          <div>
            <label
              style={{
                display: 'block',
                fontFamily: 'var(--font-sans)',
                fontSize: 12,
                fontWeight: 500,
                color: 'var(--fg-secondary)',
                marginBottom: 6,
              }}
            >
              {t('author')}
            </label>
            <input
              className="w-full"
              style={{
                fontFamily: 'var(--font-sans)',
                fontSize: 14,
                color: 'var(--fg-primary)',
                backgroundColor: 'var(--bg-primary)',
                border: '1px solid var(--border)',
                borderRadius: 'var(--radius-md)',
                padding: '8px 12px',
                outline: 'none',
                boxSizing: 'border-box',
                transition: 'border-color var(--transition-fast)',
              }}
              placeholder={t('authorPlaceholder')}
              value={pending.author}
              onChange={(e) => setPending({ ...pending, author: e.target.value })}
              onKeyDown={(e) => { if (e.key === 'Enter') handleConfirmUpload(); }}
            />
          </div>

          {upload.error && upload.error.name !== 'AbortError' && (
            <p style={{ fontFamily: 'var(--font-sans)', fontSize: 12, color: 'var(--color-error)', margin: 0 }}>
              {upload.error.message}
            </p>
          )}

          <div
            style={{
              display: 'flex',
              justifyContent: 'flex-end',
              gap: 8,
              paddingTop: 'var(--space-sm)',
              borderTop: '1px solid var(--border)',
            }}
          >
            <button className="btn btn-secondary" onClick={handleCancel}>
              {tc('cancel')}
            </button>
            <button
              className="btn btn-primary"
              disabled={!pending.title.trim() || upload.isPending}
              onClick={handleConfirmUpload}
            >
              {upload.isPending && <Loader2 size={13} className="animate-spin" />}
              {t('confirmUpload')}
            </button>
          </div>
        </div>
      )}

      {/* Processing tasks */}
      {tasks.length > 0 && (
        <div className="mt-8">
          <p
            className="mb-3"
            style={{
              fontFamily: 'var(--font-sans)',
              fontSize: 11,
              fontWeight: 500,
              color: 'var(--fg-muted)',
              letterSpacing: '0.06em',
              textTransform: 'uppercase',
            }}
          >
            {t('processingSection')}
          </p>
          <div className="space-y-4">
            {tasks.map((task) => (
              <div key={task.taskId} id={task.taskId}>
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
              className="flex items-center justify-between px-3 py-2 rounded-md"
              style={{ backgroundColor: 'var(--color-error-bg)', border: '1px solid var(--color-error)' }}
            >
              <div className="flex items-center gap-2">
                <span className="w-2 h-2 rounded-full" style={{ backgroundColor: 'var(--color-error)' }} />
                <div>
                  <span className="text-sm">{et.fileName}</span>
                  {et.message && (
                    <p className="text-xs mt-0.5" style={{ color: 'var(--color-error)' }}>
                      {et.message}
                    </p>
                  )}
                </div>
              </div>
              <button onClick={() => dismissErroredTask(et.taskId)} style={{ color: 'var(--fg-muted)' }}>
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
