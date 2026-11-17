import { useMemo } from 'react';
import { useEvidenceByType } from '@/api/evidence';
import { useViewData } from '@/api/runs';

/** view 畫圖用的最小證據形狀：兩條取資料路徑（N-05a、N-04e）統一成這個。 */
interface ViewEvidence {
  id: string;
  content: Record<string, unknown>;
}

/**
 * 依 05 §4.1「取資料的原則」取一種方法產出的證據＋角色名稱。
 *
 * - 有 `evidenceIds`（agent 的 show_view）：只取那些，名稱用 N-04e 的 `referenced` 標籤。
 * - 沒有：取本書該類型所有 current 證據，角色名稱另抓第 1 層 `character`。
 *
 * knowledge_matrix 與 character_arc 共用。
 */
export function useViewEvidence(bookId: string, viewType: string, claimType: string, evidenceIds?: string[]) {
  const scoped = evidenceIds !== undefined;
  const viewData = useViewData(bookId, viewType, scoped ? { evidenceIds } : {});
  const primary = useEvidenceByType(bookId, [claimType], { enabled: !scoped });
  const characters = useEvidenceByType(bookId, ['character'], { includeL1: true, enabled: !scoped });

  const items = useMemo<ViewEvidence[]>(() => {
    if (scoped) {
      return (viewData.data?.primary ?? [])
        .filter((e) => e.claimType === claimType)
        .map((e) => ({ id: e.id, content: e.content }));
    }
    return (primary.data ?? []).map((e) => ({ id: e.id, content: e.content ?? {} }));
  }, [scoped, viewData.data, primary.data, claimType]);

  /** 證據 id → 顯示名稱（角色；指定證據時也含事件）。 */
  const labels = useMemo(() => {
    const map = new Map<string, string>();
    if (scoped) {
      for (const ref of viewData.data?.referenced ?? []) map.set(ref.id, ref.label);
    } else {
      for (const c of characters.data ?? []) {
        const name = c.content?.canonicalName;
        map.set(c.id, typeof name === 'string' ? name : c.summary);
      }
    }
    return map;
  }, [scoped, viewData.data, characters.data]);

  const queries = scoped ? [viewData] : [primary, characters];
  return {
    items,
    labels,
    isLoading: queries.some((q) => q.isLoading),
    error: queries.find((q) => q.error)?.error ?? null,
  };
}
