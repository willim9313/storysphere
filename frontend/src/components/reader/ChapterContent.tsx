import { useParagraphs } from '@/hooks/useParagraphs';
import { ParagraphBlock } from './ParagraphBlock';
import { LoadingSpinner } from '@/components/ui/LoadingSpinner';
import { ErrorMessage } from '@/components/ui/ErrorMessage';
import type { EntityResponse, ChapterResponse } from '@/api/types';

interface ChapterContentProps {
  documentId: string;
  chapter: ChapterResponse;
  entities: EntityResponse[];
}

export function ChapterContent({ documentId, chapter, entities }: ChapterContentProps) {
  const { data: paragraphs, isLoading, error } = useParagraphs(documentId, chapter.number);

  if (isLoading) return <LoadingSpinner />;
  if (error) return <ErrorMessage message={error.message} />;
  if (!paragraphs?.length) {
    return (
      <p className="text-sm" style={{ color: 'var(--color-text-muted)' }}>
        No paragraphs found for this chapter.
      </p>
    );
  }

  return (
    <div>
      <h2
        className="text-2xl font-bold mb-6"
        style={{ fontFamily: 'var(--font-serif)' }}
      >
        {chapter.title ?? `Chapter ${chapter.number}`}
      </h2>
      {chapter.summary && (
        <p
          className="text-sm italic mb-6 p-4 rounded-lg"
          style={{
            backgroundColor: 'var(--color-accent-subtle)',
            color: 'var(--color-text-secondary)',
          }}
        >
          {chapter.summary}
        </p>
      )}
      {paragraphs.map((p) => (
        <ParagraphBlock key={p.id} paragraph={p} entities={entities} />
      ))}
    </div>
  );
}
