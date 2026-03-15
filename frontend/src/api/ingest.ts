import { MOCK_ENABLED } from './mock';
import { apiFetch, apiUpload } from './client';
import * as mock from './mock/mockClient';
import type { TaskStatus } from './types';

export function uploadDocument(file: File, title: string): Promise<TaskStatus> {
  if (MOCK_ENABLED) return mock.uploadDocument(file, title);
  const form = new FormData();
  form.append('file', file);
  form.append('title', title);
  return apiUpload<TaskStatus>('/ingest/', form);
}

export function fetchIngestStatus(taskId: string): Promise<TaskStatus> {
  if (MOCK_ENABLED) return mock.fetchIngestStatus(taskId);
  return apiFetch<TaskStatus>(`/ingest/${taskId}`);
}
