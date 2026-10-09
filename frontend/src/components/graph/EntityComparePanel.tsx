import { useMemo } from 'react';
import { X, Loader, GitCompareArrows } from 'lucide-react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { useTranslation } from 'react-i18next';
import {
  confirmInferred,
  fetchInferredRelations,
  rejectInferred,
} from '@/api/graph';
import type { InferredRelation } from '@/api/graph';
import type { GraphNode } from '@/api/types';
import { qk } from '@/api/queryKeys';

interface EntityComparePanelProps {
  bookId: string;
  a: GraphNode;
  b: GraphNode;
  onClose: () => void;
  onEnterPairMode?: () => void;
}

export function EntityComparePanel({ bookId, a, b, onClose, onEnterPairMode }: EntityComparePanelProps) {
  const { t } = useTranslation('graph');
  const queryClient = useQueryClient();

  const { data: inferredData } = useQuery({
    queryKey: qk.inferred.all(bookId),
    queryFn: () => fetchInferredRelations(bookId, 'pending'),
  });

  const suggested = useMemo(() => {
    if (!inferredData) return [] as InferredRelation[];
    return inferredData.items
      .filter(
        (ir) =>
          (ir.sourceId === a.id && ir.targetId === b.id) ||
          (ir.sourceId === b.id && ir.targetId === a.id),
      )
      .slice(0, 3);
  }, [inferredData, a.id, b.id]);

  // No relationType: the backend promotes `suggestedRelationType` to its
  // canonical RelationType itself. (Sending the inferred name — `potential_ally`
  // — as an explicit type was rejected with a 422.)
  const adopt = useMutation({
    mutationFn: (id: string) => confirmInferred(bookId, id),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: qk.inferred.all(bookId) });
      queryClient.invalidateQueries({ queryKey: qk.graph.all(bookId) });
    },
  });

  const reject = useMutation({
    mutationFn: (id: string) => rejectInferred(bookId, id),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: qk.inferred.all(bookId) });
      queryClient.invalidateQueries({ queryKey: qk.graph.all(bookId) });
    },
  });

  const typeDiffers = a.type !== b.type;
  const countDiffers = a.chunkCount !== b.chunkCount;
  const described = [a, b].filter((n) => n.description);

  return (
    <div className="kg-panel">
      <div className="kg-panel-head">
        <h3 className="kg-panel-title">{t('v1.compare.title')}</h3>
        <button type="button" onClick={onClose} className="kg-icon-btn" aria-label={t('a11y.close')}>
          <X size={14} />
        </button>
      </div>

      <div className="kg-panel-body">
        <div className="kg-chunk">
          <span className="kg-label">{t('v1.compare.basicInfo')}</span>
          <div className="kg-compare-grid">
            <span />
            <span className="is-head">{a.name}</span>
            <span className="is-head">{b.name}</span>
            <span className="is-key">{t('v1.compare.type')}</span>
            <span className={typeDiffers ? 'is-diff' : undefined}>{t(`entityTypes.${a.type}`)}</span>
            <span className={typeDiffers ? 'is-diff' : undefined}>{t(`entityTypes.${b.type}`)}</span>
            <span className="is-key">{t('v1.compare.appearanceCount')}</span>
            <span className={countDiffers ? 'is-diff' : undefined}>{a.chunkCount}</span>
            <span className={countDiffers ? 'is-diff' : undefined}>{b.chunkCount}</span>
          </div>
        </div>

        {described.length > 0 && (
          <div className="kg-chunk">
            <span className="kg-label">{t('v1.compare.attributes')}</span>
            {described.map((n) => (
              <p key={n.id} className="kg-text">
                <strong>{n.name}</strong>
                {'　'}
                {n.description}
              </p>
            ))}
          </div>
        )}

        <section className="kg-section">
          <span className="kg-label">{t('v1.compare.suggested')}</span>
          {suggested.length === 0 ? (
            <p className="kg-note">{t('v1.compare.noSuggested')}</p>
          ) : (
            suggested.map((ir) => {
              const busy = adopt.variables === ir.id || reject.variables === ir.id;
              return (
                <div key={ir.id} className="kg-ir">
                  {/* `type · 共同鄰居 N 個 · Adamic-Adar x` — the evidence the review queue shows too. */}
                  <span className="kg-text">
                    <span className="kg-ir-type">{t(`inferredType.${ir.suggestedRelationType}`)}</span>
                    {' · '}
                    {t('v1.inferred.review.evidenceFallback', {
                      common: ir.commonNeighborCount,
                      score: ir.adamicAdarScore.toFixed(2),
                    })}
                  </span>
                  {/* Adopt / reject write data but spend nothing: no cost glyph. */}
                  <div className="kg-actions">
                    <button
                      type="button"
                      disabled={busy}
                      onClick={() => adopt.mutate(ir.id)}
                      className="ss-btn ss-btn-sm ss-btn-secondary"
                    >
                      {busy && adopt.isPending && <Loader size={11} className="animate-spin" />}
                      {t('v1.inferred.review.adopt')}
                    </button>
                    <button
                      type="button"
                      disabled={busy}
                      onClick={() => reject.mutate(ir.id)}
                      className="ss-btn ss-btn-sm ss-btn-secondary"
                    >
                      {busy && reject.isPending && <Loader size={11} className="animate-spin" />}
                      {t('v1.inferred.review.reject')}
                    </button>
                  </div>
                </div>
              );
            })
          )}
          {onEnterPairMode && (
            <button
              type="button"
              onClick={onEnterPairMode}
              className="ss-btn ss-btn-sm ss-btn-secondary"
              style={{ alignSelf: 'flex-start' }}
            >
              <GitCompareArrows size={12} />
              {t('v1.pair.enter')}
            </button>
          )}
        </section>
      </div>
    </div>
  );
}
