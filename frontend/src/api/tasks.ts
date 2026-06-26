import { apiFetch } from './client';
import type { components } from './generated';

export type TaskStatus = components['schemas']['TaskStatus'];

// #8c — List all tasks for the Task Center (active + recent terminal).
// Does not include murmurEvents; poll /tasks/:id/status for those.
export function fetchTasks(recentLimit?: number): Promise<TaskStatus[]> {
  const params = recentLimit !== undefined ? `?recent_limit=${recentLimit}` : '';
  return apiFetch<TaskStatus[]>(`/tasks${params}`);
}
