import { ChevronLeft, ChevronRight, FileText } from 'lucide-react';
import { useTranslation } from 'react-i18next';
import { StatusBadge } from '@/components/library/StatusBadge';
import { KeywordTags } from './KeywordTags';
import { PipelineRerunPanel } from './PipelineRerunPanel';
import type { BookDetail, EntityType } from '@/api/types';

const entityTypeCls: Record<EntityType, string> = {
  character: 'pill-char',
  location: 'pill-loc',
  organization: 'pill-org',
  object: 'pill-obj',
  concept: 'pill-con',
  other: 'pill-other',
  event: 'pill-evt',
};

interface BookOverviewProps {
  book: BookDetail;
  /** Column-1 collapsed state — renders the 46px rail instead of full content. */
  collapsed: boolean;
  onToggleCollapse: () => void;
}

export function BookOverview({ book, collapsed, onToggleCollapse }: Readonly<BookOverviewProps>) {
  const { t } = useTranslation('reader');
  const { t: tg } = useTranslation('graph');

  if (collapsed) {
    return (
      <button
        onClick={onToggleCollapse}
        aria-label={t('col1Expand')}
        className="flex flex-col items-center w-full"
        style={{
          background: 'none',
          border: 'none',
          cursor: 'pointer',
          paddingTop: 12,
          gap: 16,
        }}
      >
        <ChevronRight size={16} style={{ color: 'var(--fg-muted)' }} />
        <FileText size={20} style={{ color: 'var(--accent)' }} />
        <span
          style={{
            writingMode: 'vertical-rl',
            fontFamily: 'var(--font-sans)',
            fontSize: 'var(--font-size-2xs)',
            color: 'var(--fg-muted)',
            letterSpacing: '2px',
          }}
        >
          {t('bookInfo')}
        </span>
      </button>
    );
  }

  const stats = [
    { key: 'chapters', value: book.chapterCount },
    { key: 'chunks', value: book.chunkCount },
    { key: 'entities', value: book.entityCount },
    { key: 'relations', value: book.relationCount },
    { key: 'events', value: book.eventCount },
  ];

  return (
    <div className="p-3 space-y-4">
      {/* Header */}
      <div className="flex items-center justify-between">
        <span className="text-xs font-medium" style={{ color: 'var(--fg-secondary)' }}>
          {t('bookInfo')}
        </span>
        <button
          onClick={onToggleCollapse}
          aria-label={t('col1Collapse')}
          style={{
            background: 'none',
            border: 'none',
            cursor: 'pointer',
            color: 'var(--fg-muted)',
            padding: 2,
            display: 'flex',
          }}
        >
          <ChevronLeft size={16} />
        </button>
      </div>

      {/* Cover placeholder */}
      <div
        className="flex items-center justify-center rounded-md"
        style={{ height: 76, backgroundColor: 'var(--bg-tertiary)' }}
      >
        <FileText size={26} style={{ color: 'var(--accent)' }} />
      </div>

      {/* Title / author / status */}
      <div>
        <h2
          style={{
            fontFamily: 'var(--font-serif)',
            fontSize: 'var(--font-size-lg)',
            fontWeight: 700,
            lineHeight: 1.35,
            color: 'var(--fg-primary)',
          }}
        >
          {book.title}
        </h2>
        {book.author && (
          <p className="text-xs mt-0.5" style={{ color: 'var(--fg-muted)' }}>
            {book.author}
          </p>
        )}
        <div className="mt-1">
          <StatusBadge status={book.status} />
        </div>
      </div>

      {/* Summary */}
      {book.summary && (
        <p
          style={{
            fontFamily: 'var(--font-serif)',
            fontSize: 'var(--font-size-sm)',
            lineHeight: 1.7,
            color: 'var(--fg-secondary)',
          }}
        >
          {book.summary}
        </p>
      )}

      {/* Stats grid */}
      <div className="grid grid-cols-2 gap-2 text-center">
        {stats.map(({ key, value }) => (
          <div
            key={key}
            className="rounded-md py-1.5 px-2"
            style={{
              backgroundColor: 'var(--bg-secondary)',
              ...(key === 'events' ? { gridColumn: '1 / -1' } : {}),
            }}
          >
            <div className="text-sm font-semibold" style={{ color: 'var(--fg-primary)' }}>
              {value}
            </div>
            <div className="text-xs" style={{ color: 'var(--fg-muted)' }}>
              {t(`stats.${key}`)}
            </div>
          </div>
        ))}
      </div>

      {/* Pipeline rerun */}
      {book.pipelineStatus && (
        <PipelineRerunPanel bookId={book.id} pipelineStatus={book.pipelineStatus} />
      )}

      {/* Book keywords */}
      {book.keywords && Object.keys(book.keywords).length > 0 && (
        <div>
          <h3 className="text-xs font-medium mb-2" style={{ color: 'var(--fg-secondary)' }}>
            {t('bookKeywords')}
          </h3>
          <KeywordTags keywords={book.keywords} limit={12} />
        </div>
      )}

      {/* Entity distribution */}
      <div>
        <h3 className="text-xs font-medium mb-2" style={{ color: 'var(--fg-secondary)' }}>
          {t('entityDistribution')}
        </h3>
        <div className="flex flex-wrap gap-1.5">
          {(Object.entries(book.entityStats) as [EntityType, number][]).map(
            ([type, count]) => {
              const cls = entityTypeCls[type];
              return (
                <span key={type} className={`pill ${cls}`}>
                  <span className="pill-dot" />
                  {tg(`entityTypes.${type}`)} {count}
                </span>
              );
            },
          )}
        </div>
      </div>
    </div>
  );
}
