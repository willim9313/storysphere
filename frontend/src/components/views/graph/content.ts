// 把 API 回的 `content`（camelCase、型別是 unknown）收成 view 要用的形狀（01 的欄位）。

/** view 共用的最小證據形狀：useEvidenceByType 與 useViewData 的 primary 都符合。 */
export interface EvidenceLike {
  id: string;
  claimType: string;
  summary: string;
  discourseChapter: number | null;
  createdAt?: string;
  content?: Record<string, unknown> | null;
}

/** N-04e 的 `referenced`：只有標籤用的欄位。 */
export interface ReferencedLike {
  id: string;
  claimType: string;
  label: string;
  discourseChapter: number | null;
}

const str = (v: unknown): string | null => (typeof v === 'string' ? v : null);
const num = (v: unknown): number | null => (typeof v === 'number' && Number.isFinite(v) ? v : null);

export interface EventNode {
  id: string;
  title: string;
  description: string;
  chapter: number | null;
  textRank: number | null;
}

export function toEvent(item: EvidenceLike): EventNode {
  const c = item.content ?? {};
  return {
    id: item.id,
    title: str(c.title) ?? item.summary,
    description: str(c.description) ?? '',
    chapter: num(c.chapter) ?? item.discourseChapter,
    textRank: num(c.textRank),
  };
}

export function referencedEvent(ref: ReferencedLike): EventNode {
  return { id: ref.id, title: ref.label, description: '', chapter: ref.discourseChapter, textRank: null };
}

export interface CausalLink {
  id: string;
  cause: string;
  effect: string;
  linkType: string;
  strength: number;
}

export function toCausalLink(item: EvidenceLike): CausalLink | null {
  const c = item.content ?? {};
  const cause = str(c.causeEventId);
  const effect = str(c.effectEventId);
  if (!cause || !effect) return null;
  return { id: item.id, cause, effect, linkType: str(c.linkType) ?? '', strength: num(c.strength) ?? 0.5 };
}

export interface EventRole {
  id: string;
  eventId: string;
  weight: 'kernel' | 'satellite';
  rationale: string;
}

export function toEventRole(item: EvidenceLike): EventRole | null {
  const c = item.content ?? {};
  const eventId = str(c.eventId);
  const weight = c.weight === 'kernel' || c.weight === 'satellite' ? c.weight : null;
  if (!eventId || !weight) return null;
  return { id: item.id, eventId, weight, rationale: str(c.rationale) ?? item.summary };
}

export interface Faction {
  id: string;
  label: string;
  memberIds: string[];
}

export interface InterFaction {
  a: string;
  b: string;
  cooperation: number;
  rivalry: number;
}

export interface RelationNetwork {
  id: string;
  factions: Faction[];
  interFaction: InterFaction[];
  centrality: Record<string, number>;
  modularity: number | null;
}

const arr = (v: unknown): unknown[] => (Array.isArray(v) ? v : []);
const rec = (v: unknown): Record<string, unknown> => (v && typeof v === 'object' ? (v as Record<string, unknown>) : {});

export function toRelationNetwork(item: EvidenceLike): RelationNetwork {
  const c = item.content ?? {};
  const factions = arr(c.factions).map((f) => {
    const r = rec(f);
    return {
      id: str(r.id) ?? '',
      label: str(r.label) ?? str(r.id) ?? '',
      memberIds: arr(r.memberIds).filter((m): m is string => typeof m === 'string'),
    };
  });
  const interFaction = arr(c.interFaction).map((x) => {
    const r = rec(x);
    return { a: str(r.a) ?? '', b: str(r.b) ?? '', cooperation: num(r.cooperation) ?? 0, rivalry: num(r.rivalry) ?? 0 };
  });
  const centrality: Record<string, number> = {};
  for (const [k, v] of Object.entries(rec(c.centrality))) {
    const n = num(v);
    if (n !== null) centrality[k] = n;
  }
  return { id: item.id, factions: factions.filter((f) => f.id), interFaction, centrality, modularity: num(c.modularity) };
}

export function characterName(item: EvidenceLike): string {
  return str(item.content?.canonicalName) ?? item.summary;
}
