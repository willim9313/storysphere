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
          aria-current={isSelected ? 'true' : undefined}
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

interface ChapterMatterGroupProps {
  /** 卷首 (before chapter 1) or 卷末 (after the last chapter). */
  position: 'front' | 'back';
  chapters: readonly Chapter[];
  isOpen: boolean;
  onToggle: () => void;
  selectedChapterId: string | null;
  /** Ids matching the active search, or null when no search is active. */
  matchedChapterIds: ReadonlySet<string> | null;
  onSelect: (chapterId: string) => void;
}

/**
 * Non-body matter as a collapsible group (UI_SPEC §3.3 卷首／卷末). Read-only
 * single-row cards: the pipeline never summarises or extracts these chapters,
 * so there is nothing to expand. Cards deliberately carry no
 * `data-chapter-card` — BezierConnectors indexes body chapters only.
 */
export function ChapterMatterGroup({
  position,
  chapters,
  isOpen,
  onToggle,
  selectedChapterId,
  matchedChapterIds,
  onSelect,
}: ChapterMatterGroupProps) {
  const { t } = useTranslation('reader');
  const { t: tu } = useTranslation('upload');
  if (chapters.length === 0) return null;

  return (
    <div className="rd-matter">
      <button
        type="button"
        onClick={onToggle}
        aria-expanded={isOpen}
        className="rd-matter-head"
      >
        <ChevronDown
          size={12}
          style={{ transform: isOpen ? 'rotate(0deg)' : 'rotate(-90deg)' }}
        />
        <span className="rd-matter-mark" aria-hidden="true" />
        {t(position === 'front' ? 'matter.front' : 'matter.back', { count: chapters.length })}
      </button>
      {isOpen &&
        chapters.map((chapter) => {
          const role = tu(`review.chapterType.${chapter.role}`);
          const classes = [
            'rd-chapter',
            'rd-chapter-matter',
            selectedChapterId === chapter.id && 'is-selected',
            matchedChapterIds !== null && !matchedChapterIds.has(chapter.id) && 'is-dimmed',
          ]
            .filter(Boolean)
            .join(' ');
          return (
            <button
              key={chapter.id}
              type="button"
              onClick={() => onSelect(chapter.id)}
              aria-current={selectedChapterId === chapter.id ? 'true' : undefined}
              className={classes}
            >
              <span className="rd-chapter-name truncate">
                {chapter.title ? `${role} · ${chapter.title}` : role}
              </span>
              <span className="rd-chapter-meta">{t('matter.paragraphs', { count: chapter.chunkCount })}</span>
            </button>
          );
        })}
    </div>
  );
}
