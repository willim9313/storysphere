import { useCallback, useRef, useState } from 'react';
import { Link } from 'react-router-dom';
import { FileText, Trash2, AlertTriangle } from 'lucide-react';
import { useTranslation } from 'react-i18next';
import type { Book, PipelineStatus } from '@/api/types';
import { StatusBadge } from './StatusBadge';
import { useDeleteBook } from '@/hooks/useDeleteBook';
import { useDismissOverlay } from '@/hooks/useDismissOverlay';

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
  const { mutate: deleteBook, isPending: isDeleting, isError: deleteFailed, reset } = useDeleteBook();
  const cardRef = useRef<HTMLDivElement>(null);
  const trashRef = useRef<HTMLButtonElement>(null);
  const { t } = useTranslation('library');
  const { t: tc } = useTranslation('common');

  const failedSteps = book.pipelineStatus
    ? (Object.entries(book.pipelineStatus) as [keyof PipelineStatus, string][])
        .filter(([, v]) => v === 'failed')
        .map(([k]) => STEP_LABELS[k])
    : [];

  const cancelDelete = useCallback(() => {
    setConfirmDelete(false);
    reset();
  }, [reset]);
  // Esc / a click outside the card backs out of the confirm state; Esc also
  // hands focus back to the trash button.
  useDismissOverlay(confirmDelete, cancelDelete, cardRef, trashRef);

  function confirm() {
    // The card unmounts once the list refetches; move focus to the next card
    // (or the upload card, which is always last) so keyboard users keep their place.
    const next = cardRef.current?.nextElementSibling;
    const target = next?.matches('a') ? next : next?.querySelector('.lib-card-link');
    deleteBook(book.id, { onSuccess: () => (target as HTMLElement | null | undefined)?.focus() });
  }

  let confirmText = t('card.deleteConfirm');
  if (deleteFailed) confirmText = t('card.deleteFailed');
  else if (book.status === 'analyzed') confirmText = t('card.deleteConfirmAnalyzed');

  return (
    <div ref={cardRef} className={`ss-bookcard lib-card${confirmDelete ? ' lib-card-confirming' : ''}`}>
      <div className="ss-bookcard-cover lib-cover">
        <FileText size={28} />
      </div>
      <Link to={`/books/${book.id}`} className="ss-bookcard-title lib-card-link">
        {book.title}
      </Link>

      {/* Two-step delete: the trash only enters the confirm state; nothing is
          removed until 確認. Not a modal, no undo toast (§6). */}
      <button
        ref={trashRef}
        type="button"
        className="lib-card-trash"
        aria-label={t('card.deleteBook', { title: book.title })}
        onClick={() => setConfirmDelete(true)}
      >
        <Trash2 size={14} />
      </button>

      {confirmDelete ? (
        <div className="lib-card-confirm">
          <span className="lib-card-confirm-text" role="status">
            {confirmText}
          </span>
          <span className="lib-card-confirm-actions">
            <button
              type="button"
              className="ss-btn ss-btn-sm ss-btn-danger"
              disabled={isDeleting}
              onClick={confirm}
            >
              {tc('confirm')}
            </button>
            <button
              type="button"
              className="ss-btn ss-btn-sm ss-btn-ghost"
              onClick={() => {
                cancelDelete();
                trashRef.current?.focus();
              }}
            >
              {tc('cancel')}
            </button>
          </span>
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
              {/* Entities come from the KG step; until it has run, 0 would read
                  as "this book has no characters". */}
              {book.pipelineStatus?.knowledgeGraph === 'done' ? (book.entityCount ?? '—') : '—'} {t('card.entities')}
            </span>
          </div>
        </>
      )}
    </div>
  );
}
