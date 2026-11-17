export interface Segment {
  id: string;
  characterId: string;
  start: number;
  end: number;
  phase: string;
  description: string;
}

interface ArcRow {
  characterId: string;
  laneCount: number;
  segments: { segment: Segment; lane: number }[];
}

/**
 * 依角色分列（保留第一次出現的順序），同一角色內章節重疊的段往下疊：
 * 依起點排序，放進第一條「最後一段已結束」的 lane。
 */
export function assignLanes(segments: Segment[]): ArcRow[] {
  const byCharacter = new Map<string, Segment[]>();
  for (const s of segments) {
    const list = byCharacter.get(s.characterId) ?? [];
    list.push(s);
    byCharacter.set(s.characterId, list);
  }
  return [...byCharacter].map(([characterId, list]) => {
    const laneEnds: number[] = [];
    const placed = [...list]
      .sort((a, b) => a.start - b.start || a.end - b.end)
      .map((segment) => {
        let lane = laneEnds.findIndex((end) => end < segment.start);
        if (lane === -1) lane = laneEnds.length;
        laneEnds[lane] = segment.end;
        return { segment, lane };
      });
    return { characterId, laneCount: Math.max(1, laneEnds.length), segments: placed };
  });
}
