import { useQuery } from '@tanstack/react-query';
import { apiFetch, type Schemas } from './client';

// 方法目錄（畫面 8）用的 registry 端點。registry 開機後不變（使用者方法論除外，原型不做另存），不過期。

export type MethodDetail = Schemas['MethodDetail'];
export type Methodology = Schemas['MethodologyOut'];
export type Dag = Schemas['Dag'];
export type DagNode = Schemas['DagNode'];
export type ViewCatalog = Schemas['ViewCatalogOut'];

/** N-07b 單一方法的完整宣告，加推得的 `usedByMethodologies`、`downstreamMethods`。 */
export function useMethodDetail(methodId: string | null) {
  return useQuery({
    queryKey: ['registry', 'method', methodId],
    enabled: methodId !== null,
    queryFn: () => apiFetch<MethodDetail>(`/registry/methods/${encodeURIComponent(methodId!)}`),
    staleTime: Infinity,
  });
}

/** N-07c 方法論清單（內建＋使用者存下的）。 */
export function useMethodologies() {
  return useQuery({
    queryKey: ['registry', 'methodologies'],
    queryFn: () => apiFetch<Methodology[]>('/registry/methodologies'),
    staleTime: Infinity,
  });
}

/** N-07f 證據 DAG：證據類型、方法、方法論三種節點。 */
export function useRegistryDag() {
  return useQuery({
    queryKey: ['registry', 'dag'],
    queryFn: () => apiFetch<Dag>('/registry/dag'),
    staleTime: Infinity,
  });
}

/** N-07g view 目錄與視角設定（方法詳情的「用在結果卡」）。 */
export function useViewCatalog() {
  return useQuery({
    queryKey: ['registry', 'views'],
    queryFn: () => apiFetch<ViewCatalog>('/registry/views'),
    staleTime: Infinity,
  });
}
