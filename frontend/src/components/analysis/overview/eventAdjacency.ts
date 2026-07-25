import type { TimelineData } from '@/api/types';
import type { OverviewEvent } from './eventTypes';

/** One adjacent event, with why it is adjacent. */
export interface Neighbour {
  event: OverviewEvent;
  /** Absolute chapter distance from the anchor event. */
  chapterDelta: number;
  /** Names of the participants both events share. */
  shared: string[];
  /** IDF-style weight: sharing a rare participant says more than sharing a hub. */
  score: number;
}

export interface EventAdjacency {
  prior: (eventId: string) => Neighbour[];
  subsequent: (eventId: string) => Neighbour[];
}

const EMPTY: EventAdjacency = { prior: () => [], subsequent: () => [] };

/** Ranking rule (plan §7 U4).
 *
 * Adjacency here means what the backend means by prior/subsequent: another
 * event that shares at least one participant and sits in an earlier/later
 * chapter. On real data that is very low-precision — hub characters appear in
 * dozens of events, so a single event can have 40+ neighbours and "shared
 * participant count" barely discriminates (most ties at 1).
 *
 * So neighbours are ordered by:
 *   1. chapter proximity — nearest chapter first, the plain reading of
 *      "context around this event";
 *   2. IDF weight — among equally distant events, sharing a rare participant
 *      (五牙大艦, in 2 events) is more informative than sharing a hub
 *      (寇仲, in 44).
 *
 * Callers cap the list; the full set is never worth showing.
 */
export function buildAdjacency(
  events: OverviewEvent[],
  timeline: TimelineData | undefined,
): EventAdjacency {
  const timelineEvents = timeline?.events ?? [];
  if (timelineEvents.length === 0) return EMPTY;

  const byId = new Map(events.map((e) => [e.id, e]));
  const participantsOf = new Map<string, { id: string; name: string }[]>();
  const freq = new Map<string, number>();

  for (const te of timelineEvents) {
    const parts = te.participants ?? [];
    participantsOf.set(te.id, parts.map((p) => ({ id: p.id, name: p.name })));
    for (const p of parts) freq.set(p.id, (freq.get(p.id) ?? 0) + 1);
  }

  const weight = (participantId: string) => 1 / Math.log(1 + (freq.get(participantId) ?? 1));

  const neighboursOf = (eventId: string, direction: 'prior' | 'subsequent'): Neighbour[] => {
    const anchor = byId.get(eventId);
    const anchorParts = participantsOf.get(eventId);
    if (!anchor || anchor.chapter === null || !anchorParts?.length) return [];
    const anchorIds = new Set(anchorParts.map((p) => p.id));

    const out: Neighbour[] = [];
    for (const [otherId, otherParts] of participantsOf) {
      if (otherId === eventId) continue;
      const other = byId.get(otherId);
      if (!other || other.chapter === null) continue;
      const earlier = other.chapter < anchor.chapter;
      const later = other.chapter > anchor.chapter;
      if (direction === 'prior' ? !earlier : !later) continue;

      const shared = otherParts.filter((p) => anchorIds.has(p.id));
      if (shared.length === 0) continue;

      out.push({
        event: other,
        chapterDelta: Math.abs(other.chapter - anchor.chapter),
        shared: shared.map((p) => p.name),
        score: shared.reduce((sum, p) => sum + weight(p.id), 0),
      });
    }

    return out.sort(
      (a, b) => a.chapterDelta - b.chapterDelta || b.score - a.score || a.event.id.localeCompare(b.event.id),
    );
  };

  return {
    prior: (id) => neighboursOf(id, 'prior'),
    subsequent: (id) => neighboursOf(id, 'subsequent'),
  };
}

/** Chains for the overview "事件脈絡" view.
 *
 * Follows each event's top-ranked subsequent neighbour, so the sequence is
 * deterministic rather than "whichever id happened to be first" — with 40+
 * candidates per event, an unranked walk is effectively random.
 *
 * Restricted to analyzed events: the view exists to show how analysed events
 * connect, and including the unanalysed majority would bury them.
 */
export function buildContextChains(
  events: OverviewEvent[],
  adjacency: EventAdjacency,
): OverviewEvent[][] {
  const analyzed = events.filter((e) => e.analyzed && e.chapter !== null);
  const ids = new Set(analyzed.map((e) => e.id));
  const nextOf = new Map<string, string | undefined>();
  const hasPrior = new Set<string>();

  for (const e of analyzed) {
    const next = adjacency.subsequent(e.id).find((n) => ids.has(n.event.id));
    nextOf.set(e.id, next?.event.id);
    if (next) hasPrior.add(next.event.id);
  }

  const visited = new Set<string>();
  const chains: OverviewEvent[][] = [];
  const walk = (startId: string) => {
    const chain: OverviewEvent[] = [];
    let cursor: string | undefined = startId;
    while (cursor && !visited.has(cursor)) {
      visited.add(cursor);
      const ev = analyzed.find((e) => e.id === cursor);
      if (!ev) break;
      chain.push(ev);
      cursor = nextOf.get(cursor);
    }
    if (chain.length > 0) chains.push(chain);
  };

  // Heads first (nothing points at them), then anything left in a cycle.
  for (const e of analyzed) if (!hasPrior.has(e.id)) walk(e.id);
  for (const e of analyzed) if (!visited.has(e.id)) walk(e.id);

  return chains.filter((c) => c.length > 1);
}
