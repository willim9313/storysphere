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

/** A task that finished but not cleanly. The ingestion pipeline reports
 *  `result.failedSteps` (ingestion_reporter); the analysis tasks report
 *  `result.failed_parts`. The Task Center row and the global toast must agree,
 *  so both ask here. */
export function failedStepsOf(task: Pick<TaskStatus, 'result'>): string[] {
  const r = task.result as { failedSteps?: unknown; failed_parts?: unknown } | null | undefined;
  const list = Array.isArray(r?.failedSteps) ? r.failedSteps : r?.failed_parts;
  return Array.isArray(list) ? (list as string[]) : [];
}

export function isPartialDone(task: Pick<TaskStatus, 'status' | 'result'>): boolean {
  return task.status === 'done' && failedStepsOf(task).length > 0;
}
