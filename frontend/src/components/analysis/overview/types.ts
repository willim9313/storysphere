import type { AnalysisListResponse } from '@/api/types';
import type { CharacterMetricsResponse } from '@/api/characterMetrics';
import type { FactionAnalysisResponse } from '@/api/factions';

/** Unified per-character view-model for the overview landing (both the
 * quadrant and ranking views), merging #6a (list + mentionCount), #6d
 * (faction membership) and #6e (pagerank/degree). Real data only — no mock
 * fallbacks, per the 2026-07-17 design-finalisation review. */
export interface OverviewCharacter {
  entityId: string;
  name: string;
  analyzed: boolean;
  status?: 'complete' | 'partial';
  mentionCount: number;
  /** Index into the #6d `factions[]` array; null = unaffiliated. */
  factionIndex: number | null;
  pagerank?: number;
  degree?: number;
}

export function buildOverviewCharacters(charData: AnalysisListResponse): OverviewCharacter[] {
  const analyzed: OverviewCharacter[] = charData.analyzed.map((a) => ({
    entityId: a.entityId,
    name: a.title,
    analyzed: true,
    status: a.status as 'complete' | 'partial' | undefined,
    mentionCount: a.mentionCount,
    factionIndex: null,
  }));
  const unanalyzed: OverviewCharacter[] = charData.unanalyzed.map((u) => ({
    entityId: u.id,
    name: u.name,
    analyzed: false,
    mentionCount: u.mentionCount,
    factionIndex: null,
  }));
  return [...analyzed, ...unanalyzed];
}

/** Mutates faction/metric fields onto the merged list in place (avoids a
 * second array allocation for books with ~100 characters). */
export function applyFactionsAndMetrics(
  characters: OverviewCharacter[],
  factions: FactionAnalysisResponse | undefined,
  metrics: CharacterMetricsResponse | undefined,
): OverviewCharacter[] {
  const factionByEntity = new Map<string, number>();
  factions?.factions?.forEach((f, i) => {
    f.memberIds?.forEach((id) => factionByEntity.set(id, i));
  });
  const metricByEntity = new Map<string, { pagerank: number; degree: number }>();
  metrics?.metrics?.forEach((m) => metricByEntity.set(m.entityId, m));

  return characters.map((c) => {
    const metric = metricByEntity.get(c.entityId);
    return {
      ...c,
      factionIndex: factionByEntity.get(c.entityId) ?? null,
      pagerank: metric?.pagerank,
      degree: metric?.degree,
    };
  });
}

export function median(values: number[]): number {
  if (values.length === 0) return 0;
  const sorted = [...values].sort((a, b) => a - b);
  const mid = Math.floor(sorted.length / 2);
  return sorted.length % 2 ? sorted[mid] : (sorted[mid - 1] + sorted[mid]) / 2;
}
