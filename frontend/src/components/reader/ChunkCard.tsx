import { useMemo } from 'react';
import { SegmentRenderer, type EntityMarkClickPayload } from './SegmentRenderer';
import { KeywordTags } from './KeywordTags';
import { isSeparatorText, keywordsWithoutEntities } from './readerModel';
import type { Chunk, Segment, EntityType } from '@/api/types';

const pillClass: Record<EntityType, string> = {
  character: 'ss-pill-character',
  location: 'ss-pill-location',
  organization: 'ss-pill-organization',
  object: 'ss-pill-object',
  concept: 'ss-pill-concept',
  other: 'ss-pill-other',
  event: 'ss-pill-event',
};

/** Deduplicate entities from segments by entityId, preserving first occurrence order. */
function extractEntities(segments: Segment[]) {
  const seen = new Set<string>();
  const entities: { entityId: string; name: string; type: EntityType }[] = [];
  for (const seg of segments) {
    if (seg.entity && !seen.has(seg.entity.entityId)) {
      seen.add(seg.entity.entityId);
      entities.push(seg.entity);
    }
  }
  return entities;
}

export function ChunkCard({
  chunk,
  onEntityClick,
}: {
  readonly chunk: Chunk;
  readonly onEntityClick?: (payload: EntityMarkClickPayload) => void;
}) {
  const entities = useMemo(() => extractEntities(chunk.segments), [chunk.segments]);
  const keywords = useMemo(
    () =>
      keywordsWithoutEntities(chunk.keywords, [
        ...entities.map((e) => e.name),
        ...chunk.segments.filter((seg) => seg.entity).map((seg) => seg.text),
      ]),
    [chunk.keywords, chunk.segments, entities],
  );

  // A bare scene break keeps its #order (it is still a locatable chunk) but
  // reads as a rule, not as a card of its own.
  if (entities.length === 0 && isSeparatorText(chunk.content)) {
    return (
      <div data-chunk-card className="rd-chunk rd-chunk-sep">
        <span className="rd-chunk-order">#{chunk.order}</span>
        <span className="rd-chunk-sep-rule" role="separator" aria-label={chunk.content.trim()} />
      </div>
    );
  }

  return (
    <div data-chunk-card className="rd-chunk">
      <div className="rd-chunk-head">
        <span className="rd-chunk-order">#{chunk.order}</span>
        {entities.length > 0 && (
          <div className="chunk-chips">
            {entities.map((e) => (
              <span
                key={e.entityId}
                className={`ss-pill ${pillClass[e.type]}`}
                style={onEntityClick ? { cursor: 'pointer' } : undefined}
                role={onEntityClick ? 'button' : undefined}
                tabIndex={onEntityClick ? 0 : undefined}
                onClick={
                  onEntityClick
                    ? (ev) =>
                        onEntityClick({
                          entityId: e.entityId,
                          name: e.name,
                          type: e.type,
                          rect: ev.currentTarget.getBoundingClientRect(),
                        })
                    : undefined
                }
                onKeyDown={
                  onEntityClick
                    ? (ev) => {
                        if (ev.key === 'Enter' || ev.key === ' ') {
                          ev.preventDefault();
                          onEntityClick({
                            entityId: e.entityId,
                            name: e.name,
                            type: e.type,
                            rect: ev.currentTarget.getBoundingClientRect(),
                          });
                        }
                      }
                    : undefined
                }
              >
                <span className="ss-pill-dot" />
                {e.name}
              </span>
            ))}
          </div>
        )}
      </div>
      <p className="rd-chunk-text">
        <SegmentRenderer segments={chunk.segments} />
      </p>
      {keywords.length > 0 && (
        <div className="rd-chunk-kw">
          <KeywordTags keywords={keywords} limit={6} />
        </div>
      )}
    </div>
  );
}
