import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { apiFetch, type Schemas } from './client';
import { queryKeys } from './queryKeys';

export type Card = Schemas['Card'];
export type RunDetail = Schemas['RunDetail'];
export type ViewData = Schemas['ViewData'];
export type TriggerOut = Schemas['TriggerOut'];

const base = (bookId: string) => `/books/${encodeURIComponent(bookId)}`;

/** N-03a 題材判定卡。 */
export function useGenre(bookId: string) {
  return useQuery({
    queryKey: queryKeys.bookData(bookId, 'genre'),
    queryFn: () => apiFetch<Schemas['GenreCard']>(`${base(bookId)}/genre`),
  });
}

/** N-03b 自動結果卡。 */
export function useCards(bookId: string) {
  return useQuery({
    queryKey: queryKeys.bookData(bookId, 'cards'),
    queryFn: () => apiFetch<Card[]>(`${base(bookId)}/cards`),
  });
}

/** N-03c 也可以問、其他題材的訊號。 */
export function useAskable(bookId: string) {
  return useQuery({
    queryKey: queryKeys.bookData(bookId, 'askable'),
    queryFn: () => apiFetch<Schemas['Askable']>(`${base(bookId)}/askable`),
  });
}

/** N-01e 章節清單（view 的章節軸）。 */
export function useChapters(bookId: string) {
  return useQuery({
    queryKey: queryKeys.bookData(bookId, 'chapters'),
    queryFn: () => apiFetch<Schemas['ChapterItem'][]>(`${base(bookId)}/chapters`),
  });
}

/** N-04c 單一 run。 */
export function useRun(bookId: string, runId: string) {
  return useQuery({
    queryKey: queryKeys.bookData(bookId, 'run', runId),
    queryFn: () => apiFetch<RunDetail>(`${base(bookId)}/runs/${encodeURIComponent(runId)}`),
  });
}

/** N-04e view 資料：run 的產出或指定的證據。 */
export function useViewData(bookId: string, viewType: string, source: { runId?: string; evidenceIds?: string[] }) {
  const key = source.runId ?? source.evidenceIds?.join(',') ?? '';
  return useQuery({
    queryKey: queryKeys.bookData(bookId, 'view-data', viewType, key),
    enabled: key !== '',
    queryFn: () => {
      const query = new URLSearchParams({ viewType });
      if (source.runId) query.set('runId', source.runId);
      else if (source.evidenceIds) query.set('evidenceIds', source.evidenceIds.join(','));
      return apiFetch<ViewData>(`${base(bookId)}/view-data?${query}`);
    },
  });
}

function useInvalidateBook(bookId: string) {
  const client = useQueryClient();
  return () => {
    void client.invalidateQueries({ queryKey: queryKeys.book(bookId) });
    void client.invalidateQueries({ queryKey: queryKeys.jobs });
  };
}

/** N-04a 觸發一個方法（點未跑的卡、點「也可以問」；會呼叫 LLM）。 */
export function useTriggerRun(bookId: string) {
  const invalidate = useInvalidateBook(bookId);
  return useMutation({
    mutationFn: (refId: string) =>
      apiFetch<TriggerOut>(`${base(bookId)}/runs`, { method: 'POST', body: JSON.stringify({ refId }) }),
    onSettled: invalidate,
  });
}

/** N-04d 重跑（同 refId、params、主體；會呼叫 LLM）。 */
export function useRerun(bookId: string) {
  const invalidate = useInvalidateBook(bookId);
  return useMutation({
    mutationFn: (runId: string) =>
      apiFetch<TriggerOut>(`${base(bookId)}/runs/${encodeURIComponent(runId)}/rerun`, {
        method: 'POST',
        body: JSON.stringify({ rerunUpstream: false }),
      }),
    onSettled: invalidate,
  });
}
