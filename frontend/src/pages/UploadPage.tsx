import { useState, useCallback, useRef, useEffect } from 'react';
import { Link } from 'react-router-dom';
import { useMutation } from '@tanstack/react-query';
import { useTranslation } from 'react-i18next';
import type { TimelineDetectionResponse } from '@/api/graph';
import { uploadBook } from '@/api/ingest';
import { DropZone } from '@/components/upload/DropZone';
import { ProcessingCard } from '@/components/upload/ProcessingCard';
import { TimelineConfigModal } from '@/components/graph/TimelineConfigModal';
import { ArrowRight, X } from 'lucide-react';
interface UploadTask {
  taskId: string;
  fileName: string;
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

interface CompletedTask {
  taskId: string;
  fileName: string;
  bookId: string;
}

export default function UploadPage() {
  const [pending, setPending] = useState<PendingFile | null>(null);
  const [tasks, setTasks] = useState<UploadTask[]>(() => {
    try {
      const saved = sessionStorage.getItem('upload-tasks');
      return saved ? (JSON.parse(saved) as UploadTask[]) : [];
    } catch {
      return [];
    }
  });
  const [completedTasks, setCompletedTasks] = useState<CompletedTask[]>(() => {
    try {
      const saved = sessionStorage.getItem('completed-tasks');
      return saved ? (JSON.parse(saved) as CompletedTask[]) : [];
    } catch {
      return [];
    }
  });
  const [erroredTasks, setErroredTasks] = useState<ErroredTask[]>([]);
  const [timelineModal, setTimelineModal] = useState<{ bookId: string; detection: TimelineDetectionResponse } | null>(null);

  useEffect(() => {
    if (tasks.length === 0) sessionStorage.removeItem('upload-tasks');
    else sessionStorage.setItem('upload-tasks', JSON.stringify(tasks));
  }, [tasks]);

  useEffect(() => {
    if (completedTasks.length === 0) sessionStorage.removeItem('completed-tasks');
    else sessionStorage.setItem('completed-tasks', JSON.stringify(completedTasks));
  }, [completedTasks]);

  const { t } = useTranslation('upload');
  const { t: tc } = useTranslation('common');

  const abortRef = useRef<AbortController | null>(null);

  const upload = useMutation({
    mutationFn: ({ file, title, author, signal }: { file: File; title: string; author?: string; signal: AbortSignal }) =>
      uploadBook(file, title, author, signal),
    onSuccess: (data, { file }) => {
      setTasks((prev) => [...prev, { taskId: data.taskId, fileName: file.name }]);
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
    (taskId: string, bookId: string, fileName: string, detection?: TimelineDetectionResponse) => {
      setTasks((prev) => prev.filter((t) => t.taskId !== taskId));
      setCompletedTasks((prev) => [...prev, { taskId, bookId, fileName }]);
      if (detection?.chapterModeViable) {
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
            className="w-full px-3 py-2 rounded-md text-sm mb-4"
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
              className="text-sm px-3 py-1 rounded-md font-medium"
              style={{ backgroundColor: 'var(--accent)', color: 'white', border: 'none' }}
              disabled={!pending.title.trim() || upload.isPending}
              onClick={handleConfirmUpload}
            >
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
              <ProcessingCard
                key={task.taskId}
                task={task}
                onDone={handleTaskDone}
                onError={handleTaskError}
              />
            ))}
          </div>
        </div>
      )}

      {/* Completed list */}
      {completedTasks.length > 0 && (
        <div className="mt-8">
          <h2 className="text-sm font-semibold mb-3" style={{ color: 'var(--fg-secondary)' }}>
            {t('completedSection')}
          </h2>
          <div className="space-y-2">
            {completedTasks.map((ct) => (
              <div
                key={ct.taskId}
                className="flex items-center justify-between px-3 py-2 rounded-md"
                style={{ backgroundColor: 'var(--bg-primary)', border: '1px solid var(--border)' }}
              >
                <div className="flex items-center gap-2">
                  <span
                    className="w-2 h-2 rounded-full"
                    style={{ backgroundColor: 'var(--color-success)' }}
                  />
                  <span className="text-sm">{ct.fileName}</span>
                </div>
                <Link
                  to={`/books/${ct.bookId}`}
                  className="text-xs font-medium flex items-center gap-1"
                  style={{ color: 'var(--accent)' }}
                >
                  {t('enterBook')} <ArrowRight size={12} />
                </Link>
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

