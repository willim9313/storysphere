import { useState, useEffect, useRef } from 'react';
import { Link } from 'react-router-dom';
import { Plus, Loader2 } from 'lucide-react';
import { useTranslation } from 'react-i18next';
import { useQueryClient } from '@tanstack/react-query';
import { useChatContext } from '@/contexts/ChatContext';
import { useBooks } from '@/hooks/useBooks';
import { useTaskPolling } from '@/hooks/useTaskPolling';
import { BookCard } from '@/components/library/BookCard';
import { RecentBookCard } from '@/components/library/RecentBookCard';
import { EmptyLibrary } from '@/components/library/EmptyLibrary';
import { LoadingSpinner } from '@/components/ui/LoadingSpinner';
import { ErrorMessage } from '@/components/ui/ErrorMessage';
import type { BookStatus } from '@/api/types';

interface PendingTask { taskId: string; fileName: string; title?: string }

function readPendingTasks(): PendingTask[] {
  try {
    const raw = sessionStorage.getItem('upload-tasks');
    return raw ? (JSON.parse(raw) as PendingTask[]) : [];
  } catch {
    return [];
  }
}

function removePendingTask(taskId: string) {
  const tasks = readPendingTasks().filter((t) => t.taskId !== taskId);
  if (tasks.length === 0) sessionStorage.removeItem('upload-tasks');
  else sessionStorage.setItem('upload-tasks', JSON.stringify(tasks));
}

function ProcessingBookCard({ task, onSettled }: Readonly<{ task: PendingTask; onSettled: () => void }>) {
  const { t } = useTranslation('library');
  const queryClient = useQueryClient();
  const { data: status, isError } = useTaskPolling(task.taskId);
  const notified = useRef(false);

  useEffect(() => {
    const done = status?.status === 'done' || status?.status === 'error' || isError;
    if (done && !notified.current) {
      notified.current = true;
      removePendingTask(task.taskId);
      queryClient.invalidateQueries({ queryKey: ['books'] });
      onSettled();
    }
  }, [status, isError, task.taskId, queryClient, onSettled]);

  return (
    <div
      className="card flex flex-col gap-2 p-3"
      style={{ border: '1px solid var(--border)', opacity: 0.75 }}
    >
      <div
        className="flex items-center justify-center h-24 rounded-md"
        style={{ backgroundColor: 'var(--bg-secondary)' }}
      >
        <Loader2 size={28} className="animate-spin" style={{ color: 'var(--accent)' }} />
      </div>
      <h3
        className="font-semibold text-xs line-clamp-2"
        style={{ fontFamily: 'var(--font-serif)' }}
      >
        {task.title ?? task.fileName}
      </h3>
      {task.title && (
        <p className="text-xs truncate" style={{ color: 'var(--fg-muted)' }}>
          {task.fileName}
        </p>
      )}
      <span className="text-xs" style={{ color: 'var(--fg-muted)' }}>
        {status?.stage || t('filters.processing')}
        {status?.progress != null ? ` ${status.progress}%` : ''}
      </span>
      <Link
        to={`/upload#${task.taskId}`}
        className="text-xs font-medium mt-auto"
        style={{ color: 'var(--accent)' }}
        onClick={(e) => e.stopPropagation()}
      >
        查看進度 →
      </Link>
    </div>
  );
}

type Filter = 'all' | 'analyzed' | 'ready' | 'processing';

export default function LibraryPage() {
  const { setPageContext } = useChatContext();
  const { data: books, isLoading, error } = useBooks();
  const [filter, setFilter] = useState<Filter>('all');
  const [pendingTasks, setPendingTasks] = useState<PendingTask[]>(readPendingTasks);
  const { t } = useTranslation('library');

  const filters: { key: Filter; label: string }[] = [
    { key: 'all', label: t('filters.all') },
    { key: 'analyzed', label: t('filters.analyzed') },
    { key: 'ready', label: t('filters.ready') },
    { key: 'processing', label: t('filters.processing') },
  ];

  useEffect(() => {
    setPageContext({ page: 'library' });
  }, [setPageContext]);

  if (isLoading) return <LoadingSpinner />;
  if (error) return <ErrorMessage message={error.message} />;
  if (!books?.length && pendingTasks.length === 0) return <EmptyLibrary />;

  const safeBooks = books ?? [];
  const recent = [...safeBooks]
    .filter((b) => b.lastOpenedAt)
    .sort((a, b) => new Date(b.lastOpenedAt!).getTime() - new Date(a.lastOpenedAt!).getTime())
    .slice(0, 3);

  const filtered = filter === 'all'
    ? safeBooks
    : safeBooks.filter((b) => b.status === (filter as BookStatus));

  return (
    <div className="p-6 overflow-y-auto h-full">
      {recent.length > 0 && (
        <>
          <h2
            className="text-lg font-bold mb-4"
            style={{ fontFamily: 'var(--font-serif)', color: 'var(--fg-primary)' }}
          >
            {t('recentlyOpened')}
          </h2>
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4 mb-6">
            {recent.map((book) => (
              <RecentBookCard key={book.id} book={book} />
            ))}
          </div>
          <hr style={{ borderColor: 'var(--border)' }} className="mb-6" />
        </>
      )}

      <div className="flex items-center justify-between mb-4">
        <h2
          className="text-lg font-bold"
          style={{ fontFamily: 'var(--font-serif)', color: 'var(--fg-primary)' }}
        >
          {t('allBooks')}
        </h2>
      </div>

      <div className="flex gap-1.5 mb-4">
        {filters.map(({ key, label }) => (
          <button
            key={key}
            onClick={() => setFilter(key)}
            className="px-3 py-1 text-xs rounded-full font-medium transition-colors"
            style={{
              backgroundColor: filter === key ? 'var(--accent)' : 'var(--bg-secondary)',
              color: filter === key ? 'white' : 'var(--fg-secondary)',
            }}
          >
            {label}
          </button>
        ))}
      </div>

      <div
        className="grid gap-4"
        style={{ gridTemplateColumns: 'repeat(auto-fill, minmax(180px, 1fr))' }}
      >
        {(filter === 'all' || filter === 'processing') && pendingTasks.map((task) => (
          <ProcessingBookCard
            key={task.taskId}
            task={task}
            onSettled={() => setPendingTasks((prev) => prev.filter((t) => t.taskId !== task.taskId))}
          />
        ))}
        {filtered.map((book) => (
          <BookCard key={book.id} book={book} />
        ))}
        <Link
          to="/upload"
          className="flex flex-col items-center justify-center gap-2 rounded-lg p-6 transition-colors"
          style={{
            border: '2px dashed var(--border)',
            color: 'var(--fg-muted)',
            minHeight: 180,
          }}
        >
          <Plus size={24} />
          <span className="text-xs font-medium">{t('uploadNew')}</span>
        </Link>
      </div>
    </div>
  );
}
