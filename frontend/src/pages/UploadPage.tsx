import { useState, useCallback, useRef, useEffect } from 'react';
import { useLocation } from 'react-router-dom';
import { useMutation } from '@tanstack/react-query';
import { useTranslation } from 'react-i18next';
import { Loader2, X } from 'lucide-react';
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
  // Persisted across navigation so re-mounting doesn't re-fire the timeline modal for already-completed tasks
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

  return (
    <div className="p-6 overflow-y-auto h-full max-w-2xl mx-auto">
      <h1
        className="text-2xl font-bold mb-6"
        style={{ fontFamily: 'var(--font-serif)', color: 'var(--fg-primary)' }}
      >
        {t('title')}
      </h1>

      {/* Upload zone */}
      {!pending && <DropZone onFileSelected={handleFileSelected} />}

      {/* Title confirmation step */}
      {pending && (
        <div
          className="mt-4 p-4 rounded-lg"
          style={{ border: '1px solid var(--border)', backgroundColor: 'var(--bg-secondary)' }}
        >
          <p className="text-sm font-medium mb-2" style={{ color: 'var(--fg-secondary)' }}>
            {t('bookTitle')}
          </p>
          <input
            className="w-full px-3 py-2 rounded-md text-sm mb-1"
            style={{
              border: '1px solid var(--border)',
              backgroundColor: 'var(--bg-primary)',
              color: 'var(--fg-primary)',
              outline: 'none',
            }}
            value={pending.title}
            onChange={(e) => setPending({ ...pending, title: e.target.value })}
            autoFocus
          />
          <p className="text-xs mb-3" style={{ color: 'var(--fg-muted)' }}>
            {t('titleHint')}
          </p>
          <p className="text-sm font-medium mb-1" style={{ color: 'var(--fg-secondary)' }}>
            {t('author')}
          </p>
          <input
            className="w-full px-3 py-2 rounded-md text-sm"
            style={{
              border: '1px solid var(--border)',
              backgroundColor: 'var(--bg-primary)',
              color: 'var(--fg-primary)',
              outline: 'none',
            }}
            placeholder={t('authorPlaceholder')}
            value={pending.author}
            onChange={(e) => setPending({ ...pending, author: e.target.value })}
            onKeyDown={(e) => {
              if (e.key === 'Enter') handleConfirmUpload();
            }}
          />
          <div className="flex gap-2 justify-end mt-3">
            <button
              className="text-sm px-3 py-1 rounded-md"
              style={{ color: 'var(--fg-muted)', border: '1px solid var(--border)' }}
              onClick={handleCancel}
            >
              {tc('cancel')}
            </button>
            <button
              className="text-sm px-3 py-1 rounded-md font-medium flex items-center gap-1.5"
              style={{ backgroundColor: 'var(--accent)', color: 'white', border: 'none' }}
              disabled={!pending.title.trim() || upload.isPending}
              onClick={handleConfirmUpload}
            >
              {upload.isPending && <Loader2 size={13} className="animate-spin" />}
              {t('confirmUpload')}
            </button>
          </div>
        </div>
      )}

      {upload.error && upload.error.name !== 'AbortError' && (
        <p className="text-sm mt-2" style={{ color: 'var(--color-error)' }}>
          {upload.error.message}
        </p>
      )}

      {/* Processing tasks */}
      {tasks.length > 0 && (
        <div className="mt-8">
          <h2 className="text-sm font-semibold mb-3" style={{ color: 'var(--fg-secondary)' }}>
            {t('processingSection')}
          </h2>
          <div className="space-y-4">
            {tasks.map((task) => (
              <div key={task.taskId} id={task.taskId}>
                <ProcessingCard
                  task={task}
                  onDone={handleTaskDone}
                  onError={handleTaskError}
                />
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
              <button
                onClick={() => dismissErroredTask(et.taskId)}
                style={{ color: 'var(--fg-muted)' }}
              >
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
  );
}
