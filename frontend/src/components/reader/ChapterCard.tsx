import { ChevronDown } from 'lucide-react';
import { useTranslation } from 'react-i18next';
import { Tooltip } from '@/components/ui/Tooltip';
import { KeywordTags } from './KeywordTags';
import type { EntityMarkClickPayload } from './SegmentRenderer';
import type { Chapter, EntityType } from '@/api/types';

const pillClass: Record<EntityType, string> = {
  character: 'ss-pill-character',
  location: 'ss-pill-location',
  organization: 'ss-pill-organization',
  object: 'ss-pill-object',
  concept: 'ss-pill-concept',
  other: 'ss-pill-other',
  event: 'ss-pill-event',
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

  const classes = ['rd-chapter', isSelected && 'is-selected', dimmed && 'is-dimmed']
    .filter(Boolean)
    .join(' ');

  return (
    <div className={classes}>
      <div className="rd-chapter-top">
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
          className="rd-chapter-nav"
        >
          <h4 className="rd-chapter-name truncate">{chapter.title}</h4>
          <div className="rd-chapter-meta">
            {chapter.chunkCount} chunks · {t('chapter.entities', { count: chapter.entityCount })}
          </div>
        </div>

        {/* Right chevron = expand/collapse this card only, independent of
            navigation; the 1px inner divider is its border-left. */}
        <Tooltip label={t('chapter.toggleExpand')}>
          <button
            onClick={handleToggleExpand}
            aria-label={t('chapter.toggleExpand')}
            aria-expanded={isExpanded}
            className={isExpanded ? 'rd-chapter-chev is-open' : 'rd-chapter-chev'}
          >
            <ChevronDown
              size={14}
              style={{ transform: isExpanded ? 'rotate(0deg)' : 'rotate(-90deg)' }}
            />
          </button>
        </Tooltip>
      </div>

      {isExpanded && (
        <div className="rd-chapter-body">
          {chapter.summary && <p className="rd-chapter-summary">{chapter.summary}</p>}

          {chapter.keywords && Object.keys(chapter.keywords).length > 0 && (
            <KeywordTags keywords={chapter.keywords} limit={8} />
          )}

          {chapter.topEntities && chapter.topEntities.length > 0 && (
            <>
              <span className="rd-chapter-meta">
                {t('chapter.entityCount', { count: chapter.topEntities.length })}
              </span>
              <div className="rd-chips">
                {chapter.topEntities.map((e) => {
                  const payload = (el: HTMLElement) => ({
                    entityId: e.id,
                    name: e.name,
                    type: e.type,
                    rect: el.getBoundingClientRect(),
                  });
                  return (
                    <span
                      key={e.id}
                      className={`ss-pill ${pillClass[e.type]}`}
                      style={onEntityClick ? { cursor: 'pointer' } : undefined}
                      role={onEntityClick ? 'button' : undefined}
                      tabIndex={onEntityClick ? 0 : undefined}
                      onClick={
                        onEntityClick
                          ? (ev) => {
                              ev.stopPropagation();
                              onEntityClick(payload(ev.currentTarget));
                            }
                          : undefined
                      }
                      onKeyDown={
                        onEntityClick
                          ? (ev) => {
                              if (ev.key === 'Enter' || ev.key === ' ') {
                                ev.preventDefault();
                                ev.stopPropagation();
                                onEntityClick(payload(ev.currentTarget));
                              }
                            }
                          : undefined
                      }
                    >
                      <span className="ss-pill-dot" />
                      {e.name}
                    </span>
                  );
                })}
              </div>
            </>
          )}
        </div>
      )}
    </div>
  );
}
