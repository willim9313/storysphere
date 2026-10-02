import { useEffect, useMemo, useRef } from 'react';
import { useNavigate } from 'react-router-dom';
import { useTranslation } from 'react-i18next';
import { useQuery } from '@tanstack/react-query';
import { X, Loader } from 'lucide-react';
import { fetchEntityAnalysis } from '@/api/analysis';
import { useEntityChunks } from '@/hooks/useEntityChunks';
import type { EntityType } from '@/api/types';
import { qk } from '@/api/queryKeys';

const pillClass: Record<EntityType, string> = {
  character: 'ss-pill-character',
  location: 'ss-pill-location',
  organization: 'ss-pill-organization',
  object: 'ss-pill-object',
  concept: 'ss-pill-concept',
  other: 'ss-pill-other',
  event: 'ss-pill-event',
};

const POPOVER_WIDTH = 320;
const POPOVER_MARGIN = 16;
const POPOVER_FLIP_THRESHOLD = 320;

interface EntityCardProps {
  readonly bookId: string;
  readonly entityId: string;
  readonly name: string;
  readonly type: EntityType;
  readonly anchorRect: DOMRect;
  readonly onClose: () => void;
  readonly onJump: (chapterId: string, chunkId: string) => void;
}

export function EntityCard({ bookId, entityId, name, type, anchorRect, onClose, onJump }: EntityCardProps) {
  const { t } = useTranslation('reader');
  const { t: tg } = useTranslation('graph');
  const navigate = useNavigate();
  const cardRef = useRef<HTMLDivElement>(null);

  const { data: chunksData, isLoading: chunksLoading, isError: chunksErrored } = useEntityChunks(bookId, entityId);

  // #7a — 404 means "not generated yet", not a real error; retry:false keeps
  // the failed request from being retried and `analysis` stays undefined,
  // which the render below treats as the "not generated" state. Mirrors the
  // same inline-useQuery pattern EntityDetailPanel (graph page) already uses.
  const isCharacter = type === 'character';
  const { data: analysis, isLoading: analysisLoading } = useQuery({
    queryKey: qk.entity.analysis(bookId, entityId),
    queryFn: () => fetchEntityAnalysis(bookId, entityId),
    enabled: isCharacter,
    retry: false,
  });

  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'Escape') onClose();
    };
    const handlePointerDown = (e: MouseEvent) => {
      if (cardRef.current && !cardRef.current.contains(e.target as Node)) onClose();
    };
    document.addEventListener('keydown', handleKeyDown);
    document.addEventListener('mousedown', handlePointerDown);
    return () => {
      document.removeEventListener('keydown', handleKeyDown);
      document.removeEventListener('mousedown', handlePointerDown);
    };
  }, [onClose]);

  // Anchored to the clicked mark's viewport rect; flips above the anchor
  // when there isn't enough room below (same heuristic as the design
  // reference: flip once the anchor bottom sits within 320px of the
  // viewport's bottom edge). 320px wide / max-height 60vh / flex column live
  // in `.rd-ecard`; only the anchor position is computed here.
  const style = useMemo<React.CSSProperties>(() => {
    const left = Math.max(8, Math.min(anchorRect.left, window.innerWidth - POPOVER_WIDTH - POPOVER_MARGIN));
    const top = anchorRect.bottom + 8;
    const flip = top > window.innerHeight - POPOVER_FLIP_THRESHOLD;
    const base: React.CSSProperties = { left };
    if (flip) {
      base.bottom = window.innerHeight - anchorRect.top + 8;
    } else {
      base.top = top;
    }
    return base;
  }, [anchorRect]);

  const total = chunksData?.total;
  const chunks = chunksData?.chunks ?? [];
  const archetypeLabels = analysis ? Array.from(new Set(analysis.archetypes.map((a) => a.primary))) : [];

  return (
    <div ref={cardRef} style={style} className="rd-ecard">
      <div className="rd-ecard-head">
        <div className="rd-ecard-title-row">
          <div className="rd-ecard-name-row">
            <h3 className="rd-ecard-name">{name}</h3>
            <span className={`ss-pill ${pillClass[type]}`}>
              <span className="ss-pill-dot" />
              {tg(`entityTypes.${type}`)}
            </span>
          </div>
          <button onClick={onClose} aria-label={t('entityCard.close')} className="rd-icon-btn">
            <X size={15} />
          </button>
        </div>
        {total != null && (
          <span className="rd-ecard-total">{t('entityCard.totalOccurrences', { count: total })}</span>
        )}
        <div className="rd-ecard-actions">
          {isCharacter && (
            <button
              type="button"
              className="ss-btn ss-btn-sm ss-btn-secondary"
              onClick={() => navigate(`/books/${bookId}/characters`, { state: { selectId: entityId } })}
            >
              {t('entityCard.characterAnalysis')}
            </button>
          )}
          <button
            type="button"
            className="ss-btn ss-btn-sm ss-btn-ghost"
            onClick={() => navigate(`/books/${bookId}/graph?entity=${entityId}`)}
          >
            {t('entityCard.viewInGraph')}
          </button>
        </div>
      </div>

      {/* Body — the occurrence list is the card's substance; it scrolls inside
          the 60vh cap (no truncation, no fade mask). */}
      <div className="rd-ecard-body">
        {chunksLoading ? (
          <div className="rd-ecard-note">
            <Loader size={12} className="animate-spin" />
            {t('entityCard.loadingAppearances')}
          </div>
        ) : (
          <>
            {isCharacter && <AnalysisBlock loading={analysisLoading} summary={analysis?.profileSummary} labels={archetypeLabels} />}

            <div className="rd-ecard-divider" />
            <span className="rd-label">{t('entityCard.appearances', { count: total ?? 0 })}</span>
            {chunksErrored && <div className="rd-ecard-note is-error">{t('entityCard.loadFailed')}</div>}
            <div className="rd-ecard-list">
              {chunks.map((chunk) => (
                <button key={chunk.id} onClick={() => onJump(chunk.chapterId, chunk.id)} className="rd-ecard-row">
                  <div className="rd-ecard-row-head">
                    <span className="rd-ecard-row-chapter">
                      {chunk.chapterTitle
                        ? t('entityCard.chapterEntry', { number: chunk.chapterNumber, title: chunk.chapterTitle })
                        : t('entityCard.chapterNumber', { number: chunk.chapterNumber })}
                    </span>
                    <span className="rd-chunk-order">#{chunk.order}</span>
                  </div>
                  <p className="rd-ecard-row-text">{chunk.content}</p>
                </button>
              ))}
              {!chunksErrored && chunks.length === 0 && (
                <div className="rd-ecard-note">{t('entityCard.noAppearances')}</div>
              )}
            </div>
          </>
        )}
      </div>
    </div>
  );
}

/** profileSummary + archetype labels (two blocks above the occurrence list);
 *  no analysis yet (404) reads as 「角色深度分析未生成」, not as an error. */
function AnalysisBlock({
  loading,
  summary,
  labels,
}: {
  readonly loading: boolean;
  readonly summary: string | undefined;
  readonly labels: string[];
}) {
  const { t } = useTranslation('reader');
  if (loading) {
    return (
      <div className="rd-ecard-note">
        <Loader size={12} className="animate-spin" />
        {t('entityCard.loadingAnalysis')}
      </div>
    );
  }
  if (summary === undefined) return <div className="rd-ecard-note">{t('entityCard.noAnalysis')}</div>;
  return (
    <>
      <p className="rd-ecard-summary">{summary}</p>
      {labels.length > 0 && (
        <div className="rd-chips">
          {labels.map((label) => (
            <span key={label} className="ss-badge">
              {label}
            </span>
          ))}
        </div>
      )}
    </>
  );
}
