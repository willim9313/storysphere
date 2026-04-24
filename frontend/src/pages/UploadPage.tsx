import { useState, useCallback, useRef } from 'react';
import { Link } from 'react-router-dom';
import { useMutation } from '@tanstack/react-query';
import { useTranslation } from 'react-i18next';
import { uploadBook } from '@/api/ingest';
import { useTaskPolling } from '@/hooks/useTaskPolling';
import { DropZone } from '@/components/upload/DropZone';
import { ProcessingTimeline } from '@/components/upload/ProcessingTimeline';
import { TimelineConfigModal } from '@/components/graph/TimelineConfigModal';
import { ArrowRight } from 'lucide-react';
import type { TimelineDetectionResponse } from '@/api/graph';

interface UploadTask {
  taskId: string;
  fileName: string;
}

interface PendingFile {
  file: File;
  title: string;
  author: string;
}

export default function UploadPage() {
  const [pending, setPending] = useState<PendingFile | null>(null);
  const [tasks, setTasks] = useState<UploadTask[]>([]);
  const [completedTasks, setCompletedTasks] = useState<{ taskId: string; fileName: string; bookId: string }[]>([]);
  const [timelineModal, setTimelineModal] = useState<{ bookId: string; detection: TimelineDetectionResponse } | null>(null);
  const { t } = useTranslation('upload');
  const { t: tc } = useTranslation('common');

  const upload = useMutation({
    mutationFn: ({ file, title, author }: { file: File; title: string; author?: string }) => uploadBook(file, title, author),
    onSuccess: (data, { file }) => {
      setTasks((prev) => [...prev, { taskId: data.taskId, fileName: file.name }]);
      setPending(null);
    },
  });

  const handleFileSelected = useCallback((file: File) => {
    const stem = file.name.replace(/\.[^.]+$/, '');
    setPending({ file, title: stem, author: '' });
  }, []);

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
              backgroundColor: 'white',
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
              backgroundColor: 'white',
              color: 'var(--fg-primary)',
              outline: 'none',
            }}
            placeholder={t('authorPlaceholder')}
            value={pending.author}
            onChange={(e) => setPending({ ...pending, author: e.target.value })}
            onKeyDown={(e) => {
              if (e.key === 'Enter' && pending.title.trim()) {
                upload.mutate({ file: pending.file, title: pending.title.trim(), author: pending.author.trim() || undefined });
              }
            }}
          />
          <div className="flex gap-2 justify-end mt-3">
            <button
              className="text-sm px-3 py-1 rounded-md"
              style={{ color: 'var(--fg-muted)', border: '1px solid var(--border)' }}
              onClick={() => setPending(null)}
            >
              {tc('cancel')}
            </button>
            <button
              className="text-sm px-3 py-1 rounded-md font-medium"
              style={{ backgroundColor: 'var(--accent)', color: 'white', border: 'none' }}
              disabled={!pending.title.trim() || upload.isPending}
              onClick={() => upload.mutate({ file: pending.file, title: pending.title.trim(), author: pending.author.trim() || undefined })}
            >
              {t('confirmUpload')}
            </button>
          </div>
        </div>
      )}

      {upload.error && (
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
                style={{ backgroundColor: 'white', border: '1px solid var(--border)' }}
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

function ProcessingCard({
  task,
  onDone,
}: {
  task: UploadTask;
  onDone: (taskId: string, bookId: string, fileName: string, detection?: TimelineDetectionResponse) => void;
}) {
  const { data: status } = useTaskPolling(task.taskId);
  const notified = useRef(false);

  if (status?.status === 'done' && status.result?.bookId && !notified.current) {
    notified.current = true;
    const detection = status.result.timelineDetection as TimelineDetectionResponse | undefined;
    setTimeout(() => onDone(task.taskId, status.result!.bookId!, task.fileName, detection), 0);
  }

  return (
    <div
      className="card"
      style={{ border: '1px solid var(--border)' }}
    >
      <div className="flex items-center justify-between mb-3">
        <span className="text-sm font-medium">{task.fileName}</span>
        {status && (
          <span className="text-xs" style={{ color: 'var(--fg-muted)' }}>
            {status.progress}%
          </span>
        )}
      </div>
      {status && <ProcessingTimeline task={status} />}
    </div>
  );
}
