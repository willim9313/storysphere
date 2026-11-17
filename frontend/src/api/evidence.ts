import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { apiFetch, type Schemas } from './client';
import { queryKeys } from './queryKeys';

export type EvidenceItem = Schemas['EvidenceListItem'];
export type EvidenceDetail = Schemas['EvidenceDetail'];
export type Trace = Schemas['Trace'];
export type ParagraphView = Schemas['ParagraphView'];

const base = (bookId: string) => `/books/${encodeURIComponent(bookId)}`;

/**
 * 本書某幾種類型的所有 current 證據（含內容），超過一頁就接著抓（N-05a）。
 * view 用它取「整個分析」的資料，不只結果卡那一個 run（05 §4.1）。
 */
export function useEvidenceByType(
  bookId: string,
  claimTypes: string[],
  options: { includeL1?: boolean; enabled?: boolean } = {},
) {
  const { includeL1 = false, enabled = true } = options;
  return useQuery({
    queryKey: queryKeys.bookData(bookId, 'evidence-by-type', [...claimTypes].sort().join(','), includeL1),
    enabled: enabled && claimTypes.length > 0,
    queryFn: async () => {
      const items: EvidenceItem[] = [];
      for (const claimType of claimTypes) {
        let cursor: string | null = null;
        do {
          const query = new URLSearchParams({ claimType, withContent: 'true', limit: '200' });
          if (includeL1) query.set('includeL1', 'true');
          if (cursor) query.set('cursor', cursor);
          const page = await apiFetch<Schemas['EvidencePage']>(`${base(bookId)}/evidence?${query}`);
          items.push(...page.items);
          cursor = page.nextCursor;
        } while (cursor);
      }
      return items;
    },
  });
}

/** N-05a 某個 run 產出的 current 證據（結果卡詳情右欄）。 */
export function useRunEvidence(bookId: string, runId: string) {
  return useQuery({
    queryKey: queryKeys.bookData(bookId, 'run-evidence', runId),
    queryFn: async () => {
      const items: EvidenceItem[] = [];
      let cursor: string | null = null;
      do {
        const query = new URLSearchParams({ runId, limit: '200', sort: 'chapter' });
        if (cursor) query.set('cursor', cursor);
        const page = await apiFetch<Schemas['EvidencePage']>(`${base(bookId)}/evidence?${query}`);
        items.push(...page.items);
        cursor = page.nextCursor;
      } while (cursor);
      return items;
    },
  });
}

/** N-05b 單筆證據（含引文、上游、審核紀錄）。 */
export function useEvidence(bookId: string, evidenceId: string | null) {
  return useQuery({
    queryKey: queryKeys.bookData(bookId, 'evidence', evidenceId),
    enabled: evidenceId !== null,
    queryFn: () => apiFetch<EvidenceDetail>(`${base(bookId)}/evidence/${encodeURIComponent(evidenceId!)}`),
  });
}

/** N-05c 追溯樹（往上游，含第 1 層）。 */
export function useTrace(bookId: string, evidenceId: string | null) {
  return useQuery({
    queryKey: queryKeys.bookData(bookId, 'trace', evidenceId),
    enabled: evidenceId !== null,
    queryFn: () => apiFetch<Trace>(`${base(bookId)}/evidence/${encodeURIComponent(evidenceId!)}/trace?depth=3`),
  });
}

/** N-05d 原文段落，高亮某筆證據落在這段的引文。 */
export function useParagraph(bookId: string, paragraphId: string | null, highlightEvidenceId: string | null) {
  return useQuery({
    queryKey: queryKeys.bookData(bookId, 'paragraph', paragraphId, highlightEvidenceId),
    enabled: paragraphId !== null,
    queryFn: () => {
      const query = new URLSearchParams({ context: '1' });
      if (highlightEvidenceId) query.set('highlightEvidenceId', highlightEvidenceId);
      return apiFetch<ParagraphView>(`${base(bookId)}/paragraphs/${encodeURIComponent(paragraphId!)}?${query}`);
    },
  });
}

/** N-05e 審核：確認或拒絕（使用者決定先不做「修改」）。拒絕會讓下游標「依據已變動」，整本重抓。 */
export function useReviewEvidence(bookId: string) {
  const client = useQueryClient();
  return useMutation({
    mutationFn: ({ evidenceId, action, reason }: { evidenceId: string; action: 'approve' | 'reject'; reason?: string }) =>
      apiFetch<Schemas['ReviewResult']>(`${base(bookId)}/evidence/${encodeURIComponent(evidenceId)}/review`, {
        method: 'POST',
        body: JSON.stringify(action === 'reject' ? { action, reason } : { action }),
      }),
    onSettled: () => client.invalidateQueries({ queryKey: queryKeys.book(bookId) }),
  });
}
