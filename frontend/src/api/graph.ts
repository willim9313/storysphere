import { MOCK_ENABLED } from './mock';
import { apiFetch } from './client';
import * as mock from './mock/mockClient';
import type { GraphData, EventDetail } from './types';
import type { components } from './generated';

export type InferredRelation = components['schemas']['InferredRelationResponse'];
export type InferredRelationsResponse = components['schemas']['InferredRelationsResponse'];
export type InferenceStatus = 'pending' | 'confirmed' | 'rejected';

export type TimelineConfigResponse = components['schemas']['TimelineConfigResponse'];
export type TimelineConfigUpdate = components['schemas']['TimelineConfigUpdate'];
export type TimelineDetectionResponse = components['schemas']['TimelineDetectionResponse'];
export type EpistemicStateResponse = components['schemas']['EpistemicStateResponse'];
export type MisbeliefItemSchema = components['schemas']['MisbeliefItemSchema'];
export type ClassifyVisibilityResponse = components['schemas']['ClassifyVisibilityResponse'];

export interface GraphSnapshotParams {
  mode?: 'chapter' | 'story';
  position?: number;
}

export function fetchGraphData(
  bookId: string,
  params?: GraphSnapshotParams,
  includeInferred?: boolean,
): Promise<GraphData> {
  if (MOCK_ENABLED) return mock.fetchGraphData(bookId);
  const qp = new URLSearchParams();
  if (params?.mode != null && params?.position != null) {
    qp.set('mode', params.mode);
    qp.set('position', String(params.position));
  }
  if (includeInferred) qp.set('include_inferred', 'true');
  const qs = qp.toString() ? `?${qp.toString()}` : '';
  return apiFetch<GraphData>(`/books/${bookId}/graph${qs}`);
}

export function runInference(bookId: string, forceRefresh = false): Promise<InferredRelationsResponse> {
  return apiFetch<InferredRelationsResponse>(`/books/${bookId}/inferred-relations/run`, {
    method: 'POST',
    body: JSON.stringify({ forceRefresh }),
  });
}

export function fetchInferredRelations(
  bookId: string,
  status?: InferenceStatus,
): Promise<InferredRelationsResponse> {
  const qs = status ? `?status=${status}` : '';
  return apiFetch<InferredRelationsResponse>(`/books/${bookId}/inferred-relations${qs}`);
}

export function confirmInferred(
  bookId: string,
  irId: string,
  relationType: string,
): Promise<{ relationId: string }> {
  return apiFetch<{ relationId: string }>(`/books/${bookId}/inferred-relations/${irId}/confirm`, {
    method: 'POST',
    body: JSON.stringify({ relationType }),
  });
}

export function rejectInferred(bookId: string, irId: string): Promise<void> {
  return apiFetch<void>(`/books/${bookId}/inferred-relations/${irId}/reject`, {
    method: 'POST',
  });
}


export function fetchTimelineConfig(bookId: string): Promise<TimelineConfigResponse> {
  return apiFetch<TimelineConfigResponse>(`/books/${bookId}/timeline-config`);
}

export function updateTimelineConfig(
  bookId: string,
  update: TimelineConfigUpdate,
): Promise<TimelineConfigResponse> {
  return apiFetch<TimelineConfigResponse>(`/books/${bookId}/timeline-config`, {
    method: 'PUT',
    body: JSON.stringify(update),
  });
}

export function detectTimeline(bookId: string): Promise<TimelineDetectionResponse> {
  return apiFetch<TimelineDetectionResponse>(`/books/${bookId}/detect-timeline`, {
    method: 'POST',
  });
}

export function fetchEventDetail(bookId: string, eventId: string): Promise<EventDetail> {
  return apiFetch<EventDetail>(`/books/${bookId}/events/${eventId}`);
}

export function triggerClassifyVisibility(bookId: string): Promise<{ taskId: string }> {
  return apiFetch<{ taskId: string }>(`/books/${bookId}/classify-visibility`, { method: 'POST' });
}

export function fetchEpistemicState(
  bookId: string,
  entityId: string,
  upToChapter: number,
): Promise<EpistemicStateResponse> {
  return apiFetch<EpistemicStateResponse>(
    `/books/${bookId}/entities/${entityId}/epistemic-state?up_to_chapter=${upToChapter}`,
  );
}
