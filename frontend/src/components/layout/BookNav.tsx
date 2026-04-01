import { Link, useLocation } from 'react-router-dom';
import { ArrowLeft } from 'lucide-react';

interface BookNavProps {
  bookId: string;
  bookTitle: string;
}

const tabs = [
  { label: '閱讀', path: '' },
  { label: '深度分析', path: '/analysis' },
  { label: '知識圖譜', path: '/graph' },
  { label: '時間軸', path: '/timeline' },
  { label: '張力分析', path: '/tension' },
];

export function BookNav({ bookId, bookTitle }: BookNavProps) {
  const location = useLocation();
  const base = `/books/${bookId}`;

  return (
    <div
      className="flex items-center gap-4 px-4 h-10 flex-shrink-0"
      style={{
        borderBottom: '1px solid var(--border)',
        backgroundColor: 'white',
      }}
    >
      <Link
        to="/"
        className="flex items-center gap-1 text-xs"
        style={{ color: 'var(--fg-muted)' }}
      >
        <ArrowLeft size={14} />
        書庫
      </Link>

      <span
        className="text-sm font-medium truncate"
        style={{ color: 'var(--fg-primary)', maxWidth: 200 }}
      >
        {bookTitle}
      </span>

      <div className="flex gap-0.5 ml-4">
        {tabs.map(({ label, path }) => {
          const fullPath = `${base}${path}`;
          const active = path === ''
            ? location.pathname === base
            : location.pathname === fullPath;

          return (
            <Link
              key={path}
              to={fullPath}
              className="px-3 py-1.5 text-xs font-medium rounded-md transition-colors"
              style={{
                backgroundColor: active ? 'var(--bg-tertiary)' : 'transparent',
                color: active ? 'var(--accent)' : 'var(--fg-secondary)',
              }}
            >
              {label}
            </Link>
          );
        })}
      </div>
    </div>
  );
}
