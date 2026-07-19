import type { GraphData } from '@/api/types';
import type { ClusteredGraph } from '@/services/kgClustering';

export interface CytoscapeElement {
  group: 'nodes' | 'edges';
  data: Record<string, unknown>;
}

function clusterSize(count: number): number {
  const min = 60;
  const max = 130;
  const clamped = Math.min(Math.max(count, 1), 50);
  return min + (max - min) * Math.sqrt(clamped / 50);
}

// Individual-view node diameter, sqrt-scaled by chunkCount (= mention
// frequency / 登場頻率). Range matches the redesign canvas's node radius
// reference (13~34px) — see docs/plans/20260718-kg-redesign-brief.md §7.
function mapSize(chunkCount: number): number {
  const min = 13;
  const max = 34;
  const clamped = Math.min(Math.max(chunkCount, 1), 100);
  return min + (max - min) * Math.sqrt(clamped / 100);
}

// ── Focus mode / label density (KG redesign Phase 1) ───────────────────────
// Tunable per docs/plans/20260718-kg-redesign-implementation.md §3 Phase 1 —
// intended to be re-calibrated against the real 264-node/506-edge test book
// during the /verify pass called out in the plan's §5.

/** Minimum degree for a selected node to trigger focus (dim) mode. */
export const FOCUS_DEGREE_THRESHOLD = 5;

/** Max number of neighbor labels shown alongside the focused node's label. */
export const FOCUS_LABEL_TOP_N = 12;

/**
 * Per-node degree (count of incident edges), derived from a flat cytoscape
 * element list. Pure — no cytoscape instance required, so it stays testable
 * and reusable both inside GraphCanvas (label/focus decisions) and in
 * graphTransform helpers below (orphan detection).
 */
export function computeDegrees(elements: CytoscapeElement[]): Map<string, number> {
  const degrees = new Map<string, number>();
  for (const el of elements) {
    if (el.group !== 'edges') continue;
    const source = el.data.source as string;
    const target = el.data.target as string;
    degrees.set(source, (degrees.get(source) ?? 0) + 1);
    degrees.set(target, (degrees.get(target) ?? 0) + 1);
  }
  return degrees;
}

/**
 * Focus-mode label allowlist: the focused node itself plus its top-N
 * neighbors ranked by degree (desc). Selecting a hub node (e.g. a
 * protagonist with 30+ edges) and showing every neighbor's label at once is
 * unreadable — see brief §3-1. Ties keep the neighbor's original order.
 */
export function selectFocusLabelIds(
  focusId: string,
  neighborIds: string[],
  degreeById: Map<string, number>,
  topN: number = FOCUS_LABEL_TOP_N,
): Set<string> {
  const sorted = [...neighborIds].sort(
    (a, b) => (degreeById.get(b) ?? 0) - (degreeById.get(a) ?? 0),
  );
  return new Set([focusId, ...sorted.slice(0, topN)]);
}

export interface OrphanNode {
  id: string;
  name: string;
  type: string;
}

/**
 * Splits degree-0 entity nodes out of the element list so they don't render
 * as a floating grid next to the main graph (brief §3-3). Cluster
 * super-nodes are left untouched — orphan handling only applies to the
 * individual (per-entity) view. Edges are never orphaned by construction
 * (an edge always implies degree >= 1 on both endpoints), so the returned
 * `connected` list is just `elements` minus the orphan node entries.
 */
export function partitionOrphanNodes(elements: CytoscapeElement[]): {
  connected: CytoscapeElement[];
  orphans: OrphanNode[];
} {
  const degrees = computeDegrees(elements);
  const orphans: OrphanNode[] = [];
  const connected: CytoscapeElement[] = [];
  for (const el of elements) {
    if (el.group === 'nodes' && !el.data.cluster) {
      const id = el.data.id as string;
      if ((degrees.get(id) ?? 0) === 0) {
        orphans.push({
          id,
          name: (el.data.label as string) ?? '',
          type: (el.data.entityType as string) ?? 'other',
        });
        continue;
      }
    }
    connected.push(el);
  }
  return { connected, orphans };
}

// ── Edge semantic coloring ──────────────────────────────────────────────
// `edge.label` on the wire is the raw RelationType enum value (see
// backend/storysphere/domain/relations.py) — english snake_case, not a
// display string. Classify it into a coloring bucket; callers resolve the
// bucket to an actual token color via readCssVar (cytoscape only accepts
// hex/rgb, never CSS var()).
export const POSITIVE_RELATION_LABELS = ['ally', 'family', 'friendship', 'member_of', 'romance'] as const;
export const NEGATIVE_RELATION_LABELS = ['enemy'] as const;

export type RelationColorBucket = 'positive' | 'negative' | 'neutral';

export function classifyRelationLabel(label: string | undefined | null): RelationColorBucket {
  if (!label) return 'neutral';
  if ((POSITIVE_RELATION_LABELS as readonly string[]).includes(label)) return 'positive';
  if ((NEGATIVE_RELATION_LABELS as readonly string[]).includes(label)) return 'negative';
  return 'neutral';
}

export function toCytoscapeElements(graphData: GraphData): CytoscapeElement[] {
  const elements: CytoscapeElement[] = [];

  for (const node of graphData.nodes) {
    elements.push({
      group: 'nodes',
      data: {
        id: node.id,
        label: node.name,
        entityType: node.type,
        size: mapSize(node.chunkCount),
        chunkCount: node.chunkCount,
        description: node.description,
        eventType: node.eventType,
        chapter: node.chapter,
      },
    });
  }

  for (const edge of graphData.edges) {
    const w = edge.weight ?? 0.5;
    elements.push({
      group: 'edges',
      data: {
        id: edge.id,
        source: edge.source,
        target: edge.target,
        label: edge.label ?? '',
        weight: w,
        edgeLength: 190 - 100 * w,
        inferred: edge.inferred ?? false,
        inferredId: edge.inferredId ?? null,
        confidence: edge.confidence ?? null,
      },
    });
  }

  return elements;
}

export function toClusteredCytoscapeElements(
  clustered: ClusteredGraph,
  labelFor: (clusterType: string, count: number) => string,
): CytoscapeElement[] {
  const elements: CytoscapeElement[] = [];

  for (const sn of clustered.superNodes) {
    elements.push({
      group: 'nodes',
      data: {
        id: sn.id,
        label: labelFor(sn.clusterType, sn.count),
        cluster: true,
        clusterType: sn.clusterType,
        count: sn.count,
        memberIds: sn.memberIds,
        topMembers: sn.topMembers,
        size: clusterSize(sn.count),
      },
    });
  }

  for (const edge of clustered.edges) {
    elements.push({
      group: 'edges',
      data: {
        id: edge.id,
        source: edge.source,
        target: edge.target,
        label: edge.weight > 1 ? String(edge.weight) : '',
        weight: edge.weight,
        edgeLength: Math.max(80, 200 - edge.weight * 6),
        aggregated: true,
        inferredCount: edge.inferredCount,
        isRivalry: edge.isRivalry ?? false,
      },
    });
  }

  return elements;
}
