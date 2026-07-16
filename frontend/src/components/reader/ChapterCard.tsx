
import { ChevronDown } from 'lucide-react';
import { useTranslation } from 'react-i18next';
import { KeywordTags } from './KeywordTags';
import type { EntityMarkClickPayload } from './SegmentRenderer';
import type { Chapter, EntityType } from '@/api/types';

const pillClass: Record<EntityType, string> = {
  character: 'pill-char',
  location: 'pill-loc',
  organization: 'pill-org',
  object: 'pill-obj',
  concept: 'pill-con',
  other: 'pill-other',
  event: 'pill-evt',
};

interface ChapterCardProps {
  chapter: Chapter;
  /** True when this chapter is the one currently being read in column 3. */
  isSelected: boolean;
  /** True when this card's accordion body is open (multiple cards can be open at once). */
  isExpanded: boolean;
  /** True when a search is active and this chapter doesn't match — renders dimmed but stays clickable. */
  dimmed?: boolean;
  /** Navigate: read this chapter in column 3. */
  onSelect: () => void;
  /** Expand/collapse this card's accordion body only — must not trigger navigation. */
  onToggleExpand: () => void;
  onEntityClick?: (payload: EntityMarkClickPayload) => void;
}

export function ChapterCard({
  chapter,
  isSelected,
  isExpanded,
  dimmed = false,
  onSelect,
  onToggleExpand,
  onEntityClick,
}: ChapterCardProps) {
  const { t } = useTranslation('reader');

  // Native <button> already synthesizes click from Enter/Space — a separate
  // onKeyDown would double-fire (and stray keys like Tab would toggle too).
  const handleToggleExpand = (e: React.MouseEvent) => {
    e.stopPropagation();
    onToggleExpand();
  };

  return (
    <div
      style={{
        borderRadius: 'var(--card-radius)',
        border: isSelected ? '1px solid var(--accent)' : '1px solid var(--border)',
        boxShadow: isSelected ? 'inset 0 0 0 1px var(--accent)' : 'none',
        backgroundColor: 'var(--bg-primary)',
        opacity: dimmed ? 0.4 : 1,
        transition: 'opacity var(--transition-fast)',
      }}
    >
      <div className="flex items-start gap-1" style={{ padding: '10px 8px 10px 12px' }}>
        {/* Left click target = navigate (read this chapter in column 3) */}
        <div
          role="button"
          tabIndex={0}
          onClick={onSelect}
          onKeyDown={(e) => {
            if (e.key === 'Enter' || e.key === ' ') {
              e.preventDefault();
              onSelect();
            }
          }}
          style={{ cursor: 'pointer', flex: 1, minWidth: 0 }}
        >
          <h4
            className="truncate"
            style={{
              fontFamily: 'var(--font-serif)',
              fontSize: 'var(--font-size-base)',
              fontWeight: 600,
              color: 'var(--fg-primary)',
              margin: 0,
            }}
          >
            {chapter.title}
          </h4>
          <div className="mt-0.5 text-xs" style={{ color: 'var(--fg-muted)' }}>
            {chapter.chunkCount} chunks · {t('chapter.entities', { count: chapter.entityCount })}
          </div>
        </div>

        {/* Right chevron = expand/collapse this card only, independent of navigation */}
        <button
          onClick={handleToggleExpand}
          aria-label={t('chapter.toggleExpand')}
          aria-expanded={isExpanded}
          title={t('chapter.toggleExpand')}
          style={{
            flexShrink: 0,
            background: 'none',
            border: 'none',
            cursor: 'pointer',
            color: 'var(--fg-muted)',
            padding: 3,
            display: 'flex',
            transition: 'transform var(--transition-fast)',
            transform: isExpanded ? 'rotate(0deg)' : 'rotate(-90deg)',
          }}
        >
          <ChevronDown size={15} />
        </button>
      </div>

      {isExpanded && (
        <div style={{ padding: '0 12px 12px' }}>
          {chapter.summary && (
            <p
              style={{
                fontFamily: 'var(--font-serif)',
                fontSize: 'var(--font-size-xs)',
                lineHeight: 1.65,
                color: 'var(--fg-secondary)',
                margin: '0 0 12px',
                paddingBottom: 12,
                borderBottom: '1px solid var(--border)',
              }}
            >
              {chapter.summary}
            </p>
          )}

          {chapter.keywords && Object.keys(chapter.keywords).length > 0 && (
            <div>
              <div className="text-xs mb-1.5" style={{ color: 'var(--fg-muted)' }}>
                {t('chapter.keywords')}
              </div>
              <KeywordTags keywords={chapter.keywords} limit={8} />
            </div>
          )}

          {chapter.topEntities && chapter.topEntities.length > 0 && (
            <>
              <div style={{ height: 1, background: 'var(--border)', margin: '12px 0' }} />
              <div className="text-xs mb-1.5" style={{ color: 'var(--fg-muted)' }}>
                {t('chapter.entityCount', { count: chapter.topEntities.length })}
              </div>
              <div className="flex flex-wrap gap-1">
                {chapter.topEntities.map((e) => (
                  <span
                    key={e.id}
                    className={`pill ${pillClass[e.type]}`}
                    style={onEntityClick ? { cursor: 'pointer' } : undefined}
                    role={onEntityClick ? 'button' : undefined}
                    tabIndex={onEntityClick ? 0 : undefined}
                    onClick={
                      onEntityClick
                        ? (ev) => {
                            ev.stopPropagation();
                            onEntityClick({
                              entityId: e.id,
                              name: e.name,
                              type: e.type,
                              rect: ev.currentTarget.getBoundingClientRect(),
                            });
                          }
                        : undefined
                    }
                    onKeyDown={
                      onEntityClick
                        ? (ev) => {
                            if (ev.key === 'Enter' || ev.key === ' ') {
                              ev.preventDefault();
                              ev.stopPropagation();
                              onEntityClick({
                                entityId: e.id,
                                name: e.name,
                                type: e.type,
                                rect: ev.currentTarget.getBoundingClientRect(),
                              });
                            }
                          }
                        : undefined
                    }
                  >
                    <span className="pill-dot" />
                    {e.name}
                  </span>
                ))}
              </div>
            </>
          )}
        </div>
      )}
    </div>
  );
}
