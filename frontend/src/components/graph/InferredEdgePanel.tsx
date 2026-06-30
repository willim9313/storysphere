import { useEffect, useRef } from 'react';
import { X, Check, Loader, XOctagon, RefreshCw, RotateCcw } from 'lucide-react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { useTranslation } from 'react-i18next';
import {
  fetchInferredRelations,
  confirmInferred,
  rejectInferred,
  runInference,
} from '@/api/graph';
import type { InferredRelation } from '@/api/graph';

interface InferredReviewPanelProps {
  bookId: string;
  focusInferredId?: string | null;
  onClose: () => void;
}

export function InferredEdgePanel({ bookId, focusInferredId, onClose }: InferredReviewPanelProps) {
  const { t } = useTranslation('graph');
  const queryClient = useQueryClient();

  const { data, isLoading } = useQuery({
    queryKey: ['books', bookId, 'inferred-relations'],
    queryFn: () => fetchInferredRelations(bookId, 'pending'),
  });

  const items = data?.items ?? [];

  const invalidateAll = () => {
    queryClient.invalidateQueries({ queryKey: ['books', bookId, 'inferred-relations'] });
    queryClient.invalidateQueries({ queryKey: ['books', bookId, 'graph'] });
  };

  // Safe rerun: score only new entity pairs; existing PENDING/CONFIRMED/REJECTED untouched.
  const rerunSafe = useMutation({
    mutationFn: () => runInference(bookId),
    onSuccess: invalidateAll,
  });

  // Destructive rerun: bypasses skip list. Upsert resets every record's
  // status to PENDING, wiping prior adopt/reject decisions. Requires user
  // confirmation before invoking.
  const rerunForce = useMutation({
    mutationFn: () => runInference(bookId, true),
    onSuccess: invalidateAll,
  });

  const handleForceRerun = () => {
    const ok = globalThis.confirm(t('v1.inferred.review.rerunForceConfirm'));
    if (ok) rerunForce.mutate();
  };

  const rerunning = rerunSafe.isPending || rerunForce.isPending;

  return (
    <div
      className="absolute top-0 right-0 h-full z-20 flex flex-col"
      style={{
        width: 380,
        backgroundColor: 'var(--bg-primary)',
        borderLeft: '1px solid var(--border)',
        boxShadow: 'var(--shadow-md)',
      }}
    >
      <header
        className="flex items-center justify-between p-3 flex-shrink-0"
        style={{ borderBottom: '1px solid var(--border)' }}
      >
        <h3
          className="text-sm font-semibold"
          style={{ fontFamily: 'var(--font-serif)', color: 'var(--fg-primary)' }}
        >
          {t('v1.inferred.review.title', { n: items.length })}
        </h3>
        <div className="flex items-center gap-1">
          <button
            onClick={() => rerunSafe.mutate()}
            disabled={rerunning}
            title={t('v1.inferred.review.rerunTitle')}
            aria-label={t('v1.inferred.review.rerunTitle')}
            style={{
              color: 'var(--fg-muted)',
              padding: 4,
              borderRadius: 'var(--radius-sm)',
              opacity: rerunning ? 0.5 : 1,
              cursor: rerunning ? 'not-allowed' : 'pointer',
            }}
          >
            {rerunSafe.isPending ? (
              <Loader size={13} className="animate-spin" />
            ) : (
              <RefreshCw size={13} />
            )}
          </button>
          <button
            onClick={handleForceRerun}
            disabled={rerunning}
            title={t('v1.inferred.review.rerunForceTitle')}
            aria-label={t('v1.inferred.review.rerunForceTitle')}
            style={{
              color: 'var(--color-warning)',
              padding: 4,
              borderRadius: 'var(--radius-sm)',
              opacity: rerunning ? 0.5 : 1,
              cursor: rerunning ? 'not-allowed' : 'pointer',
            }}
          >
            {rerunForce.isPending ? (
              <Loader size={13} className="animate-spin" />
            ) : (
              <RotateCcw size={13} />
            )}
          </button>
          <button
            onClick={onClose}
            style={{ color: 'var(--fg-muted)', marginLeft: 4 }}
          >
            <X size={16} />
          </button>
        </div>
      </header>

      <div className="flex-1 overflow-y-auto p-3 space-y-3">
        {isLoading && (
          <div className="flex items-center gap-2 py-4 justify-center">
            <Loader size={14} className="animate-spin" style={{ color: 'var(--fg-muted)' }} />
            <span className="text-xs" style={{ color: 'var(--fg-muted)' }}>
              {t('analysisPanel.loading')}
            </span>
          </div>
        )}
        {!isLoading && items.length === 0 && (
          <p className="text-xs py-4 text-center" style={{ color: 'var(--fg-muted)' }}>
            {t('v1.inferred.review.empty', '尚無待審查推斷關係')}
          </p>
        )}
        {items.map((ir) => (
          <InferredRow
            key={ir.id}
            ir={ir}
            bookId={bookId}
            focus={focusInferredId === ir.id}
            onSuccess={() =>
              queryClient.invalidateQueries({
                queryKey: ['books', bookId, 'inferred-relations'],
              })
            }
            onGraphInvalidate={() =>
              queryClient.invalidateQueries({ queryKey: ['books', bookId, 'graph'] })
            }
          />
        ))}
      </div>
    </div>
  );
}

interface InferredRowProps {
  ir: InferredRelation;
  bookId: string;
  focus: boolean;
  onSuccess: () => void;
  onGraphInvalidate: () => void;
}

function InferredRow({ ir, bookId, focus, onSuccess, onGraphInvalidate }: InferredRowProps) {
  const { t } = useTranslation('graph');
  const ref = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (focus && ref.current) {
      ref.current.scrollIntoView({ behavior: 'smooth', block: 'center' });
    }
  }, [focus]);

  const adopt = useMutation({
    // No relationType arg → backend promotes ir.suggestedRelationType to canonical
    mutationFn: () => confirmInferred(bookId, ir.id),
    onSuccess: () => {
      onSuccess();
      onGraphInvalidate();
    },
  });

  const reject = useMutation({
    mutationFn: () => rejectInferred(bookId, ir.id),
    onSuccess: () => {
      onSuccess();
      onGraphInvalidate();
    },
  });

  const busy = adopt.isPending || reject.isPending;
  const confidencePct = Math.round(ir.confidence * 100);

  return (
    <div
      ref={ref}
      className="rounded-md p-3"
      style={{
        border: focus ? '1px solid var(--accent)' : '1px solid var(--border)',
        backgroundColor: 'var(--bg-primary)',
        transition: 'border-color var(--transition-fast, 150ms) ease',
      }}
    >
      <div className="flex items-center gap-1.5 flex-wrap mb-2">
        <Pill>{ir.sourceName}</Pill>
        <span className="text-[11px]" style={{ color: 'var(--fg-muted)' }}>
          {ir.suggestedRelationType}
        </span>
        <Pill>{ir.targetName}</Pill>
      </div>

      <div className="flex items-center gap-2 mb-2">
        <div
          className="flex-1 h-1.5 rounded-full overflow-hidden"
          style={{ backgroundColor: 'var(--bg-tertiary)' }}
        >
          <div
            className="h-full"
            style={{
              width: `${confidencePct}%`,
              backgroundColor: 'var(--accent)',
            }}
          />
        </div>
        <span
          className="text-[11px] tabular-nums font-semibold"
          style={{ color: 'var(--fg-secondary)' }}
        >
          {(ir.confidence ?? 0).toFixed(2)}
        </span>
      </div>

      <details className="mb-2">
        <summary
          className="text-[10px] font-semibold uppercase cursor-pointer"
          style={{ color: 'var(--fg-muted)', letterSpacing: '0.06em' }}
        >
          {t('v1.inferred.review.evidence')}
        </summary>
        <p className="text-[11px] mt-1.5 leading-relaxed" style={{ color: 'var(--fg-secondary)' }}>
          {ir.reasoning ||
            t('v1.inferred.review.evidenceFallback', {
              common: ir.commonNeighborCount,
              score: ir.adamicAdarScore.toFixed(2),
            })}
        </p>
      </details>

      <div className="flex gap-2">
        <button
          onClick={() => adopt.mutate()}
          disabled={busy}
          className="flex-1 flex items-center justify-center gap-1 text-xs py-1.5 rounded-md"
          style={{
            backgroundColor: 'var(--accent)',
            color: 'var(--bg-primary)',
            opacity: busy ? 0.6 : 1,
          }}
        >
          {adopt.isPending ? (
            <Loader size={12} className="animate-spin" />
          ) : (
            <Check size={12} />
          )}
          {t('v1.inferred.review.adopt')}
        </button>
        <button
          onClick={() => reject.mutate()}
          disabled={busy}
          className="flex-1 flex items-center justify-center gap-1 text-xs py-1.5 rounded-md"
          style={{
            backgroundColor: 'var(--bg-secondary)',
            color: 'var(--fg-secondary)',
            border: '1px solid var(--border)',
            opacity: busy ? 0.6 : 1,
          }}
        >
          {reject.isPending ? (
            <Loader size={12} className="animate-spin" />
          ) : (
            <XOctagon size={12} />
          )}
          {t('v1.inferred.review.reject')}
        </button>
      </div>
    </div>
  );
}

function Pill({ children }: { children: React.ReactNode }) {
  return (
    <span
      className="px-2 py-0.5 rounded-full text-[11px] font-medium"
      style={{
        backgroundColor: 'var(--bg-secondary)',
        color: 'var(--fg-primary)',
        border: '1px solid var(--border)',
      }}
    >
      {children}
    </span>
  );
}
