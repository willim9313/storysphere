import { useState, useCallback } from 'react';
import { Link } from 'react-router-dom';
import { useMutation } from '@tanstack/react-query';
import { uploadBook } from '@/api/ingest';
import { useTaskPolling } from '@/hooks/useTaskPolling';
import { DropZone } from '@/components/upload/DropZone';
import { ProcessingTimeline } from '@/components/upload/ProcessingTimeline';
import { ArrowRight } from 'lucide-react';

interface UploadTask {
  taskId: string;
  fileName: string;
}

interface PendingFile {
  file: File;
  title: string;
}

export default function UploadPage() {
  const [pending, setPending] = useState<PendingFile | null>(null);
  const [tasks, setTasks] = useState<UploadTask[]>([]);
  const [completedTasks, setCompletedTasks] = useState<{ taskId: string; fileName: string; bookId: string }[]>([]);

  const upload = useMutation({
    mutationFn: ({ file, title }: { file: File; title: string }) => uploadBook(file, title),
    onSuccess: (data, { file }) => {
      setTasks((prev) => [...prev, { taskId: data.taskId, fileName: file.name }]);
      setPending(null);
    },
  });

  const handleFileSelected = useCallback((file: File) => {
    const stem = file.name.replace(/\.[^.]+$/, '');
    setPending({ file, title: stem });
  }, []);

  const handleTaskDone = useCallback((taskId: string, bookId: string, fileName: string) => {
    setTasks((prev) => prev.filter((t) => t.taskId !== taskId));
    setCompletedTasks((prev) => [...prev, { taskId, bookId, fileName }]);
  }, []);

  return (
    <div className="p-6 overflow-y-auto h-full max-w-2xl mx-auto">
      <h1
        className="text-2xl font-bold mb-6"
        style={{ fontFamily: 'var(--font-serif)', color: 'var(--fg-primary)' }}
      >
        上傳 & 處理進度
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
            書籍名稱
          </p>
          <input
            className="w-full px-3 py-2 rounded-md text-sm mb-3"
            style={{
              border: '1px solid var(--border)',
              backgroundColor: 'white',
              color: 'var(--fg-primary)',
              outline: 'none',
            }}
            value={pending.title}
            onChange={(e) => setPending({ ...pending, title: e.target.value })}
            onKeyDown={(e) => {
              if (e.key === 'Enter' && pending.title.trim()) {
                upload.mutate({ file: pending.file, title: pending.title.trim() });
              }
            }}
            autoFocus
          />
          <div className="flex gap-2 justify-end">
            <button
              className="text-sm px-3 py-1 rounded-md"
              style={{ color: 'var(--fg-muted)', border: '1px solid var(--border)' }}
              onClick={() => setPending(null)}
            >
              取消
            </button>
            <button
              className="text-sm px-3 py-1 rounded-md font-medium"
              style={{ backgroundColor: 'var(--accent)', color: 'white', border: 'none' }}
              disabled={!pending.title.trim() || upload.isPending}
              onClick={() => upload.mutate({ file: pending.file, title: pending.title.trim() })}
            >
              確認上傳
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
            處理中
          </h2>
          <div className="space-y-4">
            {tasks.map((t) => (
              <ProcessingCard
                key={t.taskId}
                task={t}
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
            已完成
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
                  進入書籍 <ArrowRight size={12} />
                </Link>
              </div>
            ))}
          </div>
        </div>
      )}
    </div>
  );
}

function ProcessingCard({
  task,
  onDone,
}: {
  task: UploadTask;
  onDone: (taskId: string, bookId: string, fileName: string) => void;
}) {
  const { data: status } = useTaskPolling(task.taskId);

  if (status?.status === 'done' && status.result?.bookId) {
    // Move to completed on next render cycle
    setTimeout(() => onDone(task.taskId, status.result!.bookId!, task.fileName), 0);
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
