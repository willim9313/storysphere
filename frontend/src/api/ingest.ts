import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { apiFetch, type Schemas } from './client';
import { queryKeys } from './queryKeys';

export type IngestStatus = Schemas['IngestStatus'];
export type IngestStep = Schemas['IngestStep'];
export type UnitItem = Schemas['UnitItem'];
export type ReviewData = Schemas['ReviewData'];
export type ReviewChapter = Schemas['ReviewChapter'];
export type ReviewIn = Schemas['ReviewIn'];
export type UnitStage = 's1a' | 's1b' | 's4a';

const base = (bookId: string) => `/books/${encodeURIComponent(bookId)}`;

/** N-02a 步驟條與單位統計。 */
export function useIngestStatus(bookId: string) {
  return useQuery({
    queryKey: queryKeys.ingest(bookId),
    queryFn: () => apiFetch<IngestStatus>(`${base(bookId)}/ingest`),
  });
}

/** N-02b 一個 stage 的所有單位（依書中順序；超過一頁就接著抓）。 */
export function useIngestUnits(bookId: string, stage: UnitStage, enabled: boolean) {
  return useQuery({
    queryKey: [...queryKeys.ingest(bookId), 'units', stage],
    enabled,
    queryFn: async () => {
      const items: UnitItem[] = [];
      let cursor: string | null = null;
      do {
        const query = new URLSearchParams({ stage, limit: '200' });
        if (cursor) query.set('cursor', cursor);
        const page = await apiFetch<Schemas['UnitPage']>(`${base(bookId)}/ingest/units?${query}`);
        items.push(...page.items);
        cursor = page.nextCursor;
      } while (cursor);
      return items;
    },
  });
}

/** N-02d 章節審閱資料；只在 job 為 awaiting_review 時抓。 */
export function useReviewData(bookId: string, enabled: boolean) {
  return useQuery({
    queryKey: [...queryKeys.ingest(bookId), 'review'],
    enabled,
    queryFn: () => apiFetch<ReviewData>(`${base(bookId)}/review-data`),
  });
}

/** N-02e 提交章節審閱；job 回到 running 繼續 S1（會呼叫 LLM）。 */
export function useSubmitReview(bookId: string) {
  const client = useQueryClient();
  return useMutation({
    mutationFn: (body: Partial<ReviewIn>) =>
      apiFetch<void>(`${base(bookId)}/review`, {
        method: 'POST',
        body: JSON.stringify({ roleOverrides: {}, paragraphSplits: {}, ...body }),
      }),
    onSettled: () => {
      void client.invalidateQueries({ queryKey: queryKeys.ingest(bookId) });
      void client.invalidateQueries({ queryKey: queryKeys.books });
      void client.invalidateQueries({ queryKey: queryKeys.jobs });
    },
  });
}
