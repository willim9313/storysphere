import { apiFetch } from './client';
import type { components } from './generated';

export type TaskStatus = components['schemas']['TaskStatus'];

// #8c — List all tasks for the Task Center (active + recent terminal).
// Does not include murmurEvents; poll /tasks/:id/status for those.
export function fetchTasks(recentLimit?: number): Promise<TaskStatus[]> {
  const params = recentLimit !== undefined ? `?recent_limit=${recentLimit}` : '';
  return apiFetch<TaskStatus[]>(`/tasks${params}`);
}

/** The backend marks every user cancellation as `error: "cancelled"`
 *  (task_runner / POST /tasks/:id/cancel). It is a terminal state the user
 *  chose, not a failure — no failure toast, no retry card. */
export function isCancelled(task: Pick<TaskStatus, 'status' | 'error'>): boolean {
  return task.status === 'error' && task.error === 'cancelled';
}
