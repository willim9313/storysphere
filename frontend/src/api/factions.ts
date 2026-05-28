import type { components } from './generated';
import { apiFetch } from './client';

export type FactionAnalysisResponse = components['schemas']['FactionAnalysisResponse'];
export type FactionResponse = components['schemas']['FactionResponse'];
export type FactionRelationResponse = components['schemas']['FactionRelationResponse'];

export interface FactionAnalysisParams {
  chapter?: number;
  resolution?: number;        // 0.1 – 4.0, default 1.0
  minClusterSize?: number;    // ≥ 2, default 2
}

export function fetchFactionAnalysis(
  bookId: string,
  params: FactionAnalysisParams = {},
): Promise<FactionAnalysisResponse> {
  const search = new URLSearchParams();
  if (params.chapter != null) search.set('chapter', String(params.chapter));
  if (params.resolution != null) search.set('resolution', String(params.resolution));
  if (params.minClusterSize != null)
    search.set('min_cluster_size', String(params.minClusterSize));
  const qs = search.toString();
  return apiFetch<FactionAnalysisResponse>(
    `/books/${bookId}/analysis/factions${qs ? `?${qs}` : ''}`,
  );
}
