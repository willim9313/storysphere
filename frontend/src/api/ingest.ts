import { MOCK_ENABLED } from './mock';
import { apiFetch, apiUpload } from './client';
import * as mock from './mock/mockClient';
import type { TaskStatus } from './types';

// #2 — Upload book (PDF)
export function uploadBook(file: File): Promise<{ taskId: string }> {
  if (MOCK_ENABLED) return mock.uploadBook(file);
  const form = new FormData();
  form.append('file', file);
  return apiUpload<{ taskId: string }>('/books/upload', form);
}

// #8 — Poll task status
export function fetchTaskStatus(taskId: string): Promise<TaskStatus> {
  if (MOCK_ENABLED) return mock.fetchTaskStatus(taskId);
  return apiFetch<TaskStatus>(`/tasks/${taskId}/status`);
}
