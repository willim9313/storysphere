import { ChevronRight } from 'lucide-react';
import type { Chapter, EntityType } from '@/api/types';

const pillClass: Record<EntityType, string> = {
  character: 'pill-char',
  location: 'pill-loc',
  concept: 'pill-con',
  event: 'pill-evt',
};

interface ChapterCardProps {
  chapter: Chapter;
  isSelected: boolean;
  isExpanded: boolean;
  onSelect: () => void;
  onViewContent: () => void;
}

export function ChapterCard({
  chapter,
  isSelected,
  isExpanded,
  onSelect,
  onViewContent,
}: ChapterCardProps) {
  return (
    <div
      className="rounded-lg p-2.5 cursor-pointer transition-all"
      style={{
        backgroundColor: isSelected ? 'white' : 'transparent',
        border: isSelected ? '1px solid var(--accent)' : '1px solid transparent',
        borderLeft: isSelected ? '3px solid var(--accent)' : '3px solid transparent',
      }}
      onClick={onSelect}
    >
      <div className="flex items-center justify-between">
        <h4
          className="text-xs font-medium truncate flex-1"
          style={{ color: 'var(--fg-primary)' }}
        >
          {chapter.title}
        </h4>
      </div>
      <div className="flex gap-2 mt-1 text-xs" style={{ color: 'var(--fg-muted)' }}>
        <span>{chapter.chunkCount} chunks</span>
        <span>{chapter.entityCount} 實體</span>
      </div>

      {/* Top entities pills */}
      {chapter.topEntities && chapter.topEntities.length > 0 && (
        <div className="flex flex-wrap gap-1 mt-1.5">
          {chapter.topEntities.map((e) => (
            <span key={e.id} className={`pill ${pillClass[e.type]}`}>
              <span className="pill-dot" />
              {e.name}
            </span>
          ))}
        </div>
      )}

      {/* Expanded details */}
      {isExpanded && (
        <div className="mt-2 space-y-2">
          {chapter.summary && (
            <p className="text-xs leading-relaxed" style={{ color: 'var(--fg-secondary)' }}>
              {chapter.summary}
            </p>
          )}
          <button
            className="flex items-center gap-1 text-xs font-medium"
            style={{ color: 'var(--accent)' }}
            onClick={(e) => {
              e.stopPropagation();
              onViewContent();
            }}
          >
            查看內容 <ChevronRight size={12} />
          </button>
        </div>
      )}
    </div>
  );
}
