import { Link } from 'react-router-dom';
import type { Book } from '@/api/types';

interface RecentBookCardProps {
  book: Book;
}

function statusShortcuts(book: Book) {
  const base = `/books/${book.id}`;
  switch (book.status) {
    case 'analyzed':
      return [
        { label: '繼續閱讀', to: base },
        { label: '知識圖譜', to: `${base}/graph` },
        { label: '深度分析', to: `${base}/analysis` },
      ];
    case 'ready':
      return [
        { label: '開始閱讀', to: base },
        { label: '觸發分析', to: base },
      ];
    case 'processing':
      return [{ label: '查看處理進度', to: '/upload' }];
    case 'error':
      return [{ label: '查看錯誤', to: '/upload' }];
  }
}

export function RecentBookCard({ book }: RecentBookCardProps) {
  const shortcuts = statusShortcuts(book);

  return (
    <div
      className="card relative overflow-hidden"
      style={{ borderTop: '3px solid var(--accent)' }}
    >
      <h3
        className="text-sm font-semibold mb-1 truncate"
        style={{ fontFamily: 'var(--font-serif)', color: 'var(--fg-primary)' }}
      >
        {book.title}
      </h3>
      {book.author && (
        <p className="text-xs mb-3" style={{ color: 'var(--fg-muted)' }}>
          {book.author}
        </p>
      )}
      <div className="flex flex-wrap gap-1.5">
        {shortcuts.map(({ label, to }) => (
          <Link
            key={label}
            to={to}
            className="text-xs px-2 py-1 rounded-md transition-colors"
            style={{
              backgroundColor: 'var(--bg-secondary)',
              color: 'var(--accent)',
            }}
          >
            {label}
          </Link>
        ))}
      </div>
    </div>
  );
}
