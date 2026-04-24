import { MOCK_ENABLED } from './mock';
import { apiFetch } from './client';
import * as mock from './mock/mockClient';
import type { GraphData, EventDetail } from './types';
import type { components } from './generated';

export type TimelineConfigResponse = components['schemas']['TimelineConfigResponse'];
export type TimelineConfigUpdate = components['schemas']['TimelineConfigUpdate'];
export type TimelineDetectionResponse = components['schemas']['TimelineDetectionResponse'];

export interface GraphSnapshotParams {
  mode?: 'chapter' | 'story';
  position?: number;
}

export function fetchGraphData(bookId: string, params?: GraphSnapshotParams): Promise<GraphData> {
  if (MOCK_ENABLED) return mock.fetchGraphData(bookId);
  const qs = params?.mode != null && params?.position != null
    ? `?mode=${params.mode}&position=${params.position}`
    : '';
  return apiFetch<GraphData>(`/books/${bookId}/graph${qs}`);
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
