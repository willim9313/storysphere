import { List } from 'lucide-react';
import type { ChapterResponse } from '@/api/types';

interface ChapterListProps {
  chapters: ChapterResponse[];
  selectedNumber: number | null;
  onSelect: (num: number) => void;
}

export function ChapterList({ chapters, selectedNumber, onSelect }: ChapterListProps) {
  return (
    <div className="flex flex-col gap-1">
      <div
        className="flex items-center gap-2 px-3 py-2 text-xs font-semibold uppercase tracking-wide"
        style={{ color: 'var(--color-text-muted)' }}
      >
        <List size={14} />
        Chapters
      </div>
      <div className="overflow-y-auto max-h-[calc(100vh-200px)]">
        {chapters.map((ch) => (
          <button
            key={ch.id}
            onClick={() => onSelect(ch.number)}
            className="w-full text-left px-3 py-2 rounded-md text-sm transition-colors"
            style={{
              backgroundColor:
                selectedNumber === ch.number ? 'var(--color-accent-subtle)' : 'transparent',
              color:
                selectedNumber === ch.number
                  ? 'var(--color-accent)'
                  : 'var(--color-text)',
            }}
          >
            <div className="font-medium truncate">
              {ch.title ?? `Chapter ${ch.number}`}
            </div>
            <div className="text-xs mt-0.5" style={{ color: 'var(--color-text-muted)' }}>
              {ch.word_count.toLocaleString()} words
            </div>
          </button>
        ))}
      </div>
    </div>
  );
}
