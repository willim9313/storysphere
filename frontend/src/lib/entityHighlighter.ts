import type { EntityResponse, EntityType } from '@/api/types';

export interface TextSegment {
  text: string;
  entityId?: string;
  entityType?: EntityType;
  entityName?: string;
}

export function highlightEntities(
  text: string,
  entities: EntityResponse[],
): TextSegment[] {
  if (!entities.length) return [{ text }];

  // Build name→entity map, collecting all names + aliases, longest first
  const nameMap = new Map<string, EntityResponse>();
  for (const entity of entities) {
    nameMap.set(entity.name.toLowerCase(), entity);
    for (const alias of entity.aliases) {
      nameMap.set(alias.toLowerCase(), entity);
    }
  }

  // Sort names longest-first to avoid partial matches
  const names = [...nameMap.keys()].sort((a, b) => b.length - a.length);
  if (!names.length) return [{ text }];

  // Build regex — word-boundary, case-insensitive
  const escaped = names.map((n) => n.replace(/[.*+?^${}()|[\]\\]/g, '\\$&'));
  const pattern = new RegExp(`\\b(${escaped.join('|')})\\b`, 'gi');

  const segments: TextSegment[] = [];
  let lastIndex = 0;
  let match: RegExpExecArray | null;

  while ((match = pattern.exec(text)) !== null) {
    if (match.index > lastIndex) {
      segments.push({ text: text.slice(lastIndex, match.index) });
    }

    const matched = match[0];
    const entity = nameMap.get(matched.toLowerCase());
    segments.push({
      text: matched,
      entityId: entity?.id,
      entityType: entity?.entity_type,
      entityName: entity?.name,
    });

    lastIndex = pattern.lastIndex;
  }

  if (lastIndex < text.length) {
    segments.push({ text: text.slice(lastIndex) });
  }

  return segments;
}
