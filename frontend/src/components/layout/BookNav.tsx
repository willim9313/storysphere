import { Link, useLocation } from 'react-router-dom';
import { ArrowLeft } from 'lucide-react';
import { useTranslation } from 'react-i18next';

interface BookNavProps {
  bookId: string;
  bookTitle: string;
}

export function BookNav({ bookId, bookTitle }: BookNavProps) {
  const location = useLocation();
  const { t } = useTranslation('nav');
  const base = `/books/${bookId}`;

  const tabs = [
    { label: t('tabs.read'), path: '' },
    { label: t('tabs.characterAnalysis'), path: '/characters' },
    { label: t('tabs.eventAnalysis'), path: '/events' },
    { label: t('tabs.knowledgeGraph'), path: '/graph' },
    { label: t('tabs.timeline'), path: '/timeline' },
    { label: t('tabs.tensionAnalysis'), path: '/tension' },
    { label: t('tabs.symbolImagery'), path: '/symbols' },
    { label: t('tabs.unraveling'), path: '/unraveling' },
  ];

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
        {t('library')}
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
