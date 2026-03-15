import { MOCK_ENABLED } from './mock';
import { apiFetch } from './client';
import * as mock from './mock/mockClient';
import type {
  EntityListResponse,
  EntityResponse,
  RelationResponse,
  TimelineEntry,
  SubgraphResponse,
} from './types';

export function fetchEntities(params?: {
  entity_type?: string;
  limit?: number;
  offset?: number;
}): Promise<EntityListResponse> {
  if (MOCK_ENABLED) return mock.fetchEntities(params);
  const qs = new URLSearchParams();
  if (params?.entity_type) qs.set('entity_type', params.entity_type);
  if (params?.limit) qs.set('limit', String(params.limit));
  if (params?.offset) qs.set('offset', String(params.offset));
  const q = qs.toString();
  return apiFetch<EntityListResponse>(`/entities/${q ? `?${q}` : ''}`);
}

export function fetchEntity(id: string): Promise<EntityResponse> {
  if (MOCK_ENABLED) return mock.fetchEntity(id);
  return apiFetch<EntityResponse>(`/entities/${id}`);
}

export function fetchEntityRelations(id: string): Promise<RelationResponse[]> {
  if (MOCK_ENABLED) return mock.fetchEntityRelations(id);
  return apiFetch<RelationResponse[]>(`/entities/${id}/relations`);
}

export function fetchEntityTimeline(id: string): Promise<TimelineEntry[]> {
  if (MOCK_ENABLED) return mock.fetchEntityTimeline(id);
  return apiFetch<TimelineEntry[]>(`/entities/${id}/timeline`);
}

export function fetchEntitySubgraph(
  id: string,
  kHops = 2,
): Promise<SubgraphResponse> {
  if (MOCK_ENABLED) return mock.fetchEntitySubgraph(id, kHops);
  return apiFetch<SubgraphResponse>(`/entities/${id}/subgraph?k_hops=${kHops}`);
}
