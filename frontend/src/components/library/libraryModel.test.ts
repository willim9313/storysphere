import { describe, expect, it } from 'vitest';

import type { Book } from '@/api/types';
import type { TaskStatus } from '@/api/tasks';
import { filterBooks, ingestionTasks, libraryCounts, recentBooks, taskBookTitle } from './libraryModel';

const task = (o: Partial<TaskStatus>): TaskStatus =>
  ({ taskId: 't', status: 'running', progress: 0, stage: '', kind: 'ingestion', ...o }) as TaskStatus;

const book = (o: Partial<Book>): Book =>
  ({ id: 'b', title: 'B', status: 'ready', chapterCount: 1, ...o }) as Book;

describe('ingestionTasks', () => {
  it('splits in-flight tasks from the human gate and drops terminal / other kinds', () => {
    const { processing, awaiting } = ingestionTasks([
      task({ taskId: 'run' }),
      task({ taskId: 'pend', status: 'pending' }),
      task({ taskId: 'gate', status: 'awaiting_review', result: { bookId: 'x' } }),
      task({ taskId: 'gate-no-book', status: 'awaiting_review' }),
      task({ taskId: 'done', status: 'done' }),
      task({ taskId: 'sym', kind: 'symbol' }),
    ]);
    expect(processing.map((t) => t.taskId)).toEqual(['run', 'pend']);
    expect(awaiting.map((t) => t.taskId)).toEqual(['gate']);
  });
});

describe('taskBookTitle', () => {
  it('strips the 解析 suffix and falls back to null', () => {
    expect(taskBookTitle(task({ title: '雪線之下 解析' }))).toBe('雪線之下');
    expect(taskBookTitle(task({ title: '書籍解析' }))).toBe('書籍');
    expect(taskBookTitle(task({ title: null }))).toBeNull();
  });
});

describe('filterBooks', () => {
  const books = [book({ id: 'a', status: 'analyzed' }), book({ id: 'r', status: 'ready' })];
  it('processing is a structural empty set', () => {
    expect(filterBooks(books, 'processing')).toEqual([]);
  });
  it('status chips filter by status', () => {
    expect(filterBooks(books, 'ready').map((b) => b.id)).toEqual(['r']);
    expect(filterBooks(books, 'all')).toHaveLength(2);
  });
});

describe('libraryCounts', () => {
  it('counts by status', () => {
    expect(libraryCounts([book({ status: 'analyzed' }), book({ status: 'error' })])).toEqual({
      total: 2,
      analyzed: 1,
      ready: 0,
      error: 1,
    });
  });
});

describe('recentBooks', () => {
  it('keeps opened books only, newest first, at most three', () => {
    const r = recentBooks([
      book({ id: 'never' }),
      book({ id: 'old', lastOpenedAt: '2026-09-01T00:00:00Z' }),
      book({ id: 'new', lastOpenedAt: '2026-10-01T00:00:00Z' }),
      book({ id: 'mid', lastOpenedAt: '2026-09-15T00:00:00Z' }),
      book({ id: 'older', lastOpenedAt: '2026-08-01T00:00:00Z' }),
    ]);
    expect(r.map((b) => b.id)).toEqual(['new', 'mid', 'old']);
  });
});
