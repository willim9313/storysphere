import type { Segment, EntityType } from '@/api/types';

const pillClass: Record<EntityType, string> = {
  character: 'pill-char',
  location: 'pill-loc',
  concept: 'pill-con',
  event: 'pill-evt',
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
            className={`pill ${pillClass[seg.entity.type]}`}
            style={{ fontStyle: 'normal' }}
            title={seg.entity.name}
          >
            <span className="pill-dot" />
            {seg.text}
          </mark>
        );
      })}
    </span>
  );
}
