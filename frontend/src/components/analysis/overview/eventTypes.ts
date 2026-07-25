import type { AnalysisListResponse, TimelineData } from '@/api/types';

export type Importance = 'KERNEL' | 'SATELLITE' | null;

export type NarrativeMode = 'present' | 'flashback' | 'flashforward' | 'parallel' | 'unknown';

const NARRATIVE_MODES: NarrativeMode[] = [
  'present',
  'flashback',
  'flashforward',
  'parallel',
  'unknown',
];

export interface OverviewEvent {
  id: string;
  title: string;
  chapter: number | null;
  importance: Importance;
  narrativeMode: NarrativeMode;
  analyzed: boolean;
  participants: number;
}

/** KERNEL first, then SATELLITE, then still-undetermined.
 *
 * The backend only fills `importance` once an EEP exists (API_CONTRACT #6b),
 * so every unanalyzed event lands in the last bucket. It is deliberately kept
 * distinct from SATELLITE rather than folded into it — "not yet judged" is not
 * the same claim as "judged peripheral". */
export function importanceRank(importance: Importance): number {
  if (importance === 'KERNEL') return 2;
  if (importance === 'SATELLITE') return 1;
  return 0;
}

export function importanceClass(importance: Importance): string {
  if (importance === 'KERNEL') return 'kernel';
  if (importance === 'SATELLITE') return 'satellite';
  return 'unknown';
}

function toNarrativeMode(raw: string | null | undefined): NarrativeMode {
  return NARRATIVE_MODES.includes(raw as NarrativeMode) ? (raw as NarrativeMode) : 'unknown';
}

/** Merge the #6b analysis list with #13a's participant lists.
 *
 * #13a returns every event's participants in one call, so neither the ranking
 * nor the backbone map needs a per-event detail fetch. */
export function buildOverviewEvents(
  evtData: AnalysisListResponse,
  timeline: TimelineData | undefined,
): OverviewEvent[] {
  const participantCount = new Map<string, number>(
    (timeline?.events ?? []).map((e) => [e.id, e.participants.length]),
  );
  const analyzed: OverviewEvent[] = evtData.analyzed.map((a) => ({
    id: a.entityId,
    title: a.title,
    chapter: a.chapter ?? null,
    importance: (a.importance ?? null) as Importance,
    narrativeMode: toNarrativeMode(a.narrativeMode),
    analyzed: true,
    participants: participantCount.get(a.entityId) ?? 0,
  }));
  const unanalyzed: OverviewEvent[] = evtData.unanalyzed.map((u) => ({
    id: u.id,
    title: u.name,
    chapter: u.chapter ?? null,
    importance: (u.importance ?? null) as Importance,
    narrativeMode: toNarrativeMode(u.narrativeMode),
    analyzed: false,
    participants: participantCount.get(u.id) ?? 0,
  }));
  return [...analyzed, ...unanalyzed].sort(
    (a, b) =>
      importanceRank(b.importance) - importanceRank(a.importance) ||
      b.participants - a.participants ||
      (a.chapter ?? Infinity) - (b.chapter ?? Infinity),
  );
}
