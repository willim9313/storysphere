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

export default function UploadPage() {
  const [tasks, setTasks] = useState<UploadTask[]>([]);
  const [completedTasks, setCompletedTasks] = useState<{ taskId: string; fileName: string; bookId: string }[]>([]);

  const upload = useMutation({
    mutationFn: (file: File) => uploadBook(file),
    onSuccess: (data, file) => {
      setTasks((prev) => [...prev, { taskId: data.taskId, fileName: file.name }]);
    },
  });

  const handleFileSelected = useCallback((file: File) => {
    upload.mutate(file);
  }, [upload]);

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
      <DropZone onFileSelected={handleFileSelected} />

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
