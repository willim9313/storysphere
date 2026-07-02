import type { Segment, EntityType } from '@/api/types';

const markClass: Record<EntityType, string> = {
  character: 'entity-mark-char',
  location: 'entity-mark-loc',
  organization: 'entity-mark-org',
  object: 'entity-mark-obj',
  concept: 'entity-mark-con',
  other: 'entity-mark-other',
  event: 'entity-mark-evt',
};

export function SegmentRenderer({ segments }: { segments: Segment[] }) {
  return (
    <span>
      {segments.map((seg, i) => {
        if (!seg.entity) {
          return <span key={i}>{seg.text}</span>;
        }
        return (
          <mark
            key={i}
            className={`entity-mark ${markClass[seg.entity.type]}`}
            style={{ fontStyle: 'normal' }}
            title={seg.entity.name}
          >
            {seg.text}
          </mark>
        );
      })}
    </span>
  );
}
