import { useQuery } from '@tanstack/react-query';
import { apiFetch, type Schemas } from './client';

export type MethodSummary = Schemas['MethodSummary'];

/** N-07a 方法清單；結果卡與詳情頁拿方法名稱、依據、等級。registry 開機後不變，不過期。 */
export function useMethods() {
  return useQuery({
    queryKey: ['registry', 'methods'],
    queryFn: () => apiFetch<MethodSummary[]>('/registry/methods'),
    staleTime: Infinity,
  });
}
