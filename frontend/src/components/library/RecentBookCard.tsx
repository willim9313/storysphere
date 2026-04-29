import { Link } from 'react-router-dom';
import { useTranslation } from 'react-i18next';
import type { Book } from '@/api/types';

interface RecentBookCardProps {
  book: Book;
}

export function RecentBookCard({ book }: RecentBookCardProps) {
  const { t } = useTranslation('library');
  const base = `/books/${book.id}`;

  function statusShortcuts() {
    switch (book.status) {
      case 'analyzed':
        return [
          { label: t('shortcuts.continueReading'), to: base },
          { label: t('shortcuts.knowledgeGraph'), to: `${base}/graph` },
          { label: t('shortcuts.deepAnalysis'), to: `${base}/characters` },
        ];
      case 'ready':
        return [
          { label: t('shortcuts.startReading'), to: base },
          { label: t('shortcuts.triggerAnalysis'), to: base },
        ];
      case 'processing':
        return [{ label: t('shortcuts.viewProgress'), to: '/upload' }];
      case 'error':
        return [{ label: t('shortcuts.viewError'), to: '/upload' }];
    }
  }

  const shortcuts = statusShortcuts();

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
