import { apiFetch } from './client';
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
  const qs = new URLSearchParams();
  if (params?.entity_type) qs.set('entity_type', params.entity_type);
  if (params?.limit) qs.set('limit', String(params.limit));
  if (params?.offset) qs.set('offset', String(params.offset));
  const q = qs.toString();
  return apiFetch<EntityListResponse>(`/entities/${q ? `?${q}` : ''}`);
}

export function fetchEntity(id: string): Promise<EntityResponse> {
  return apiFetch<EntityResponse>(`/entities/${id}`);
}

export function fetchEntityRelations(id: string): Promise<RelationResponse[]> {
  return apiFetch<RelationResponse[]>(`/entities/${id}/relations`);
}

export function fetchEntityTimeline(id: string): Promise<TimelineEntry[]> {
  return apiFetch<TimelineEntry[]>(`/entities/${id}/timeline`);
}

export function fetchEntitySubgraph(
  id: string,
  kHops = 2,
): Promise<SubgraphResponse> {
  return apiFetch<SubgraphResponse>(`/entities/${id}/subgraph?k_hops=${kHops}`);
}
