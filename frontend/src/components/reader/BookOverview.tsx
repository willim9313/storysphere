import { FileText } from 'lucide-react';
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

export function BookOverview({ book }: { book: BookDetail }) {
  const { t } = useTranslation('reader');
  const { t: tg } = useTranslation('graph');

  const stats = [
    { key: 'chapters', value: book.chapterCount },
    { key: 'chunks', value: book.chunkCount },
    { key: 'entities', value: book.entityCount },
    { key: 'relations', value: book.relationCount },
  ];

  return (
    <div className="p-3 space-y-4">
      {/* Cover placeholder */}
      <div
        className="flex items-center justify-center h-28 rounded-md"
        style={{ backgroundColor: 'var(--bg-secondary)' }}
      >
        <FileText size={32} style={{ color: 'var(--accent)' }} />
      </div>

      {/* Title */}
      <div>
        <h2
          className="text-sm font-bold"
          style={{ fontFamily: 'var(--font-serif)', color: 'var(--fg-primary)' }}
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
        <p className="text-xs leading-relaxed" style={{ color: 'var(--fg-secondary)' }}>
          {book.summary}
        </p>
      )}

      {/* Stats grid */}
      <div className="grid grid-cols-2 gap-2 text-center">
        {stats.map(({ key, value }) => (
          <div
            key={key}
            className="rounded-md py-1.5 px-2"
            style={{ backgroundColor: 'var(--bg-secondary)' }}
          >
            <div className="text-sm font-semibold" style={{ color: 'var(--fg-primary)' }}>
              {value}
            </div>
            <div className="text-xs" style={{ color: 'var(--fg-muted)' }}>
              {key === 'chunks' ? 'Chunks' : t(`stats.${key}`)}
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
