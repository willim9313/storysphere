import { useMemo } from 'react';
import { SegmentRenderer, type EntityMarkClickPayload } from './SegmentRenderer';
import { KeywordTags } from './KeywordTags';
import type { Chunk, Segment, EntityType } from '@/api/types';

const pillClass: Record<EntityType, string> = {
  character: 'pill-char',
  location: 'pill-loc',
  organization: 'pill-org',
  object: 'pill-obj',
  concept: 'pill-con',
  other: 'pill-other',
  event: 'pill-evt',
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

  return (
    <div
      data-chunk-card
      style={{
        backgroundColor: 'var(--bg-primary)',
        border: '1px solid var(--border)',
        borderRadius: 10,
        padding: '14px 16px',
        marginBottom: 10,
        boxShadow: 'var(--shadow-sm)',
      }}
    >
      <div className="flex items-center justify-between mb-2">
        <span className="text-xs" style={{ color: 'var(--fg-muted)' }}>
          #{chunk.order}
        </span>
        {entities.length > 0 && (
          <div className="flex gap-1 flex-wrap chunk-chips">
            {entities.map((e) => (
              <span
                key={e.entityId}
                className={`pill ${pillClass[e.type]}`}
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
                <span className="pill-dot" />
                {e.name}
              </span>
            ))}
          </div>
        )}
      </div>
      <p
        className="text-sm leading-relaxed"
        style={{ fontFamily: 'var(--font-serif)', color: 'var(--fg-primary)' }}
      >
        <SegmentRenderer segments={chunk.segments} />
      </p>
      {chunk.keywords.length > 0 && (
        <div className="mt-2">
          <KeywordTags keywords={chunk.keywords} limit={6} />
        </div>
      )}
    </div>
  );
}
