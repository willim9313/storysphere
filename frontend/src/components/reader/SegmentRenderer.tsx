import { createContext, useContext, type ReactNode } from 'react';
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

export interface EntityMarkClickPayload {
  entityId: string;
  name: string;
  type: EntityType;
  rect: DOMRect;
}

// Provided by ReaderPage so entity marks can open the entity card popover
// without threading an onClick prop through ChunkCard (which is out of
// scope for this change). Consumers that never render EntityMarkClickProvider
// (e.g. the graph page's excerpt list) get `null` and marks render exactly
// as before. The context itself stays unexported — only the Provider
// component is exported — so this file keeps exporting components only,
// per react-refresh/only-export-components.
const EntityMarkClickContext = createContext<((payload: EntityMarkClickPayload) => void) | null>(null);

export function EntityMarkClickProvider({
  onEntityClick,
  children,
}: {
  readonly onEntityClick: (payload: EntityMarkClickPayload) => void;
  readonly children: ReactNode;
}) {
  return <EntityMarkClickContext.Provider value={onEntityClick}>{children}</EntityMarkClickContext.Provider>;
}

export function SegmentRenderer({ segments }: { segments: Segment[] }) {
  const onEntityClick = useContext(EntityMarkClickContext);
  return (
    <span>
      {segments.map((seg, i) => {
        if (!seg.entity) {
          return <span key={i}>{seg.text}</span>;
        }
        const entity = seg.entity;
        return (
          <mark
            key={i}
            className={`entity-mark ${markClass[entity.type]}`}
            style={{ fontStyle: 'normal', cursor: onEntityClick ? 'pointer' : 'default' }}
            title={entity.name}
            onClick={
              onEntityClick
                ? (e) =>
                    onEntityClick({
                      entityId: entity.entityId,
                      name: entity.name,
                      type: entity.type,
                      rect: e.currentTarget.getBoundingClientRect(),
                    })
                : undefined
            }
          >
            {seg.text}
          </mark>
        );
      })}
    </span>
  );
}
