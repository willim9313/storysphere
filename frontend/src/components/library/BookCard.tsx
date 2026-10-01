import { useState } from 'react';
import { Link } from 'react-router-dom';
import { FileText, Trash2, AlertTriangle } from 'lucide-react';
import { useTranslation } from 'react-i18next';
import type { Book, PipelineStatus } from '@/api/types';
import { StatusBadge } from './StatusBadge';
import { useDeleteBook } from '@/hooks/useDeleteBook';

const STEP_LABELS: Record<keyof PipelineStatus, string> = {
  summarization: '摘要',
  featureExtraction: '特徵',
  knowledgeGraph: '知識圖譜',
  symbolDiscovery: '符號',
};

/**
 * DS v3 book card. The whole card is one link (stretched over the card by
 * `.lib-card-link::after`) so the delete controls can sit inside it without
 * nesting buttons in an anchor.
 */
export function BookCard({ book }: Readonly<{ book: Book }>) {
  const [confirmDelete, setConfirmDelete] = useState(false);
  const { mutate: deleteBook, isPending: isDeleting } = useDeleteBook();
  const { t } = useTranslation('library');
  const { t: tc } = useTranslation('common');

  const failedSteps = book.pipelineStatus
    ? (Object.entries(book.pipelineStatus) as [keyof PipelineStatus, string][])
        .filter(([, v]) => v === 'failed')
        .map(([k]) => STEP_LABELS[k])
    : [];

  return (
    <div className={`ss-bookcard lib-card${confirmDelete ? ' lib-card-confirming' : ''}`}>
      <div className="ss-bookcard-cover lib-cover">
        <FileText size={28} />
      </div>
      <Link to={`/books/${book.id}`} className="ss-bookcard-title lib-card-link">
        {book.title}
      </Link>

      {/* Two-step delete: the trash only enters the confirm state; nothing is
          removed until 確認. Not a modal, no undo toast (§6). */}
      <button
        type="button"
        className="lib-card-trash"
        aria-label={t('card.deleteBook')}
        onClick={() => setConfirmDelete(true)}
      >
        <Trash2 size={14} />
      </button>

      {confirmDelete ? (
        <div className="lib-card-confirm">
          <span className="lib-card-confirm-text">{t('card.deleteConfirm')}</span>
          <button
            type="button"
            className="ss-btn ss-btn-sm ss-btn-danger"
            disabled={isDeleting}
            onClick={() => deleteBook(book.id)}
          >
            {tc('confirm')}
          </button>
          <button type="button" className="ss-btn ss-btn-sm ss-btn-ghost" onClick={() => setConfirmDelete(false)}>
            {tc('cancel')}
          </button>
        </div>
      ) : (
        <>
          {book.author && <div className="ss-bookcard-author">{book.author}</div>}
          <StatusBadge status={book.status} />
          {/* The library's only analysis-quality signal: sits under the badge,
              ahead of the counts. Copy format unchanged. */}
          {failedSteps.length > 0 && (
            <div className="lib-card-degraded">
              <AlertTriangle size={13} />
              <span>{failedSteps.join('、')} 不可用</span>
            </div>
          )}
          <div className="ss-bookcard-meta">
            <span>
              {book.chapterCount} {t('card.chapters')}
            </span>
            <span>
              {book.entityCount ?? '—'} {t('card.entities')}
            </span>
          </div>
        </>
      )}
    </div>
  );
}
