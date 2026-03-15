import { Link } from 'react-router-dom';
import { FileText } from 'lucide-react';
import type { Book } from '@/api/types';
import { StatusBadge } from './StatusBadge';

export function BookCard({ book }: { book: Book }) {
  const isProcessing = book.status === 'processing';

  return (
    <Link
      to={isProcessing ? '/upload' : `/books/${book.id}`}
      className="card flex flex-col gap-2 hover:shadow-md transition-shadow p-3"
    >
      <div
        className="flex items-center justify-center h-24 rounded-md"
        style={{ backgroundColor: 'var(--bg-secondary)' }}
      >
        <FileText size={28} style={{ color: 'var(--accent)' }} />
      </div>
      <div className="flex-1">
        <h3
          className="font-semibold text-xs line-clamp-2 mb-1"
          style={{ fontFamily: 'var(--font-serif)' }}
        >
          {book.title}
        </h3>
        {book.author && (
          <p className="text-xs truncate mb-1" style={{ color: 'var(--fg-muted)' }}>
            {book.author}
          </p>
        )}
        <div className="flex items-center gap-2 mb-1">
          <StatusBadge status={book.status} />
        </div>
        <div className="flex gap-3 text-xs" style={{ color: 'var(--fg-muted)' }}>
          <span>{book.chapterCount} 章</span>
          {book.entityCount != null && <span>{book.entityCount} 實體</span>}
        </div>
        {book.lastOpenedAt && (
          <p className="text-xs mt-1" style={{ color: 'var(--fg-muted)' }}>
            {new Date(book.lastOpenedAt).toLocaleDateString('zh-TW')}
          </p>
        )}
      </div>
    </Link>
  );
}
