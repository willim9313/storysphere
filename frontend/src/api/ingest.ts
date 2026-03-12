import { apiFetch, apiUpload } from './client';
import type { TaskStatus } from './types';

export function uploadDocument(file: File, title: string): Promise<TaskStatus> {
  const form = new FormData();
  form.append('file', file);
  form.append('title', title);
  return apiUpload<TaskStatus>('/ingest/', form);
}

export function fetchIngestStatus(taskId: string): Promise<TaskStatus> {
  return apiFetch<TaskStatus>(`/ingest/${taskId}`);
}
