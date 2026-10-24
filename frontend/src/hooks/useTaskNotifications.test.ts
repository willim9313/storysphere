import { describe, expect, it } from 'vitest';

import type { TaskStatus } from '@/api/tasks';
import { isPartialDone } from '@/api/tasks';
import { phaseOf } from './useTaskNotifications';

const task = (o: Partial<TaskStatus>): TaskStatus =>
  ({ taskId: 't', status: 'running', progress: 0, stage: '', kind: 'ingestion', ...o }) as TaskStatus;

describe('phaseOf', () => {
  it('a user cancellation is not announced as a failure', () => {
    expect(phaseOf(task({ status: 'error', error: 'cancelled' }))).toBeNull();
  });

  it('a real failure is still an error phase', () => {
    expect(phaseOf(task({ status: 'error', error: 'PdfParseError' }))).toBe('error');
    expect(phaseOf(task({ status: 'error', error: null }))).toBe('error');
  });

  it('done splits into done and partial by failedSteps', () => {
    expect(phaseOf(task({ status: 'done', result: { bookId: 'b' } }))).toBe('done');
    expect(phaseOf(task({ status: 'done', result: { bookId: 'b', failedSteps: ['x'] } }))).toBe('partial');
  });
});

describe('isPartialDone (shared by the toast and the Task Center row)', () => {
  it('reads ingestion failedSteps and analysis failed_parts', () => {
    expect(isPartialDone(task({ status: 'done', result: { failedSteps: ['x'] } }))).toBe(true);
    expect(isPartialDone(task({ status: 'done', result: { failed_parts: ['x'] } }))).toBe(true);
  });

  it('is false when nothing failed or the task is not done', () => {
    expect(isPartialDone(task({ status: 'done', result: { failedSteps: [] } }))).toBe(false);
    expect(isPartialDone(task({ status: 'done', result: null }))).toBe(false);
    expect(isPartialDone(task({ status: 'running', result: { failedSteps: ['x'] } }))).toBe(false);
  });
});
