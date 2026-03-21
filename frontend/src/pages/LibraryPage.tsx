import { useState, useEffect } from 'react';
import { Link } from 'react-router-dom';
import { Plus } from 'lucide-react';
import { useChatContext } from '@/contexts/ChatContext';
import { useBooks } from '@/hooks/useBooks';
import { BookCard } from '@/components/library/BookCard';
import { RecentBookCard } from '@/components/library/RecentBookCard';
import { EmptyLibrary } from '@/components/library/EmptyLibrary';
import { LoadingSpinner } from '@/components/ui/LoadingSpinner';
import { ErrorMessage } from '@/components/ui/ErrorMessage';
import type { BookStatus } from '@/api/types';

type Filter = 'all' | 'analyzed' | 'ready' | 'processing';

const filters: { key: Filter; label: string }[] = [
  { key: 'all', label: '全部' },
  { key: 'analyzed', label: '已分析' },
  { key: 'ready', label: '已就緒' },
  { key: 'processing', label: '處理中' },
];

export default function LibraryPage() {
  const { setPageContext } = useChatContext();
  const { data: books, isLoading, error } = useBooks();
  const [filter, setFilter] = useState<Filter>('all');

  useEffect(() => {
    setPageContext({ page: 'library', bookId: undefined, bookTitle: undefined, chapterId: undefined, chapterTitle: undefined, selectedEntity: undefined });
  }, [setPageContext]);

  if (isLoading) return <LoadingSpinner />;
  if (error) return <ErrorMessage message={error.message} />;
  if (!books?.length) return <EmptyLibrary />;

  const recent = [...books]
    .filter((b) => b.lastOpenedAt)
    .sort((a, b) => new Date(b.lastOpenedAt!).getTime() - new Date(a.lastOpenedAt!).getTime())
    .slice(0, 3);

  const filtered = filter === 'all'
    ? books
    : books.filter((b) => b.status === (filter as BookStatus));

  return (
    <div className="p-6 overflow-y-auto h-full">
      {recent.length > 0 && (
        <>
          <h2
            className="text-lg font-bold mb-4"
            style={{ fontFamily: 'var(--font-serif)', color: 'var(--fg-primary)' }}
          >
            最近開啟
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
          書庫
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
          <span className="text-xs font-medium">上傳新書</span>
        </Link>
      </div>
    </div>
  );
}
