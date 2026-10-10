import { createContext, useContext, type ReactNode } from 'react';
import { Tooltip } from '@/components/ui/Tooltip';
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

/**
 * Regex for the words a caller asked to mark, or null.
 *
 * Whitespace is allowed between characters: PDF extraction puts spaces inside CJK
 * words, so 「鹽」 in the symbol list can be 「鹽 」 or a two-character term split
 * as 「潮 汐」 in the paragraph, and an exact match would silently find nothing.
 */
function termPattern(terms: readonly string[] | undefined): RegExp | null {
  const words = (terms ?? []).map((w) => w.replace(/\s+/g, '')).filter(Boolean);
  if (words.length === 0) return null;
  const alts = [...new Set(words)]
    .sort((a, b) => b.length - a.length)
    .map((w) =>
      [...w].map((ch) => ch.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')).join('\\s*'),
    );
  return new RegExp(`(${alts.join('|')})`, 'g');
}

/** Plain text with the asked-for words wrapped in <mark>. */
function markText(text: string, pattern: RegExp | null): ReactNode {
  if (!pattern) return text;
  const parts = text.split(pattern);
  if (parts.length === 1) return text;
  // split() with one capture group puts the matches at the odd indices.
  return parts.map((part, i) =>
    i % 2 === 1 ? (
      <mark key={i} className="rd-term-mark">
        {part}
      </mark>
    ) : (
      part
    ),
  );
}

export function SegmentRenderer({
  segments,
  markTerms,
}: {
  segments: Segment[];
  /**
   * Words to mark in this paragraph — set when the reader arrived from a
   * symbol's 「跳到原文」, so the word is found without reading the paragraph.
   */
  markTerms?: readonly string[];
}) {
  const onEntityClick = useContext(EntityMarkClickContext);
  const pattern = termPattern(markTerms);
  return (
    <span>
      {segments.map((seg, i) => {
        if (!seg.entity) {
          return <span key={i}>{markText(seg.text, pattern)}</span>;
        }
        const entity = seg.entity;
        // A symbol can also be a KG entity (海, 門): keep the entity mark and add
        // the term mark to it rather than splitting the entity apart.
        const isTerm = pattern !== null && new RegExp(`^${pattern.source}$`).test(seg.text);
        return (
          <Tooltip key={i} label={entity.name} anchorClassName="ss-tooltip-anchor-inline">
          <mark
            className={`entity-mark ${markClass[entity.type]}${isTerm ? ' rd-term-mark' : ''}`}
            style={{ fontStyle: 'normal', cursor: onEntityClick ? 'pointer' : 'default' }}
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
          </Tooltip>
        );
      })}
    </span>
  );
}
