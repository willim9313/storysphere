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

export function BookCard({ book }: Readonly<{ book: Book }>) {
  const isProcessing = book.status === 'processing';
  const [confirmDelete, setConfirmDelete] = useState(false);
  const { mutate: deleteBook, isPending: isDeleting } = useDeleteBook();
  const { t } = useTranslation('library');
  const { t: tc } = useTranslation('common');

  const failedSteps = book.pipelineStatus
    ? (Object.entries(book.pipelineStatus) as [keyof PipelineStatus, string][])
        .filter(([, v]) => v === 'failed')
        .map(([k]) => STEP_LABELS[k])
    : [];

  const handleDelete = (e: React.MouseEvent) => {
    e.preventDefault();
    e.stopPropagation();
    if (confirmDelete) {
      deleteBook(book.id);
    } else {
      setConfirmDelete(true);
    }
  };

  const handleCancelDelete = (e: React.MouseEvent) => {
    e.preventDefault();
    e.stopPropagation();
    setConfirmDelete(false);
  };

  return (
    <div className="relative group">
      <Link
        to={isProcessing ? '/upload' : `/books/${book.id}`}
        className="card flex flex-col gap-2 hover:shadow-md transition-shadow p-3 block"
      >
        <div
          className="flex items-center justify-center h-24 rounded-md"
          style={{ backgroundColor: 'var(--bg-secondary)' }}
        >
          <FileText size={28} style={{ color: 'var(--accent)' }} />
        </div>
        <div className="flex-1">
          <h3
            className="font-semibold text-xs line-clamp-2 mb-1"
            style={{ fontFamily: 'var(--font-serif)' }}
          >
            {book.title}
          </h3>
          {book.author && (
            <p className="text-xs truncate mb-1" style={{ color: 'var(--fg-muted)' }}>
              {book.author}
            </p>
          )}
          <div className="flex items-center gap-2 mb-1">
            <StatusBadge status={book.status} />
          </div>
          {failedSteps.length > 0 && (
            <div className="flex items-center gap-1 mb-1">
              <AlertTriangle size={11} style={{ color: 'var(--color-warning, #d97706)', flexShrink: 0 }} />
              <span className="text-xs truncate" style={{ color: 'var(--color-warning, #d97706)' }}>
                {failedSteps.join('、')} 不可用
              </span>
            </div>
          )}
          <div className="flex gap-3 text-xs" style={{ color: 'var(--fg-muted)' }}>
            <span>{book.chapterCount} {t('card.chapters')}</span>
            {book.entityCount != null && <span>{book.entityCount} {t('card.entities')}</span>}
          </div>
          {book.lastOpenedAt && (
            <p className="text-xs mt-1" style={{ color: 'var(--fg-muted)' }}>
              {new Date(book.lastOpenedAt).toLocaleDateString()}
            </p>
          )}
        </div>
      </Link>

      {/* Delete button — shown on hover */}
      <div className="absolute top-2 right-2 opacity-0 group-hover:opacity-100 transition-opacity">
        {confirmDelete ? (
          <div className="flex gap-1 items-center">
            <button
              className="text-xs px-2 py-0.5 rounded"
              style={{ backgroundColor: 'var(--color-error)', color: 'white', border: 'none' }}
              disabled={isDeleting}
              onClick={handleDelete}
            >
              {tc('confirm')}
            </button>
            <button
              className="text-xs px-2 py-0.5 rounded"
              style={{ border: '1px solid var(--border)', backgroundColor: 'white' }}
              onClick={handleCancelDelete}
            >
              {tc('cancel')}
            </button>
          </div>
        ) : (
          <button
            className="p-1 rounded"
            style={{ backgroundColor: 'white', border: '1px solid var(--border)' }}
            title={t('card.deleteBook')}
            onClick={handleDelete}
          >
            <Trash2 size={13} style={{ color: 'var(--fg-muted)' }} />
          </button>
        )}
      </div>
    </div>
  );
}
