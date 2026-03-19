import { useMemo } from 'react';
import { SegmentRenderer } from './SegmentRenderer';
import type { Chunk, Segment, EntityType } from '@/api/types';

const pillClass: Record<EntityType, string> = {
  character: 'pill-char',
  location: 'pill-loc',
  concept: 'pill-con',
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

export function ChunkCard({ chunk }: { chunk: Chunk }) {
  const entities = useMemo(() => extractEntities(chunk.segments), [chunk.segments]);

  return (
    <div
      data-chunk-card
      className="rounded-lg p-4 mb-3"
      style={{
        backgroundColor: 'white',
        border: '1px solid var(--border)',
      }}
    >
      <div className="flex items-center justify-between mb-2">
        <span className="text-xs" style={{ color: 'var(--fg-muted)' }}>
          #{chunk.order}
        </span>
        {entities.length > 0 && (
          <div className="flex gap-1 flex-wrap">
            {entities.map((e) => (
              <span
                key={e.entityId}
                className={`pill ${pillClass[e.type]}`}
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
    </div>
  );
}
