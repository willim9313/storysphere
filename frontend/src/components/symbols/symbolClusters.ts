/**
 * Groups of symbols that carry something together.
 *
 * The redesign calls these 意象叢: allies read side by side on one chapter axis,
 * answering "what do these carry between them" rather than "who is related to
 * whom" — that second question belongs to the knowledge graph page, and this
 * module deliberately does not answer it. No edges, no communities, no layout.
 *
 * The design prototype built a cluster from a seed's five strongest allies. Real
 * data will not support that: of 名字的潮汐's 11 ranked symbols, only nine ally
 * pairs share more than one paragraph, and 懷錶's five strongest allies each share
 * exactly one. Top-N would manufacture a cluster out of single co-occurrences,
 * which is the same mistake as ranking the single-occurrence tail.
 */

import type { SymbolAnalysis, SymbolSignals } from './symbolSignals';

/**
 * Shared paragraphs an alliance needs before it counts.
 *
 * One shared paragraph is a coincidence two symbols had in common once. The
 * co-occurrence panel still lists those — this is about what deserves a group.
 */
export const ALLY_MIN_COUNT = 2;

/**
 * Qualifying allies a seed needs to head a cluster.
 *
 * Below two, the "cluster" is one pair, which the co-occurrence card already
 * shows as a row. A group has to be more than an edge to be worth a view.
 */
export const CLUSTER_MIN_ALLIES = 2;

export interface ClusterMember {
  signals: SymbolSignals;
  /** Shared paragraphs with the seed. Null for the seed itself. */
  withSeed: number | null;
}

export interface SymbolCluster {
  /** The symbol the cluster is centred on; also its id. */
  seed: SymbolSignals;
  /** Seed first, then allies by descending strength. */
  members: ClusterMember[];
  /**
   * Body chapters where the most members appear at once, and how many that is.
   *
   * The cluster's reason for existing: if four of five members converge on one
   * chapter, that chapter is doing something the symbols only hint at singly.
   */
  hotChapters: number[];
  hotCount: number;
}

/** Body chapters shared by the most members, and how many members that is. */
function findHotChapters(members: ClusterMember[]): { hotChapters: number[]; hotCount: number } {
  const perChapter = new Map<number, number>();
  for (const member of members) {
    for (const chapter of member.signals.distribution.bodyChapters) {
      perChapter.set(chapter, (perChapter.get(chapter) ?? 0) + 1);
    }
  }
  let hotCount = 0;
  for (const count of perChapter.values()) hotCount = Math.max(hotCount, count);
  // Only a convergence counts. Every member having its own chapter is the absence
  // of a shared landing point, not a landing point shared by one.
  if (hotCount < 2) return { hotChapters: [], hotCount: 0 };
  const hotChapters = [...perChapter.entries()]
    .filter(([, count]) => count === hotCount)
    .map(([chapter]) => chapter)
    .sort((a, b) => a - b);
  return { hotChapters, hotCount };
}

function buildCluster(seed: SymbolSignals, byId: Map<string, SymbolSignals>): SymbolCluster | null {
  const allies = (seed.item.co_occurring_imagery ?? [])
    .filter((a) => a.co_occurrence_count >= ALLY_MIN_COUNT)
    .sort((a, b) => b.co_occurrence_count - a.co_occurrence_count);

  const members: ClusterMember[] = [{ signals: seed, withSeed: null }];
  for (const ally of allies) {
    const signals = byId.get(ally.imagery_id);
    // `byId` covers the ranked list only, so a single-occurrence ally is dropped
    // here by construction — it would be a row with one cell on an axis whose
    // whole point is shape. It can still reach the count threshold: two
    // occurrences of a word can both sit beside the same symbol.
    if (signals) members.push({ signals, withSeed: ally.co_occurrence_count });
  }
  if (members.length - 1 < CLUSTER_MIN_ALLIES) return null;

  return { seed, members, ...findHotChapters(members) };
}

/**
 * Every distinct cluster in the book, strongest seed first.
 *
 * Seeds are taken in load order and a cluster is dropped when its members are all
 * present in one already kept. On 名字的潮汐 that removes 泥叢 — 泥 allies only with
 * 海 and 手, both already inside 海叢 — while keeping 海叢 and 手叢, which share
 * three members but pull in different ones (沙／光 against 鹽／水). Without the
 * check the page offers the reader the same five symbols under three names.
 */
export function findClusters(analysis: SymbolAnalysis): SymbolCluster[] {
  const byId = new Map(analysis.main.map((s) => [s.id, s]));
  const kept: SymbolCluster[] = [];

  for (const seed of analysis.main) {
    const cluster = buildCluster(seed, byId);
    if (cluster === null) continue;
    const ids = new Set(cluster.members.map((m) => m.signals.id));
    const contained = kept.some((other) => {
      const otherIds = new Set(other.members.map((m) => m.signals.id));
      return [...ids].every((id) => otherIds.has(id));
    });
    if (!contained) kept.push(cluster);
  }
  return kept;
}
