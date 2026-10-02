import { describe, expect, it } from 'vitest';

import type { TaskStatus } from '@/api/tasks';
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
