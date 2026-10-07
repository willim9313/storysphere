import { ChevronLeft, ChevronRight, FileText } from 'lucide-react';
import { useTranslation } from 'react-i18next';
import { Tooltip } from '@/components/ui/Tooltip';
import { StatusBadge } from '@/components/library/StatusBadge';
import { KeywordTags } from './KeywordTags';
import { PipelineRerunPanel } from './PipelineRerunPanel';
import { entityDistributionRows } from './readerModel';
import type { BookDetail, EntityType } from '@/api/types';

const entityTypeCls: Record<EntityType, string> = {
  character: 'ss-pill-character',
  location: 'ss-pill-location',
  organization: 'ss-pill-organization',
  object: 'ss-pill-object',
  concept: 'ss-pill-concept',
  other: 'ss-pill-other',
  event: 'ss-pill-event',
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
      <button onClick={onToggleCollapse} aria-label={t('col1Expand')} className="rd-rail-btn">
        <ChevronRight size={12} />
        <span className="rd-rail-label">{t('bookInfo')}</span>
      </button>
    );
  }

  // 事件數量由統計格承擔（實體分佈 6 型不含事件），所以第 5 格保留，整列寬。
  const stats = [
    { key: 'chapters', value: book.chapterCount },
    { key: 'chunks', value: book.chunkCount },
    { key: 'entities', value: book.entityCount },
    { key: 'relations', value: book.relationCount },
    { key: 'events', value: book.eventCount },
  ];

  return (
    <div className="rd-book">
      <div className="rd-cover">
        <FileText size={26} />
      </div>

      <div className="rd-book-head">
        <div className="rd-book-titles">
          <h2 className="rd-book-title">{book.title}</h2>
          {/* 作者是下一期功能：版位保留，沒有作者時也佔一行。 */}
          <span className="rd-book-author">{book.author}</span>
        </div>
        <Tooltip label={t('col1Collapse')}>
          <button onClick={onToggleCollapse} aria-label={t('col1Collapse')} className="rd-icon-btn">
            <ChevronLeft size={16} />
          </button>
        </Tooltip>
      </div>

      <StatusBadge status={book.status} />

      {book.summary && <p className="rd-book-summary">{book.summary}</p>}

      <div className="rd-stats">
        {stats.map(({ key, value }) => (
          <div key={key} className={key === 'events' ? 'rd-stat rd-stat-wide' : 'rd-stat'}>
            <span className="rd-stat-value">{value}</span>
            <span className="rd-stat-label">{t(`stats.${key}`)}</span>
          </div>
        ))}
      </div>

      {/* Pipeline rerun */}
      {book.pipelineStatus && (
        <PipelineRerunPanel bookId={book.id} pipelineStatus={book.pipelineStatus} />
      )}

      {/* Book keywords */}
      {book.keywords && Object.keys(book.keywords).length > 0 && (
        <div className="rd-section">
          <h3 className="rd-label">
            {t('bookKeywords')} <span className="rd-label-hint">{t('bookKeywordsHint')}</span>
          </h3>
          <KeywordTags keywords={book.keywords} limit={12} />
        </div>
      )}

      {/* Entity distribution */}
      <div className="rd-section">
        <h3 className="rd-label">
          {t('entityDistribution')} <span className="rd-label-hint">{t('entityDistributionHint')}</span>
        </h3>
        <div className="rd-chips">
          {entityDistributionRows(book.entityStats).map(({ type, count }) => (
            <span key={type} className={`ss-pill ${entityTypeCls[type]}`}>
              <span className="ss-pill-dot" />
              {tg(`entityTypes.${type}`)}
              <span className="rd-pill-count">{count}</span>
            </span>
          ))}
        </div>
      </div>
    </div>
  );
}
