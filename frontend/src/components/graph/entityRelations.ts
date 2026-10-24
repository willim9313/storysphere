import type { GraphEdge, GraphNode } from '@/api/types';
import { classifyRelationLabel, type RelationColorBucket } from '@/lib/graphTransform';

export interface EntityRelationRow {
  readonly edgeId: string;
  readonly otherId: string;
  readonly otherName: string;
  /** Raw RelationType enum value ('' when the edge carries none). */
  readonly type: string;
  readonly bucket: RelationColorBucket;
  readonly weight: number;
  /** True when the other endpoint is currently off the canvas (type chip / search / orphan). */
  readonly hidden: boolean;
}

const BUCKET_ORDER: Record<RelationColorBucket, number> = { positive: 0, negative: 1, neutral: 2 };

/**
 * Relations of one entity for the detail panel. Takes every non-inferred edge
 * touching `nodeId` (inferred ones are unconfirmed and have their own review
 * panel). `visibleNodeIds` is the set of nodes the canvas currently draws; pass
 * null when the notion does not apply (cluster view) so nothing is flagged.
 * Order: relation strength (weight) descending, then name — the strongest ties
 * first, stable for equal weights. The same other-end + type appears once even
 * when the KG holds duplicate edges (re-extraction can stack them); the
 * strongest copy wins.
 */
export function buildEntityRelations(
  nodeId: string,
  nodes: readonly GraphNode[],
  edges: readonly GraphEdge[],
  visibleNodeIds: ReadonlySet<string> | null,
): EntityRelationRow[] {
  const nameById = new Map(nodes.map((n) => [n.id, n.name]));
  const rows: EntityRelationRow[] = [];
  for (const e of edges) {
    if (e.inferred) continue;
    if (e.source !== nodeId && e.target !== nodeId) continue;
    const otherId = e.source === nodeId ? e.target : e.source;
    if (otherId === nodeId) continue;
    const otherName = nameById.get(otherId);
    if (otherName === undefined) continue;
    rows.push({
      edgeId: e.id,
      otherId,
      otherName,
      type: e.label ?? '',
      bucket: classifyRelationLabel(e.label),
      weight: e.weight ?? 0.5,
      hidden: visibleNodeIds ? !visibleNodeIds.has(otherId) : false,
    });
  }
  rows.sort(
    (a, b) =>
      b.weight - a.weight ||
      BUCKET_ORDER[a.bucket] - BUCKET_ORDER[b.bucket] ||
      a.otherName.localeCompare(b.otherName),
  );
  const seen = new Set<string>();
  return rows.filter((r) => {
    const key = `${r.otherId}|${r.type}`;
    if (seen.has(key)) return false;
    seen.add(key);
    return true;
  });
}
