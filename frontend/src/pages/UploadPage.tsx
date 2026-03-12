import { useState, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import { useMutation } from '@tanstack/react-query';
import { uploadDocument, fetchIngestStatus } from '@/api/ingest';
import { useTaskPolling } from '@/hooks/useTaskPolling';
import { DropZone } from '@/components/upload/DropZone';
import { TaskProgressBar } from '@/components/upload/TaskProgressBar';

export default function UploadPage() {
  const navigate = useNavigate();
  const [file, setFile] = useState<File | null>(null);
  const [title, setTitle] = useState('');
  const [taskId, setTaskId] = useState<string | null>(null);

  const upload = useMutation({
    mutationFn: () => uploadDocument(file!, title || file!.name.replace(/\.[^.]+$/, '')),
    onSuccess: (data) => setTaskId(data.task_id),
  });

  const polling = useTaskPolling({
    queryKey: ['ingest'],
    taskId,
    pollFn: fetchIngestStatus,
  });

  // Navigate on completion
  useEffect(() => {
    if (polling.data?.status === 'completed' && polling.data.result) {
      const result = polling.data.result as Record<string, unknown>;
      const docId = result.document_id as string | undefined;
      if (docId) {
        navigate(`/books/${docId}`);
      }
    }
  }, [polling.data, navigate]);

  const handleFileSelected = (f: File) => {
    setFile(f);
    if (!title) setTitle(f.name.replace(/\.[^.]+$/, ''));
  };

  const isProcessing = !!taskId && polling.data?.status !== 'completed' && polling.data?.status !== 'failed';

  return (
    <div className="max-w-xl mx-auto">
      <h1 className="text-2xl font-bold mb-6" style={{ fontFamily: 'var(--font-serif)' }}>
        Upload a Book
      </h1>

      <DropZone onFileSelected={handleFileSelected} />

      {file && (
        <div className="mt-6 space-y-4">
          <div>
            <label className="block text-sm font-medium mb-1" style={{ color: 'var(--color-text-secondary)' }}>
              Title
            </label>
            <input
              type="text"
              value={title}
              onChange={(e) => setTitle(e.target.value)}
              className="w-full px-3 py-2 rounded-md text-sm"
              style={{
                backgroundColor: 'var(--color-bg-secondary)',
                color: 'var(--color-text)',
                border: '1px solid var(--color-border)',
              }}
            />
          </div>
          <div className="flex items-center gap-3">
            <span className="text-sm" style={{ color: 'var(--color-text-muted)' }}>
              {file.name} ({(file.size / 1024 / 1024).toFixed(1)} MB)
            </span>
          </div>
          <button
            className="btn btn-primary w-full justify-center"
            onClick={() => upload.mutate()}
            disabled={upload.isPending || isProcessing}
          >
            {upload.isPending ? 'Uploading...' : isProcessing ? 'Processing...' : 'Start Ingestion'}
          </button>

          {upload.error && (
            <p className="text-sm" style={{ color: 'var(--color-error)' }}>
              {upload.error.message}
            </p>
          )}

          <TaskProgressBar
            status={polling.data?.status ?? (upload.isPending ? 'running' : null)}
            error={polling.data?.error}
          />
        </div>
      )}
    </div>
  );
}
