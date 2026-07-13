import { useEffect, useMemo, useRef } from 'react';
import { useNavigate } from 'react-router-dom';
import { useTranslation } from 'react-i18next';
import { useQuery } from '@tanstack/react-query';
import { X, Loader } from 'lucide-react';
import { fetchEntityAnalysis } from '@/api/analysis';
import { useEntityChunks } from '@/hooks/useEntityChunks';
import type { EntityType } from '@/api/types';

const pillClass: Record<EntityType, string> = {
  character: 'pill-char',
  location: 'pill-loc',
  organization: 'pill-org',
  object: 'pill-obj',
  concept: 'pill-con',
  other: 'pill-other',
  event: 'pill-evt',
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
    queryKey: ['books', bookId, 'entities', entityId, 'analysis'],
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
  // viewport's bottom edge).
  const style = useMemo<React.CSSProperties>(() => {
    const left = Math.max(8, Math.min(anchorRect.left, window.innerWidth - POPOVER_WIDTH - POPOVER_MARGIN));
    const top = anchorRect.bottom + 8;
    const flip = top > window.innerHeight - POPOVER_FLIP_THRESHOLD;
    const base: React.CSSProperties = {
      position: 'fixed',
      left,
      width: POPOVER_WIDTH,
      maxHeight: '60vh',
      zIndex: 40,
      display: 'flex',
      flexDirection: 'column',
      backgroundColor: 'var(--bg-primary)',
      border: '1px solid var(--border)',
      borderRadius: 'var(--card-radius)',
      boxShadow: 'var(--shadow-lg)',
      animation: 'rd-pop .16s ease',
    };
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
    <div ref={cardRef} style={style}>
      {/* Header */}
      <div
        style={{
          display: 'flex',
          alignItems: 'flex-start',
          justifyContent: 'space-between',
          gap: 10,
          padding: '14px 16px',
          borderBottom: '1px solid var(--border)',
          flexShrink: 0,
        }}
      >
        <div style={{ minWidth: 0 }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: 8, flexWrap: 'wrap' }}>
            <h3
              style={{
                fontFamily: 'var(--font-serif)',
                fontSize: 'var(--font-size-xl)',
                fontWeight: 700,
                margin: 0,
                color: 'var(--fg-primary)',
              }}
            >
              {name}
            </h3>
            <span className={`pill ${pillClass[type]}`}>
              <span className="pill-dot" />
              {tg(`entityTypes.${type}`)}
            </span>
          </div>
          {total != null && (
            <div style={{ marginTop: 4, fontSize: 'var(--font-size-2xs)', color: 'var(--fg-muted)' }}>
              {t('entityCard.totalOccurrences', { count: total })}
            </div>
          )}
        </div>
        <button
          onClick={onClose}
          aria-label={t('entityCard.close')}
          style={{
            flexShrink: 0,
            background: 'none',
            border: 'none',
            cursor: 'pointer',
            color: 'var(--fg-muted)',
            padding: 2,
            display: 'flex',
          }}
        >
          <X size={15} />
        </button>
      </div>

      {/* Actions */}
      <div
        style={{
          display: 'flex',
          gap: 8,
          padding: '10px 16px',
          borderBottom: '1px solid var(--border)',
          flexWrap: 'wrap',
          flexShrink: 0,
        }}
      >
        {isCharacter && (
          <button
            className="btn btn-primary"
            style={{ padding: '5px 10px', fontSize: 'var(--font-size-2xs)' }}
            onClick={() => navigate(`/books/${bookId}/characters`, { state: { selectId: entityId } })}
          >
            {t('entityCard.characterAnalysis')}
          </button>
        )}
        <button
          className="btn btn-secondary"
          style={{ padding: '5px 10px', fontSize: 'var(--font-size-2xs)' }}
          onClick={() => navigate(`/books/${bookId}/graph?entity=${entityId}`)}
        >
          {t('entityCard.viewInGraph')}
        </button>
      </div>

      {/* Body */}
      <div style={{ flex: 1, overflowY: 'auto', minHeight: 0, padding: '14px 16px' }}>
        {chunksLoading ? (
          <div
            style={{
              display: 'flex',
              alignItems: 'center',
              gap: 8,
              color: 'var(--fg-muted)',
              fontSize: 13,
              padding: '20px 0',
              justifyContent: 'center',
            }}
          >
            <Loader size={16} className="animate-spin" />
            {t('entityCard.loadingAppearances')}
          </div>
        ) : (
          <>
            {isCharacter && (
              <div style={{ marginBottom: 14 }}>
                {analysisLoading ? (
                  <div style={{ display: 'flex', alignItems: 'center', gap: 8, color: 'var(--fg-muted)', fontSize: 12 }}>
                    <Loader size={12} className="animate-spin" />
                    {t('entityCard.loadingAnalysis')}
                  </div>
                ) : analysis ? (
                  <>
                    <p
                      style={{
                        fontFamily: 'var(--font-serif)',
                        fontSize: 'var(--font-size-sm)',
                        lineHeight: 1.7,
                        color: 'var(--fg-secondary)',
                        margin: '0 0 8px',
                      }}
                    >
                      {analysis.profileSummary}
                    </p>
                    {archetypeLabels.length > 0 && (
                      <div style={{ display: 'flex', flexWrap: 'wrap', gap: 5 }}>
                        {archetypeLabels.map((label) => (
                          <span
                            key={label}
                            style={{
                              padding: '2px 8px',
                              borderRadius: 'var(--badge-radius)',
                              backgroundColor: 'var(--bg-tertiary)',
                              color: 'var(--fg-secondary)',
                              fontSize: 'var(--font-size-2xs)',
                            }}
                          >
                            {label}
                          </span>
                        ))}
                      </div>
                    )}
                  </>
                ) : (
                  <div
                    style={{
                      fontSize: 'var(--font-size-2xs)',
                      color: 'var(--fg-muted)',
                      padding: '8px 10px',
                      backgroundColor: 'var(--bg-secondary)',
                      borderRadius: 'var(--radius-sm)',
                    }}
                  >
                    {t('entityCard.noAnalysis')}
                  </div>
                )}
              </div>
            )}

            <div style={{ fontSize: 'var(--font-size-2xs)', color: 'var(--fg-muted)', marginBottom: 8, fontWeight: 600 }}>
              {t('entityCard.appearances', { count: total ?? 0 })}
            </div>
            {chunksErrored && (
              <p style={{ fontSize: 'var(--font-size-2xs)', color: 'var(--fg-muted)' }}>{t('entityCard.loadFailed')}</p>
            )}
            <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
              {chunks.map((chunk) => (
                <button
                  key={chunk.id}
                  onClick={() => onJump(chunk.chapterId, chunk.id)}
                  style={{
                    textAlign: 'left',
                    background: 'var(--bg-primary)',
                    border: '1px solid var(--border)',
                    borderRadius: 'var(--radius-sm)',
                    padding: '9px 11px',
                    cursor: 'pointer',
                    fontFamily: 'inherit',
                    width: '100%',
                  }}
                >
                  <div style={{ display: 'flex', justifyContent: 'space-between', gap: 8, marginBottom: 3 }}>
                    <span
                      style={{
                        fontFamily: 'var(--font-sans)',
                        fontSize: 'var(--font-size-2xs)',
                        fontWeight: 600,
                        color: 'var(--fg-primary)',
                      }}
                    >
                      {chunk.chapterTitle
                        ? t('entityCard.chapterEntry', { number: chunk.chapterNumber, title: chunk.chapterTitle })
                        : t('entityCard.chapterNumber', { number: chunk.chapterNumber })}
                    </span>
                    <span
                      style={{
                        fontFamily: 'var(--font-mono)',
                        fontSize: 'var(--font-size-2xs)',
                        color: 'var(--fg-muted)',
                        flexShrink: 0,
                      }}
                    >
                      #{chunk.order}
                    </span>
                  </div>
                  <div
                    style={{
                      fontFamily: 'var(--font-serif)',
                      fontSize: 'var(--font-size-xs)',
                      color: 'var(--fg-muted)',
                      lineHeight: 1.5,
                      display: '-webkit-box',
                      WebkitLineClamp: 2,
                      WebkitBoxOrient: 'vertical',
                      overflow: 'hidden',
                    }}
                  >
                    {chunk.content}
                  </div>
                </button>
              ))}
              {!chunksErrored && chunks.length === 0 && (
                <p style={{ fontSize: 'var(--font-size-2xs)', color: 'var(--fg-muted)' }}>{t('entityCard.noAppearances')}</p>
              )}
            </div>
          </>
        )}
      </div>
    </div>
  );
}
