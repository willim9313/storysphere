import type { ParagraphResponse, EntityResponse } from '@/api/types';
import { highlightEntities } from '@/lib/entityHighlighter';
import { EntityHighlight } from './EntityHighlight';
import { KeywordTags } from './KeywordTags';

interface ParagraphBlockProps {
  paragraph: ParagraphResponse;
  entities: EntityResponse[];
}

export function ParagraphBlock({ paragraph, entities }: ParagraphBlockProps) {
  const segments = highlightEntities(paragraph.text, entities);

  return (
    <div className="mb-4">
      <p style={{ fontFamily: 'var(--font-serif)', lineHeight: 1.8 }}>
        {segments.map((seg, i) =>
          seg.entityId ? (
            <EntityHighlight
              key={i}
              text={seg.text}
              entityType={seg.entityType}
              entityName={seg.entityName}
            />
          ) : (
            <span key={i}>{seg.text}</span>
          ),
        )}
      </p>
      <KeywordTags keywords={paragraph.keywords} />
    </div>
  );
}
