import type { BuildOverviewEdge, BuildOverviewNode, NodeStatus } from '@/api/buildOverview';

/**
 * 建構概覽（DS v3 第 4 批 · 13）的純邏輯：DAG 幾何、選取三層、刪除表、完成度、
 * 細節面板的動作模式。頁面只負責畫；能脫離 React 測的都在這裡。
 *
 * 幾何值取自決議紀錄 13 canvas 原始碼（`dagSvg`）：五欄各 184、節點框 150×36、
 * 列距 56、SVG 920×586。寬度方向改依實際像素排（`dagGeometry`），高度照稿。
 */

// ── DAG 幾何 ─────────────────────────────────────────────────

export const SVG_H = 586;
export const NODE_H = 36;
export const LAYERS = [0, 1, 2, 3, 4] as const;

/** 稿的畫布寬（五欄各 184）。量到實際寬度之前先用它。 */
export const DESIGN_W = 920;
const NODE_W_MAX = 150;
/** 最長的節點名（en「Narrative Structure」114px）加右側狀態記號還放得下。 */
const NODE_W_MIN = 132;
/** 欄距扣掉節點寬後至少留這麼多給邊線。 */
const COLUMN_GAP_MIN = 16;
/** 比這窄就不再壓縮，改橫向捲動：5 × (132 + 16)。 */
export const DAG_MIN_W = 5 * (NODE_W_MIN + COLUMN_GAP_MIN);

export interface DagGeometry {
  /** 畫布寬，也是 viewBox 寬：SVG 以實際像素畫，字級不跟著縮放。 */
  width: number;
  nodeW: number;
  /** 五欄的中心 x。 */
  columnCx: readonly number[];
  /** 虛線群組框「KG 特徵 · 同一次重跑」，圈住 L1 row 3–8。 */
  kgGroupBox: { x: number; y: number; w: number; h: number };
}

/**
 * The canvas laid out for `available` px. Columns split the width evenly; the
 * node box narrows from 150 to 132 before the canvas stops shrinking at
 * DAG_MIN_W and scrolls instead. At DESIGN_W this is the comp's geometry.
 */
export function dagGeometry(available: number): DagGeometry {
  const width = Math.max(DAG_MIN_W, Math.round(available));
  const pitch = width / LAYERS.length;
  const nodeW = Math.max(NODE_W_MIN, Math.min(NODE_W_MAX, Math.floor(pitch - 20)));
  const columnCx = LAYERS.map((l) => pitch * (l + 0.5));
  return {
    width,
    nodeW,
    columnCx,
    kgGroupBox: {
      x: columnCx[1] - nodeW / 2 - 10,
      y: rowY(3) - 6,
      w: nodeW + 20,
      h: rowY(8) + NODE_H + 8 - (rowY(3) - 6),
    },
  };
}

export const DESIGN_GEOMETRY = dagGeometry(DESIGN_W);

export function rowY(row: number): number {
  return 26 + row * 56;
}

/** 回頭邊繞行的水平線 y：最後一列節點下方。 */
export const BACK_EDGE_Y = rowY(8) + NODE_H + 26;

/** 27 個節點的欄（layer）與列（row）。照稿列序，id 與層位照契約寫死。 */
export const NODE_SLOT: Readonly<Record<string, { layer: number; row: number }>> = {
  book_meta: { layer: 0, row: 0 },
  chapters: { layer: 0, row: 1 },
  paragraphs: { layer: 0, row: 2 },

  summaries: { layer: 1, row: 0 },
  keywords: { layer: 1, row: 1 },
  symbols: { layer: 1, row: 2 },
  kg_entity: { layer: 1, row: 3 },
  kg_concept: { layer: 1, row: 4 },
  kg_concept_inferred: { layer: 1, row: 5 },
  kg_relation: { layer: 1, row: 6 },
  kg_event: { layer: 1, row: 7 },
  kg_temporal_relation: { layer: 1, row: 8 },

  cep: { layer: 2, row: 3 },
  eep: { layer: 2, row: 4 },
  teu: { layer: 2, row: 5 },
  sep: { layer: 2, row: 6 },

  character_analysis_result: { layer: 3, row: 0 },
  voice_profile: { layer: 3, row: 1 },
  causality_analysis: { layer: 3, row: 2 },
  impact_analysis: { layer: 3, row: 3 },
  narrative_structure: { layer: 3, row: 4 },
  hero_journey_stage: { layer: 3, row: 5 },
  tension_lines: { layer: 3, row: 6 },
  symbol_analysis_result: { layer: 3, row: 7 },
  temporal_analysis: { layer: 3, row: 8 },

  tension_theme: { layer: 4, row: 3 },
  chronological_rank: { layer: 4, row: 5 },
};

/** 虛線群組框「KG 特徵 · 同一次重跑」圈住的 L1 節點（row 3–8）。 */
export const KG_CHILD_IDS: ReadonlySet<string> = new Set([
  'kg_entity',
  'kg_concept',
  'kg_concept_inferred',
  'kg_relation',
  'kg_event',
  'kg_temporal_relation',
]);

export function nodeBox(
  nodeId: string,
  g: DagGeometry = DESIGN_GEOMETRY,
): { x: number; y: number; layer: number; row: number } | null {
  const slot = NODE_SLOT[nodeId];
  if (!slot) return null;
  return { x: g.columnCx[slot.layer] - g.nodeW / 2, y: rowY(slot.row), ...slot };
}

// ── 鍵盤移動（roving tabindex） ──────────────────────────────

export type NavDirection = 'up' | 'down' | 'left' | 'right' | 'first' | 'last';

/**
 * The node an arrow key moves to, by layout: up/down within the column,
 * left/right to the nearest row in the next column that has any node (ties go
 * to the upper one), Home/End to the first/last node in column-then-row order.
 * Only nodes in `present` (the ones the manifest drew) count. Null at an edge.
 */
export function neighborNode(
  nodeId: string,
  direction: NavDirection,
  present: ReadonlySet<string>,
): string | null {
  const slots = [...present]
    .filter((id) => NODE_SLOT[id])
    .map((id) => ({ id, ...NODE_SLOT[id] }))
    .sort((a, b) => a.layer - b.layer || a.row - b.row);
  if (slots.length === 0) return null;
  if (direction === 'first') return slots[0].id;
  if (direction === 'last') return slots[slots.length - 1].id;

  const here = slots.find((s) => s.id === nodeId);
  if (!here) return null;

  if (direction === 'up' || direction === 'down') {
    const column = slots.filter((s) => s.layer === here.layer);
    const i = column.findIndex((s) => s.id === nodeId) + (direction === 'down' ? 1 : -1);
    return column[i]?.id ?? null;
  }

  const step = direction === 'right' ? 1 : -1;
  for (let layer = here.layer + step; layer >= 0 && layer < LAYERS.length; layer += step) {
    const column = slots.filter((s) => s.layer === layer);
    if (column.length === 0) continue;
    let best = column[0];
    for (const s of column) {
      if (Math.abs(s.row - here.row) < Math.abs(best.row - here.row)) best = s;
    }
    return best.id;
  }
  return null;
}

// ── 邊的畫法 ─────────────────────────────────────────────────

export type EdgeKind = 'forward' | 'same' | 'back';

export interface LaidOutEdge {
  /** Index into the manifest's edge list — the key the selection state refers to. */
  index: number;
  source: string;
  target: string;
  kind: EdgeKind;
  /** 跨過一欄以上（畫得更淡）。 */
  spansColumns: boolean;
  d: string;
}

/** 扇出／扇入錨點：同一節點同一側有多條邊時沿節點邊緣分散，不從同一點出發。 */
export function fanAnchorY(top: number, count: number, index: number): number {
  const mid = top + NODE_H / 2;
  if (count < 2) return mid;
  const span = NODE_H - 12;
  return mid + (index - (count - 1) / 2) * (span / (count - 1));
}

/**
 * Lays out every edge whose two ends both have a slot. An edge the server sends
 * for a node this page does not know is dropped, same as an unknown node.
 *
 * Only `eep → kg_temporal_relation` runs against the column order (L2 → L1): it
 * goes under the whole canvas and comes up into the target from below.
 */
export function layoutEdges(
  edges: readonly BuildOverviewEdge[],
  g: DagGeometry = DESIGN_GEOMETRY,
): LaidOutEdge[] {
  const outgoing = new Map<string, number[]>();
  const incoming = new Map<string, number[]>();
  edges.forEach((e, i) => {
    if (!NODE_SLOT[e.source] || !NODE_SLOT[e.target]) return;
    outgoing.set(e.source, [...(outgoing.get(e.source) ?? []), i]);
    incoming.set(e.target, [...(incoming.get(e.target) ?? []), i]);
  });

  const result: LaidOutEdge[] = [];
  edges.forEach((e, i) => {
    const a = nodeBox(e.source, g);
    const b = nodeBox(e.target, g);
    if (!a || !b) return;
    const spansColumns = Math.abs(b.layer - a.layer) > 1;

    if (b.layer < a.layer) {
      const sx = a.x;
      const sy = a.y + NODE_H / 2;
      const tx = g.columnCx[b.layer];
      const ty = b.y + NODE_H;
      const d = `M${sx} ${sy} C${sx - 46} ${sy}, ${tx + 80} ${BACK_EDGE_Y}, ${tx} ${BACK_EDGE_Y} L${tx} ${ty}`;
      result.push({ index: i, source: e.source, target: e.target, kind: 'back', spansColumns, d });
      return;
    }

    if (b.layer === a.layer) {
      const sx = a.x + g.nodeW;
      const sy = a.y + NODE_H / 2;
      const ty = b.y + NODE_H / 2;
      const ox = sx + 12;
      const d = `M${sx} ${sy} L${ox} ${sy} L${ox} ${ty} L${sx} ${ty}`;
      result.push({ index: i, source: e.source, target: e.target, kind: 'same', spansColumns, d });
      return;
    }

    const outs = outgoing.get(e.source) ?? [];
    const ins = incoming.get(e.target) ?? [];
    const x1 = a.x + g.nodeW;
    const y1 = fanAnchorY(a.y, outs.length, outs.indexOf(i));
    const x2 = b.x;
    const y2 = fanAnchorY(b.y, ins.length, ins.indexOf(i));
    const d = `M${x1} ${y1} C${x1 + 42} ${y1}, ${x2 - 42} ${y2}, ${x2} ${y2}`;
    result.push({ index: i, source: e.source, target: e.target, kind: 'forward', spansColumns, d });
  });
  return result;
}

// ── 完成度（加權） ───────────────────────────────────────────

export interface Progress {
  total: number;
  complete: number;
  partial: number;
  empty: number;
  /** (complete + partial × 0.5) / total */
  score: number;
}

export function aggregate(nodes: readonly BuildOverviewNode[]): Progress {
  const total = nodes.length;
  const complete = nodes.filter((n) => n.status === 'complete').length;
  const partial = nodes.filter((n) => n.status === 'partial').length;
  const empty = nodes.filter((n) => n.status === 'empty').length;
  const score = total === 0 ? 0 : (complete + partial * 0.5) / total;
  return { total, complete, partial, empty, score };
}

export const scorePct = (p: Progress): number => Math.round(p.score * 100);

export function layerProgress(nodes: readonly BuildOverviewNode[], layer: number): Progress {
  return aggregate(nodes.filter((n) => n.layer === layer));
}

// ── 觸發器、刪除表、同批 ─────────────────────────────────────

export type TriggerKey =
  | 'summarization'
  | 'feature-extraction'
  | 'symbol-discovery'
  | 'knowledge-graph'
  | 'concept-inference'
  | 'entity-batch'
  | 'event-batch';

/** 哪些節點按下去是同一個觸發器。沒列的節點沒有批次 endpoint（或刻意擋掉）。 */
export const NODE_TRIGGER_KEY: Readonly<Record<string, TriggerKey>> = {
  summaries: 'summarization',
  keywords: 'feature-extraction',
  symbols: 'symbol-discovery',
  kg_entity: 'knowledge-graph',
  kg_concept: 'knowledge-graph',
  kg_concept_inferred: 'concept-inference',
  kg_relation: 'knowledge-graph',
  kg_event: 'knowledge-graph',
  cep: 'entity-batch',
  character_analysis_result: 'entity-batch',
  eep: 'event-batch',
  causality_analysis: 'event-batch',
  impact_analysis: 'event-batch',
};

/** 會丟下游的三種觸發器（危險色）。與「花不花 token」是兩條獨立的軸。 */
export const DROPS_DERIVED_TRIGGERS: ReadonlySet<TriggerKey> = new Set([
  'feature-extraction',
  'symbol-discovery',
  'knowledge-graph',
]);

/**
 * 失效範圍是逐觸發器的一張表，不是沿 DAG 遞移。畫布（會被刪除）與確認框（清單）
 * 讀同一張。knowledge-graph 末三項不在稿上：後端 KG 重跑實際會另清時序關係、
 * 故事時序排名與已採用的推斷概念（計畫 Q2，回饋 4-UN-1）。
 */
export const DROPS_BY_TRIGGER: Readonly<Partial<Record<TriggerKey, readonly string[]>>> = {
  'feature-extraction': [],
  'symbol-discovery': ['sep', 'symbol_analysis_result'],
  'knowledge-graph': [
    'cep',
    'character_analysis_result',
    'teu',
    'voice_profile',
    'eep',
    'causality_analysis',
    'impact_analysis',
    'kg_temporal_relation',
    'chronological_rank',
    'kg_concept_inferred',
  ],
};

/**
 * 過時表：重跑後保留、但被標為過時的已建立產物（內容與人工審核都還在）。逐條對照
 * 後端 `services/cache_invalidation.py` 的 `_STALED_CACHES`——那裡以時間戳推導
 * 過時，所以「只補洞」的摘要重跑也會讓敘事結構、英雄旅程過時。與刪除表分開：
 * 刪掉的東西要重做，過時的只是要重看。
 */
export const STALES_BY_TRIGGER: Readonly<Partial<Record<TriggerKey, readonly string[]>>> = {
  // hero_journey:, narrative_structure:
  summarization: ['narrative_structure', 'hero_journey_stage'],
  // event:%, character:%（B-111：id 不變，只是證據換了）＋五個書級產物
  'feature-extraction': [
    'cep',
    'character_analysis_result',
    'eep',
    'causality_analysis',
    'impact_analysis',
    'narrative_structure',
    'hero_journey_stage',
    'temporal_analysis',
    'tension_lines',
    'tension_theme',
  ],
  'knowledge-graph': [
    'narrative_structure',
    'hero_journey_stage',
    'temporal_analysis',
    'tension_lines',
    'tension_theme',
  ],
};

export const triggerKeyOf = (nodeId: string): TriggerKey | null => NODE_TRIGGER_KEY[nodeId] ?? null;

export function dropsDerived(nodeId: string): boolean {
  const key = triggerKeyOf(nodeId);
  return key !== null && DROPS_DERIVED_TRIGGERS.has(key);
}

/** The nodes a rerun of `nodeId` would mark stale — only the ones already built. */
export function staledNodes(
  nodeId: string,
  nodes: readonly BuildOverviewNode[],
): BuildOverviewNode[] {
  const key = triggerKeyOf(nodeId);
  if (!key) return [];
  const byId = new Map(nodes.map((n) => [n.nodeId, n]));
  return (STALES_BY_TRIGGER[key] ?? [])
    .map((id) => byId.get(id))
    .filter((n): n is BuildOverviewNode => !!n && n.status !== 'empty');
}

/** The nodes a rerun of `nodeId` would delete — only the ones already built. */
export function droppedNodes(
  nodeId: string,
  nodes: readonly BuildOverviewNode[],
): BuildOverviewNode[] {
  const key = triggerKeyOf(nodeId);
  if (!key) return [];
  const byId = new Map(nodes.map((n) => [n.nodeId, n]));
  return (DROPS_BY_TRIGGER[key] ?? [])
    .map((id) => byId.get(id))
    .filter((n): n is BuildOverviewNode => !!n && n.status !== 'empty');
}

/** 同一次執行的其他節點（排除自己），依畫布的欄、列排序。 */
export function sharedTriggerPeers(nodeId: string): string[] {
  const key = triggerKeyOf(nodeId);
  if (!key) return [];
  return Object.keys(NODE_TRIGGER_KEY)
    .filter((id) => id !== nodeId && NODE_TRIGGER_KEY[id] === key)
    .sort((a, b) => {
      const sa = NODE_SLOT[a];
      const sb = NODE_SLOT[b];
      return sa.layer - sb.layer || sa.row - sb.row;
    });
}

// ── 選取：上游鏈、一階鄰居 ───────────────────────────────────

/** 遞移上游（我需要的所有節點），不含自己。 */
export function upstreamChain(edges: readonly BuildOverviewEdge[], nodeId: string): string[] {
  const seen = new Set<string>();
  const queue = [nodeId];
  while (queue.length > 0) {
    const cur = queue.shift()!;
    for (const e of edges) {
      if (e.target === cur && !seen.has(e.source) && e.source !== nodeId) {
        seen.add(e.source);
        queue.push(e.source);
      }
    }
  }
  return [...seen];
}

/** 與選中節點有邊直接相連的節點（上下游一階）。 */
export function neighborIds(edges: readonly BuildOverviewEdge[], nodeId: string): string[] {
  const out = new Set<string>();
  for (const e of edges) {
    if (e.source === nodeId) out.add(e.target);
    if (e.target === nodeId) out.add(e.source);
  }
  return [...out];
}

export type EdgeRole = 'up' | 'link' | 'rest';

/** 邊不因失效著色：只有上游鏈（accent）與直接連線（fg-secondary 加粗）。 */
export function edgeRole(
  edge: BuildOverviewEdge,
  nodeId: string,
  chain: ReadonlySet<string>,
): EdgeRole {
  const inChain = (id: string) => id === nodeId || chain.has(id);
  if (inChain(edge.source) && inChain(edge.target)) return 'up';
  if (edge.source === nodeId || edge.target === nodeId) return 'link';
  return 'rest';
}

// ── 節點細節 ─────────────────────────────────────────────────

/** 上游裡還沒完成的一階依賴（擋住這個節點的）。 */
export function blockersOf(
  nodeId: string,
  nodes: readonly BuildOverviewNode[],
  edges: readonly BuildOverviewEdge[],
): BuildOverviewNode[] {
  const byId = new Map(nodes.map((n) => [n.nodeId, n]));
  return edges
    .filter((e) => e.target === nodeId)
    .map((e) => byId.get(e.source))
    .filter((n): n is BuildOverviewNode => !!n && n.status !== 'complete');
}

/**
 * 右欄動作區的六種模式。順序即優先序：
 * - `source`  L0 來源節點：沒有觸發鈕，只有說明。
 * - `hazard`  narrative_structure：刻意擋掉（重跑分類會洗掉 kernel 權重），優先於 blocker。
 * - `blocked` 上游沒齊：blocker chips＋disabled「還缺 N 項前置」。
 * - `trigger` 有觸發器。
 * - `done`    已完整、觸發器只會補洞（摘要、角色／事件批次）：按了什麼都不做卻花
 *             token，不給鈕，只說「已全部建立」。
 * - `soon`    尚無批次 endpoint：「觸發建構功能規劃中」。
 * - `none`    已完整、也沒有觸發器：不畫動作區。
 */
export type ActionMode = 'source' | 'hazard' | 'blocked' | 'trigger' | 'done' | 'soon' | 'none';

/** 已完整時重跑只會補洞（跳過已有的）的觸發器。推斷概念不在內：每次都會推出新命題。 */
const FILL_ONLY_TRIGGERS: ReadonlySet<TriggerKey> = new Set(['summarization', 'entity-batch', 'event-batch']);

export function actionModeFor(
  node: Pick<BuildOverviewNode, 'nodeId' | 'layer' | 'status'>,
  blockerCount: number,
): ActionMode {
  if (node.layer === 0) return 'source';
  if (node.nodeId === 'narrative_structure') return 'hazard';
  if (node.status !== 'complete' && blockerCount > 0) return 'blocked';
  const key = triggerKeyOf(node.nodeId);
  if (key && node.status === 'complete' && FILL_ONLY_TRIGGERS.has(key)) return 'done';
  if (key) return 'trigger';
  return node.status === 'complete' ? 'none' : 'soon';
}

/**
 * 觸發鈕用哪一句。未建立＝「建立／開始」；會刪下游的三步（特徵、象徵、KG）一旦建過，
 * 重跑就是整個重做，叫「重跑／重新…」而不是「補齊」；推斷概念完整後是「再推斷一次」；
 * 其餘部分建立的才是「補齊／剩餘」。（稿原本完整節點沿用「補齊」，2026-10-15 裁決改。）
 */
export function ctaStateFor(nodeId: string, status: NodeStatus): 'empty' | 'partial' | 'rerun' | 'again' {
  if (status === 'empty') return 'empty';
  const key = triggerKeyOf(nodeId);
  if (key && DROPS_DERIVED_TRIGGERS.has(key)) return 'rerun';
  if (status === 'complete' && key === 'concept-inference') return 'again';
  return 'partial';
}

/** 附加資訊的空值顯示「—」（2026-09-26 裁決）。 */
export function metaValueText(value: string | number | boolean | undefined | null): string {
  if (value === undefined || value === null) return '—';
  const text = String(value);
  return text.trim() === '' ? '—' : text;
}
