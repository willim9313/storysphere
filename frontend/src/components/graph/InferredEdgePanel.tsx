import { useEffect, useRef } from 'react';
import { X, Loader, AlertTriangle } from 'lucide-react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { useTranslation } from 'react-i18next';
import { fetchInferredRelations, confirmInferred, rejectInferred } from '@/api/graph';
import type { InferredRelation } from '@/api/graph';
import { qk } from '@/api/queryKeys';

interface InferredReviewPanelProps {
  bookId: string;
  focusInferredId?: string | null;
  onClose: () => void;
}

// Note: rerun (safe/force) moved to GraphToolbar's inference menu — this
// panel is review-only. Query key carries a 'pending' suffix so it doesn't
// collide with GraphPage's unfiltered 'inferred-relations' query (used for
// the idle/ready state + pending badge count); both share the
// qk.inferred.all(bookId) prefix so either mutation's
// invalidateQueries call refreshes both.
//
// Adopt / reject are zero-cost writes (pure graph theory, no LLM): no cost glyph.
export function InferredEdgePanel({ bookId, focusInferredId, onClose }: InferredReviewPanelProps) {
  const { t } = useTranslation('graph');
  const queryClient = useQueryClient();

  const { data, isLoading } = useQuery({
    queryKey: qk.inferred.pending(bookId),
    queryFn: () => fetchInferredRelations(bookId, 'pending'),
  });

  const items = data?.items ?? [];

  return (
    <div className="kg-panel">
      <div className="kg-panel-head">
        <h3 className="kg-panel-title">{t('v1.inferred.review.title', { n: items.length })}</h3>
        <button type="button" onClick={onClose} className="kg-icon-btn" aria-label="Close">
          <X size={14} />
        </button>
      </div>

      <div className="kg-panel-body">
        {!isLoading && items.length > 0 && (
          <div
            className="kg-text"
            style={{
              display: 'flex',
              alignItems: 'flex-start',
              gap: 'var(--space-4)',
              backgroundColor: 'var(--color-warning-bg)',
              borderRadius: 'var(--radius-sm)',
              padding: 'var(--space-4)',
            }}
          >
            <AlertTriangle
              size={13}
              style={{ color: 'var(--color-warning)', flexShrink: 0, marginTop: 'var(--space-1)' }}
            />
            <span>{t('v1.inferred.review.banner', { n: items.length })}</span>
          </div>
        )}
        {!isLoading && items.length > 0 && <p className="kg-note">{t('v1.inferred.review.mechanism')}</p>}
        {isLoading && (
          <div className="kg-inline-load" style={{ justifyContent: 'center' }}>
            <Loader size={14} className="animate-spin" />
            <span>{t('analysisPanel.loading')}</span>
          </div>
        )}
        {!isLoading && items.length === 0 && (
          <p className="kg-note" style={{ textAlign: 'center' }}>
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
                queryKey: qk.inferred.all(bookId),
              })
            }
            onGraphInvalidate={() =>
              queryClient.invalidateQueries({ queryKey: qk.graph.all(bookId) })
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

  return (
    <div ref={ref} className={focus ? 'kg-ir is-focus' : 'kg-ir'}>
      <div className="kg-ir-head">
        <span className="kg-ir-name">{ir.sourceName}</span>
        <span className="kg-note">→</span>
        <span className="kg-ir-name">{ir.targetName}</span>
        <span className="kg-ir-type">{ir.suggestedRelationType}</span>
      </div>

      <div className="kg-ir-evidence">
        <span className="kg-ir-evidence-key">{t('v1.inferred.review.evidence')}</span>
        <span>
          {ir.reasoning ||
            t('v1.inferred.review.evidenceFallback', {
              common: ir.commonNeighborCount,
              score: ir.adamicAdarScore.toFixed(2),
            })}
        </span>
      </div>

      <div className="kg-actions">
        <button
          type="button"
          onClick={() => adopt.mutate()}
          disabled={busy}
          className="ss-btn ss-btn-sm ss-btn-secondary"
        >
          {adopt.isPending && <Loader size={11} className="animate-spin" />}
          {t('v1.inferred.review.adopt')}
        </button>
        <button
          type="button"
          onClick={() => reject.mutate()}
          disabled={busy}
          className="ss-btn ss-btn-sm ss-btn-secondary"
        >
          {reject.isPending && <Loader size={11} className="animate-spin" />}
          {t('v1.inferred.review.reject')}
        </button>
      </div>
    </div>
  );
}
