import type { NoteDraft, SessionDetail, TraceItem } from '@/api/agent';

/** show_view 的一次呈現（04 §5.5）：從 trace 的參數重建，重新整理後也畫得出來。 */
export interface ShownView {
  seq: number;
  viewType: string;
  runId?: string;
  evidenceIds?: string[];
}

/** 一輪＝一則使用者訊息與它引起的一切（05 §3.3「一個問題＝一個結果」）。 */
export interface Turn {
  turnId: string;
  question: string;
  answer: string | null;
  calls: TraceItem[];
  views: ShownView[];
  drafts: NoteDraft[];
}

export type ResultState = 'unsaved' | 'saved' | 'discarded';

function viewOf(call: TraceItem): ShownView | null {
  if (call.tool !== 'show_view' || call.status !== 'ok') return null;
  const args = call.args as { view_type?: unknown; data_ref?: { run_id?: unknown; evidence_ids?: unknown } };
  if (typeof args.view_type !== 'string') return null;
  const ref = args.data_ref ?? {};
  return {
    seq: call.seq,
    viewType: args.view_type,
    runId: typeof ref.run_id === 'string' ? ref.run_id : undefined,
    evidenceIds: Array.isArray(ref.evidence_ids) ? (ref.evidence_ids as string[]) : undefined,
  };
}

/**
 * 依 turnId 把對話、工具呼叫、view、草稿組成一輪一輪。
 * T27 之前建立的草稿沒有 turnId：用草稿的 `question`（觸發它的使用者訊息）對回那一輪。
 */
export function buildTurns(session: SessionDetail, trace: TraceItem[], drafts: NoteDraft[]): Turn[] {
  const turns: Turn[] = [];
  const byId = new Map<string, Turn>();
  for (const message of session.messages) {
    let turn = byId.get(message.turnId);
    if (!turn) {
      turn = { turnId: message.turnId, question: '', answer: null, calls: [], views: [], drafts: [] };
      byId.set(message.turnId, turn);
      turns.push(turn);
    }
    if (message.role === 'user') turn.question = message.text;
    else turn.answer = message.text;
  }
  for (const call of trace) {
    const turn = call.turnId ? byId.get(call.turnId) : undefined;
    if (!turn) continue;
    turn.calls.push(call);
    const view = viewOf(call);
    if (view) turn.views.push(view);
  }
  for (const draft of drafts) {
    const turn =
      (draft.turnId ? byId.get(draft.turnId) : undefined) ??
      turns.find((t) => draft.question !== null && t.question === draft.question);
    turn?.drafts.push(draft);
  }
  return turns;
}

/** 有 view 或草稿的輪次才是一個「結果」。 */
export function hasResult(turn: Turn): boolean {
  return turn.views.length > 0 || turn.drafts.length > 0;
}

export function resultState(turn: Turn): ResultState {
  if (turn.drafts.some((d) => d.state === 'confirmed')) return 'saved';
  if (turn.drafts.length > 0 && turn.drafts.every((d) => d.state === 'discarded')) return 'discarded';
  return 'unsaved';
}

/** 該輪成功、非 dry_run 的 run_method（04 N-07e 原型決定：另存方法論只取這些）。 */
export function methodSteps(turn: Turn): string[] {
  return turn.calls
    .filter((c) => c.tool === 'run_method' && c.status === 'ok' && !(c.args as { dry_run?: unknown }).dry_run)
    .map((c) => String((c.args as { method_id?: unknown }).method_id));
}

/** 該輪用 get_run 取用的現成結果（「取用結果卡 CH2」標籤）。 */
export function reusedResults(turn: Turn): { methodId: string | null; runId: string | null }[] {
  return turn.calls
    .filter((c) => c.tool === 'get_run' && c.status === 'ok')
    .map((c) => {
      const args = c.args as { method_id?: unknown; run_id?: unknown };
      return {
        methodId: typeof args.method_id === 'string' ? args.method_id : null,
        runId: typeof args.run_id === 'string' ? args.run_id : null,
      };
    });
}

/** 結果的代號：A、B、…、Z、AA…。 */
export function resultLabel(index: number): string {
  let label = '';
  let n = index;
  do {
    label = String.fromCharCode(65 + (n % 26)) + label;
    n = Math.floor(n / 26) - 1;
  } while (n >= 0);
  return label;
}

// 看起來像 evidence id（uuid 或抄短了的 uuid）的片段。
const ID_LIKE = /\b[0-9a-f]{6,}(?:-[0-9a-f]{2,}){1,4}\b/gi;

/** 結論文字裡出現、但不在引用清單裡的 id（大腦抄錯的 id；只警示，不擋儲存）。 */
export function strayIds(conclusion: string, cited: readonly string[]): string[] {
  const found = conclusion.match(ID_LIKE) ?? [];
  const citedSet = new Set(cited.map((id) => id.toLowerCase()));
  return [...new Set(found)].filter((id) => !citedSet.has(id.toLowerCase()));
}

/** 一行人看的工具呼叫摘要（完整參數在開發者檢視）。 */
export function callSummary(call: TraceItem): string {
  const args = call.args as Record<string, unknown>;
  const key =
    args.method_id ?? args.run_id ?? args.view_type ?? args.query ?? args.entity_id ?? args.name ?? args.title ?? null;
  const parts = [call.tool, key === null || typeof key === 'object' ? null : String(key)];
  if (call.status === 'ok' && call.resultEvidenceIds.length > 0) parts.push(`${call.resultEvidenceIds.length} 筆`);
  if (call.durationMs !== null && call.durationMs >= 1000) parts.push(`${Math.round(call.durationMs / 1000)} s`);
  return parts.filter(Boolean).join(' · ');
}

export const CALL_STATUS: Record<string, string> = {
  running: '執行中',
  error: '錯誤',
  denied: '已拒絕',
  pending_approval: '等你確認',
};
