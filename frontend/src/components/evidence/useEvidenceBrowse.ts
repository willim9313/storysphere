import { useInfiniteQuery, useQuery } from '@tanstack/react-query';
import { apiFetch, type Schemas } from '@/api/client';
import { queryKeys } from '@/api/queryKeys';

const PAGE_SIZE = 50;

/** 證據瀏覽的篩選（存在網址的 search params；空字串＝不篩）。 */
export interface EvidenceFilter {
  type: string;
  level: string;
  review: string;
  /** '' ＝現行；`superseded`；`rejected`（＝現行裡 reviewStatus=rejected）。 */
  status: string;
  from: string;
  to: string;
  q: string;
}

function toQuery(filter: EvidenceFilter, includeL1: boolean): URLSearchParams {
  const query = new URLSearchParams({ limit: String(PAGE_SIZE) });
  if (includeL1) query.set('includeL1', 'true');
  if (filter.type) query.set('claimType', filter.type);
  if (filter.level) {
    query.set('minLevel', filter.level);
    query.set('maxLevel', filter.level);
  }
  if (filter.status === 'superseded') query.set('status', 'superseded');
  if (filter.status === 'rejected') query.set('reviewStatus', 'rejected');
  else if (filter.review) query.set('reviewStatus', filter.review);
  if (filter.from) query.set('chapterFrom', filter.from);
  if (filter.to) query.set('chapterTo', filter.to);
  // 有搜尋字時依相關度（後端預設）；沒有時照章節順序。
  if (filter.q) query.set('q', filter.q);
  else query.set('sort', 'chapter');
  return query;
}

/** N-05a 分頁讀取（cursor），「載入更多」接下一頁。 */
export function useEvidenceBrowse(bookId: string, filter: EvidenceFilter, includeL1: boolean) {
  const query = toQuery(filter, includeL1);
  return useInfiniteQuery({
    queryKey: queryKeys.bookData(bookId, 'evidence-browse', query.toString()),
    initialPageParam: null as string | null,
    queryFn: ({ pageParam }) => {
      const page = new URLSearchParams(query);
      if (pageParam) page.set('cursor', pageParam);
      return apiFetch<Schemas['EvidencePage']>(`/books/${encodeURIComponent(bookId)}/evidence?${page}`);
    },
    getNextPageParam: (last) => last.nextCursor,
  });
}

/** 全書的層級分布（副標用）：各打一次 N-05a 只取 total。`includeL1` 關掉時不查第 1 層。 */
export function useEvidenceCounts(bookId: string, includeL1: boolean) {
  const count = (query: string) =>
    apiFetch<Schemas['EvidencePage']>(`/books/${encodeURIComponent(bookId)}/evidence?limit=1&${query}`).then((page) => page.total);
  return useQuery({
    queryKey: queryKeys.bookData(bookId, 'evidence-counts', includeL1),
    queryFn: async () => ({
      upper: await count(''),
      level1: includeL1 ? await count('includeL1=true&minLevel=1&maxLevel=1') : null,
    }),
  });
}
