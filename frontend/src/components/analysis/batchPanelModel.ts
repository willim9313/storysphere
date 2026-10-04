import type { BatchEepResult, BatchFailure } from '@/api/types';

/**
 * 批次面板的四態與失敗清單推導（DS v3 第 5 批 · 09·10 決議紀錄 A／B 區）。
 *
 *   pending   1 · 有待生成（還沒在本次瀏覽跑過批次）
 *   running   2 · 執行中
 *   attention 3 · 本次瀏覽跑完一批，且仍有失敗或待生成
 *   done      4 · 全部已分析、本次無失敗——退化成一條狀態列，沒有展開鈕、沒有進度條
 *
 * 狀態只由資料推導；沒有計時、沒有自動行為。計數回升就是同一個計數的不同值。
 */
export type BatchPanelState = 'pending' | 'running' | 'attention' | 'done';

export type BatchPanelPage = 'events' | 'characters';

export interface BatchPanelInput {
  totalCount: number;
  /** 伺服器端的未分析數（失敗項仍算未分析，所以重試＝再按主鈕）。 */
  unanalyzedCount: number;
  running: boolean;
  /** 本次瀏覽是否跑完過一批（有結果摘要）。 */
  hasSummary: boolean;
  /** 仍算「失敗」的項目數，見 `liveFailedIds`。 */
  failedCount: number;
}

export function batchPanelState(i: BatchPanelInput): BatchPanelState {
  if (i.running) return 'running';
  if (i.totalCount > 0 && i.unanalyzedCount === 0 && i.failedCount === 0) return 'done';
  return i.hasSummary ? 'attention' : 'pending';
}

/** 第 1–3 態才有展開／收合；第 4 態不存在「收合」這個選項。 */
export function canCollapse(state: BatchPanelState): boolean {
  return state !== 'done';
}

/** 批次結果裡可用來篩清單的失敗 id（角色用 `entity_id`、事件用 `event_id`）。 */
export function failureIdOf(f: BatchFailure, page: BatchPanelPage): string | null {
  return (page === 'characters' ? f.entity_id : f.event_id) ?? null;
}

/**
 * 仍然失敗的項目 id：批次結果的失敗項，且目前仍在未分析清單裡。
 * 失敗後單筆補生成成功的項目已不在未分析，不再算失敗（面板計數與清單篩選一致）。
 */
export function liveFailedIds(
  summary: BatchEepResult | null,
  unanalyzedIds: Iterable<string>,
  page: BatchPanelPage,
): string[] {
  if (!summary?.failures?.length) return [];
  const pending = new Set(unanalyzedIds);
  const seen = new Set<string>();
  for (const f of summary.failures) {
    const id = failureIdOf(f, page);
    if (id && pending.has(id)) seen.add(id);
  }
  return [...seen];
}

/**
 * 面板上的失敗數。結果有帶 id 就以仍然失敗的 id 為準；
 * 沒帶 id 的舊結果（B-113 之前）退回批次的 `failed` 計數，此時無法篩清單。
 */
export function failedCountOf(summary: BatchEepResult | null, liveIds: readonly string[]): number {
  if (!summary) return 0;
  const failures = summary.failures ?? [];
  if (failures.some((f) => f.entity_id || f.event_id)) return liveIds.length;
  return summary.failed;
}

// ── 收合覆寫：存 localStorage，以「書 × 頁」為單位 ─────────────────────

export function collapseKey(bookId: string, page: BatchPanelPage): string {
  return `storysphere:batch-panel:${bookId}:${page}`;
}

/** 覆寫只有「收起」一種值：第 1–3 態預設展開，所以展開＝沒有覆寫。 */
export function readCollapsed(key: string): boolean {
  try {
    return localStorage.getItem(key) === 'collapsed';
  } catch {
    return false;
  }
}

export function writeCollapsed(key: string, collapsed: boolean): void {
  try {
    if (collapsed) localStorage.setItem(key, 'collapsed');
    else localStorage.removeItem(key);
  } catch {
    // 私密視窗或配額已滿：本次瀏覽內仍可用元件 state 切換，只是不記住。
  }
}

/** 實際是否收起：第 4 態沒有收合，其餘依覆寫。 */
export function isCollapsed(state: BatchPanelState, override: boolean): boolean {
  return canCollapse(state) && override;
}
