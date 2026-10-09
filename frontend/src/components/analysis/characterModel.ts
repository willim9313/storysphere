/**
 * 角色分析頁（DS v3 第 3 批 · 09）的純邏輯。UI 檔只負責呈現，這裡的規則各有測試。
 *
 * 內容：
 * - 派系依人數排名配色（類別色，最多 5 色，第 6 個起併入「其他」）與點圖例單獨亮出
 * - 語氣分布的三段對應語氣家族色、「≥8% 才寫標籤」
 * - 弧線階段的錯行（相鄰階段共享邊界章才錯行）
 * - 原型信心度檔位、「未生成」與「生成失敗」的判定
 * - 象限在 metrics 載入中／失敗時的區分
 * - 原型名稱在書本語言與介面語言之間的對照（以原型 id 為準）
 */

import { getFrameworks } from '@/data/frameworksData';

// ── 左欄提及量長條 ────────────────────────────────────────────

/** 平方根尺度：6 + 94·√(m/max)，單位 px（左欄 100px 長條）。公式不因欄寬而縮。 */
export function mentionBarWidth(mentions: number, max: number): number {
  if (max <= 0) return 6;
  return 6 + 94 * Math.sqrt(Math.max(0, mentions) / max);
}

// ── 派系：依人數排名配色 ──────────────────────────────────────

/** 類別色的排名槽數（深／淺／深／淺／深）。第 6 名起併入「其他」。 */
export const FACTION_SLOTS = 5;

export interface FactionLike {
  id: string;
  label: string;
  memberIds?: string[] | null;
  topMemberNames?: string[] | null;
}

export interface RankedFaction {
  /** 在後端 `factions[]` 的位置（也是 `applyFactionsAndMetrics` 寫進角色的 factionIndex）。 */
  index: number;
  id: string;
  label: string;
  memberCount: number;
  topMemberNames: string[];
  /** 0…4 ＝ cat-1…cat-5；null ＝ 併入「其他」。 */
  slot: number | null;
}

/**
 * 派系依人數由多到少排名。同數時以「首次出現的章節先後」為準，但 #6d 沒有章節資料，
 * 所以退回後端回傳順序（排序穩定，index 小的在前）。
 */
export function rankFactions(factions: readonly FactionLike[]): RankedFaction[] {
  return factions
    .map((f, index) => ({
      index,
      id: f.id,
      label: f.label,
      memberCount: f.memberIds?.length ?? 0,
      topMemberNames: f.topMemberNames ?? [],
    }))
    .sort((a, b) => b.memberCount - a.memberCount || a.index - b.index)
    .map((f, rank) => ({ ...f, slot: rank < FACTION_SLOTS ? rank : null }));
}

export interface FactionLegendModel {
  /** 前 5 名，已按排名排列。 */
  slotted: RankedFaction[];
  /** 第 6 名起被併入「其他」的派系。 */
  merged: RankedFaction[];
  /** 「其他」涵蓋的總人數。 */
  mergedMemberCount: number;
}

export function buildFactionLegend(ranked: readonly RankedFaction[]): FactionLegendModel {
  const slotted = ranked.filter((f) => f.slot !== null);
  const merged = ranked.filter((f) => f.slot === null);
  return {
    slotted,
    merged,
    mergedMemberCount: merged.reduce((sum, f) => sum + f.memberCount, 0),
  };
}

/** 圖上標記的色票名：`cat-1`…`cat-5`、`cat-other`；沒有派系回 null（只描邊）。 */
export type CategoricalToken = `cat-${1 | 2 | 3 | 4 | 5}` | 'cat-other';

export function factionToken(
  factionIndex: number | null,
  ranked: readonly RankedFaction[],
): CategoricalToken | null {
  if (factionIndex === null) return null;
  const f = ranked.find((r) => r.index === factionIndex);
  if (!f) return null;
  return f.slot === null ? 'cat-other' : (`cat-${f.slot + 1}` as CategoricalToken);
}

/** 點圖例單獨亮出：單一派系，或「其他」整組。再點同一項取消（回 null）。 */
export type FactionSelection = { kind: 'faction'; index: number } | { kind: 'other' } | null;

export function toggleFactionSelection(
  current: FactionSelection,
  next: Exclude<FactionSelection, null>,
): FactionSelection {
  if (current?.kind === 'other' && next.kind === 'other') return null;
  if (current?.kind === 'faction' && next.kind === 'faction' && current.index === next.index) return null;
  return next;
}

/** 其餘泡泡降到的 opacity（沿用圖譜的 dim-on-select）。 */
export const DIMMED_OPACITY = 0.3;

/** 有選取時，沒被選中的角色要變暗。無派系的角色在任何選取下都算「其餘」。 */
export function isDimmed(
  selection: FactionSelection,
  factionIndex: number | null,
  ranked: readonly RankedFaction[],
): boolean {
  if (!selection) return false;
  if (factionIndex === null) return true;
  if (selection.kind === 'faction') return factionIndex !== selection.index;
  const f = ranked.find((r) => r.index === factionIndex);
  return !f || f.slot !== null;
}

// ── 語氣分布 ──────────────────────────────────────────────────

/** 語氣家族（README §2.5）。順序＝圖上片段的固定排列順序（溫暖 → 激動）。 */
export const TONE_FAMILIES = ['warm', 'inquiry', 'steady', 'cold', 'irony', 'agitated'] as const;
export type ToneFamily = (typeof TONE_FAMILIES)[number];

/**
 * 後端 `tone_distribution` 只有標點算出的三段（不是語氣詞），所以只用到三個家族：
 * 陳述→平穩、疑問→探詢、感嘆→激動。對不上的標籤歸「未歸類」，只描邊、照寫原詞。
 */
const TONE_LABEL_TO_FAMILY: Record<string, ToneFamily> = {
  declarative: 'steady',
  interrogative: 'inquiry',
  exclamatory: 'agitated',
};

export function toneFamilyOf(label: string): ToneFamily | null {
  return TONE_LABEL_TO_FAMILY[label] ?? null;
}

export interface ToneSegment {
  label: string;
  value: number;
  /** null ＝ 未歸類（只描邊）。 */
  family: ToneFamily | null;
}

/** 依家族固定順序排列，同族相鄰；未歸類排最後。排序穩定。 */
export function orderTones(distribution: readonly { label: string; value: number }[]): ToneSegment[] {
  const rank = (s: ToneSegment) => (s.family === null ? TONE_FAMILIES.length : TONE_FAMILIES.indexOf(s.family));
  return distribution
    .map((d) => ({ label: d.label, value: d.value, family: toneFamilyOf(d.label) }))
    .sort((a, b) => rank(a) - rank(b));
}

/** 片段 ≥8% 才在片段內寫標籤，其餘只進圖例（避免窄片段壓字）。 */
export const TONE_LABEL_MIN = 0.08;
export function showToneLabel(value: number): boolean {
  return value >= TONE_LABEL_MIN;
}

// ── 弧線 ──────────────────────────────────────────────────────

/** 「a-b」或單章「n」（後者視為 [n, n]，一章長的階段也要畫色帶）。 */
export function parseChapterRange(range: string): [number, number] | null {
  const raw = range.split(/[-–—]/).map((s) => s.trim());
  if (raw.length > 2 || raw.some((s) => s === '')) return null;
  const parts = raw.map(Number);
  if (parts.some((n) => !Number.isFinite(n))) return null;
  const [a, b = a] = parts;
  return a <= b ? [a, b] : [b, a];
}

/**
 * 錯行堆疊：階段由前往後放，只有和同一行已放的階段共享章（含邊界章）時才換到下一行；
 * 沒有重疊的階段留在同一行。解析不了的範圍放第 0 行。
 */
export function assignArcRows(ranges: readonly ([number, number] | null)[]): number[] {
  const rows: [number, number][][] = [];
  return ranges.map((r) => {
    if (!r) return 0;
    let row = 0;
    while (rows[row]?.some(([a, b]) => r[0] <= b && a <= r[1])) row += 1;
    rows[row] = [...(rows[row] ?? []), r];
    return row;
  });
}

// ── 人格 ──────────────────────────────────────────────────────

export type ConfidenceBand = 'high' | 'mid' | 'low';

/** 門檻 ≥80 高、≥50 中、其餘低。 */
export function confidenceBand(pct: number): ConfidenceBand {
  if (pct >= 80) return 'high';
  if (pct >= 50) return 'mid';
  return 'low';
}

export type ArchetypeState = 'ready' | 'failed' | 'notGenerated';

/** 「未生成」（還沒做，走重生成）與「生成失敗」（做了但壞了，走重試失敗部分）是兩件事，由 failedParts 決定。 */
export function archetypeState(
  data: { archetypes: readonly { framework: string }[]; failedParts?: readonly string[] | null },
  framework: string,
): ArchetypeState {
  if (data.archetypes.some((a) => a.framework === framework)) return 'ready';
  return (data.failedParts ?? []).includes(`archetype:${framework}`) ? 'failed' : 'notGenerated';
}

// ── 象限 ──────────────────────────────────────────────────────

export type QuadrantStatus = 'loading' | 'unavailable' | 'ready';

/** metrics 還在載入時不能閃出「資料暫時無法取得」；載入完仍畫不出任何泡泡才是第四種錯誤。 */
export function quadrantStatus(metricsLoading: boolean, plottedCount: number): QuadrantStatus {
  if (metricsLoading) return 'loading';
  return plottedCount === 0 ? 'unavailable' : 'ready';
}

// ── 原型名稱（書本語言 ↔ 介面語言）────────────────────────────

/**
 * 後端回的原型名是**書本語言**（中文書 →「統治者」），介面語言可能不同。
 * 中英兩套原型表共用 id（`ruler`），所以先把名稱對回 id，再依介面語言取名。
 */
const archetypeIndexCache = new Map<string, Map<string, string>>();

function archetypeIndex(framework: string): Map<string, string> {
  const cached = archetypeIndexCache.get(framework);
  if (cached) return cached;
  const index = new Map<string, string>();
  for (const lang of ['zh-TW', 'en']) {
    const fw = getFrameworks(lang).find((f) => f.key === framework);
    fw?.items.forEach((item) => index.set(item.name.trim().toLowerCase(), item.id));
  }
  archetypeIndexCache.set(framework, index);
  return index;
}

/** 名稱 → 原型 id；對不到（LLM 寫了變體）回 null。 */
export function archetypeIdOf(framework: string, name: string | null | undefined): string | null {
  if (!name) return null;
  return archetypeIndex(framework).get(name.trim().toLowerCase()) ?? null;
}

/** 篩選與計數用的鍵：對得到 id 用 id，否則退回原名（不讓資料整筆消失）。 */
export function archetypeKey(framework: string, name: string | null | undefined): string {
  return archetypeIdOf(framework, name) ?? name ?? '';
}

/** 依介面語言顯示原型名；對不到 id 時照原名顯示。 */
export function archetypeDisplayName(
  framework: string,
  name: string | null | undefined,
  lang: string,
): string {
  const id = archetypeIdOf(framework, name);
  if (!id) return name ?? '';
  const item = getFrameworks(lang).find((f) => f.key === framework)?.items.find((i) => i.id === id);
  return item?.name ?? name ?? '';
}

