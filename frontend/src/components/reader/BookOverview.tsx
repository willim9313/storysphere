import { FileText } from 'lucide-react';
import { StatusBadge } from '@/components/library/StatusBadge';
import { KeywordTags } from './KeywordTags';
import type { BookDetail, EntityType } from '@/api/types';

const entityTypeLabels: Record<EntityType, { label: string; cls: string }> = {
  character: { label: '角色', cls: 'pill-char' },
  location: { label: '地點', cls: 'pill-loc' },
  organization: { label: '組織', cls: 'pill-org' },
  object: { label: '物品', cls: 'pill-obj' },
  concept: { label: '概念', cls: 'pill-con' },
  other: { label: '其他', cls: 'pill-other' },
  event: { label: '事件', cls: 'pill-evt' },
};

export function BookOverview({ book }: { book: BookDetail }) {
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
      <div
        className="grid grid-cols-2 gap-2 text-center"
      >
        {[
          { label: '章節', value: book.chapterCount },
          { label: 'Chunks', value: book.chunkCount },
          { label: '實體', value: book.entityCount },
          { label: '關係', value: book.relationCount },
        ].map(({ label, value }) => (
          <div
            key={label}
            className="rounded-md py-1.5 px-2"
            style={{ backgroundColor: 'var(--bg-secondary)' }}
          >
            <div className="text-sm font-semibold" style={{ color: 'var(--fg-primary)' }}>
              {value}
            </div>
            <div className="text-xs" style={{ color: 'var(--fg-muted)' }}>
              {label}
            </div>
          </div>
        ))}
      </div>

      {/* Book keywords */}
      {book.keywords && Object.keys(book.keywords).length > 0 && (
        <div>
          <h3 className="text-xs font-medium mb-2" style={{ color: 'var(--fg-secondary)' }}>
            全書關鍵字
          </h3>
          <KeywordTags keywords={book.keywords} limit={12} />
        </div>
      )}

      {/* Entity distribution */}
      <div>
        <h3 className="text-xs font-medium mb-2" style={{ color: 'var(--fg-secondary)' }}>
          實體分佈
        </h3>
        <div className="flex flex-wrap gap-1.5">
          {(Object.entries(book.entityStats) as [EntityType, number][]).map(
            ([type, count]) => {
              const { label, cls } = entityTypeLabels[type];
              return (
                <span key={type} className={`pill ${cls}`}>
                  <span className="pill-dot" />
                  {label} {count}
                </span>
              );
            },
          )}
        </div>
      </div>
    </div>
  );
}
