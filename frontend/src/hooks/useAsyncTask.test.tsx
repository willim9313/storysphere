import type { ReactNode } from 'react';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { act, renderHook, waitFor } from '@testing-library/react';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';

import type { TaskStatus } from '@/api/types';
import { useAsyncTask } from './useAsyncTask';
import { useBatchTask } from './useBatchTask';

/** useBatchTask polls through the default fetcher, so that one gets mocked. */
const fetchTaskStatus = vi.hoisted(() => vi.fn());
vi.mock('@/api/ingest', () => ({ fetchTaskStatus }));

function task(over: Partial<TaskStatus> = {}): TaskStatus {
  return { taskId: 't1', status: 'running', progress: 0, stage: '', ...over };
}

let queryClient: QueryClient;

function wrapper({ children }: { children: ReactNode }) {
  return <QueryClientProvider client={queryClient}>{children}</QueryClientProvider>;
}

/** Re-poll without waiting out the 2s interval. */
async function poll() {
  await act(async () => {
    await queryClient.refetchQueries({ queryKey: ['tasks'] });
  });
}

beforeEach(() => {
  queryClient = new QueryClient({
    defaultOptions: { queries: { retry: false, gcTime: 0 } },
  });
  fetchTaskStatus.mockReset();
});

/**
 * The point of these is the *terminal semantics*, which is the one thing the
 * five hand-written copies of this state machine did not agree on. Getting it
 * wrong doesn't break the build or the types — it makes an error panel vanish,
 * or a finished modal close itself, and only in the app.
 */
describe('useAsyncTask', () => {
  it('reports done once and lets the caller clear the id', async () => {
    const fetcher = vi.fn(async () => task({ status: 'done' }));
    const onDone = vi.fn((_t: TaskStatus, ctl: { reset: () => void }) => ctl.reset());

    const { result } = renderHook(
      () => useAsyncTask({ fetcher, onDone, defaultError: 'boom' }),
      { wrapper },
    );

    act(() => result.current.adopt('t1'));
    await waitFor(() => expect(onDone).toHaveBeenCalledTimes(1));
    await waitFor(() => expect(result.current.taskId).toBeNull());
    expect(result.current.running).toBe(false);
  });

  it('keeps the id after a failure so the error panel stays rendered', async () => {
    const fetcher = vi.fn(async () => task({ status: 'error', error: '模型逾時' }));

    const { result } = renderHook(
      () => useAsyncTask({ fetcher, defaultError: 'boom' }),
      { wrapper },
    );

    act(() => result.current.adopt('t1'));
    await waitFor(() => expect(result.current.error).toBe('模型逾時'));

    // This is the behaviour the two analysis pages depend on: their error panel
    // renders from `task`, which is only reachable while the id is held.
    expect(result.current.taskId).toBe('t1');
    expect(result.current.task?.status).toBe('error');
  });

  it('falls back to defaultError when the task carries no message', async () => {
    const fetcher = vi.fn(async () => task({ status: 'error' }));
    const { result } = renderHook(
      () => useAsyncTask({ fetcher, defaultError: '分析失敗' }),
      { wrapper },
    );

    act(() => result.current.adopt('t1'));
    await waitFor(() => expect(result.current.error).toBe('分析失敗'));
  });

  it('does not re-fire the terminal callback on later polls', async () => {
    // The polls have to differ, or react-query's structural sharing hands back
    // the identical object and the status effect never re-runs — the assertion
    // would then pass whether or not the once-guard exists.
    let progress = 0;
    const fetcher = vi.fn(async () =>
      task({ status: 'error', error: 'x', progress: (progress += 1) }),
    );
    const onError = vi.fn();

    const { result } = renderHook(
      () => useAsyncTask({ fetcher, onError, defaultError: 'boom' }),
      { wrapper },
    );

    act(() => result.current.adopt('t1'));
    await waitFor(() => expect(onError).toHaveBeenCalledTimes(1));

    // The id is still held (that is the analysis-page semantic), so the effect
    // keeps seeing a terminal task. Without the guard this climbs per poll.
    await poll();
    await poll();
    await waitFor(() => expect(result.current.task?.progress).toBe(3));
    expect(onError).toHaveBeenCalledTimes(1);
  });

  it('turns a failed trigger into an error instead of throwing', async () => {
    const { result } = renderHook(
      () => useAsyncTask({ fetcher: vi.fn(), defaultError: 'boom' }),
      { wrapper },
    );

    await act(async () => {
      await result.current.run(() => Promise.reject(new Error('network')), '無法啟動');
    });

    expect(result.current.error).toBe('無法啟動');
    expect(result.current.taskId).toBeNull();
  });

  it('clears a stale error when the next run starts', async () => {
    const fetcher = vi.fn(async () => task({ status: 'error', error: '第一次就爆了' }));
    const { result } = renderHook(
      () => useAsyncTask({ fetcher, defaultError: 'boom' }),
      { wrapper },
    );

    act(() => result.current.adopt('t1'));
    await waitFor(() => expect(result.current.error).toBe('第一次就爆了'));

    act(() => result.current.adopt('t2'));
    expect(result.current.error).toBeNull();
  });
});

describe('useBatchTask', () => {
  it('fires onProgress once per advance of subProgress, not per poll', async () => {
    fetchTaskStatus.mockResolvedValue(task({ status: 'running', subProgress: 2, subTotal: 5 }));
    const onProgress = vi.fn();

    const { result } = renderHook(
      () =>
        useBatchTask<string[]>({
          trigger: async () => ({ taskId: 't1' }),
          onProgress,
          failureMessage: '批次失敗',
        }),
      { wrapper },
    );

    act(() => result.current.start());
    await waitFor(() => expect(result.current.processed).toBe(2));
    expect(onProgress).toHaveBeenCalledTimes(1);

    // Same counter on the next poll — nothing advanced, so nothing to refetch.
    await poll();
    expect(onProgress).toHaveBeenCalledTimes(1);

    fetchTaskStatus.mockResolvedValue(task({ status: 'running', subProgress: 4, subTotal: 5 }));
    await poll();
    await waitFor(() => expect(result.current.processed).toBe(4));
    expect(onProgress).toHaveBeenCalledTimes(2);
  });

  it('hands onDone the summary and stops polling', async () => {
    const summary = { progress: 5, total: 5, failed: 1, skipped: 0 };
    fetchTaskStatus.mockResolvedValue(task({ status: 'done', result: summary }));
    const onDone = vi.fn();

    const { result } = renderHook(
      () =>
        useBatchTask<string[]>({
          trigger: async () => ({ taskId: 't1' }),
          onDone,
          failureMessage: '批次失敗',
        }),
      { wrapper },
    );

    act(() => result.current.start());
    await waitFor(() => expect(result.current.summary).toEqual(summary));
    expect(onDone).toHaveBeenCalledWith(summary);
    expect(result.current.running).toBe(false);
  });

  it('surfaces a task failure and clears it on dismiss', async () => {
    fetchTaskStatus.mockResolvedValue(task({ status: 'error', error: '額度用盡' }));

    const { result } = renderHook(
      () =>
        useBatchTask<string[]>({
          trigger: async () => ({ taskId: 't1' }),
          failureMessage: '批次失敗',
        }),
      { wrapper },
    );

    act(() => result.current.start());
    await waitFor(() => expect(result.current.error).toBe('額度用盡'));
    expect(result.current.running).toBe(false);

    act(() => result.current.dismiss());
    expect(result.current.error).toBeNull();
  });

  it('reports a trigger failure with the caller message', async () => {
    const { result } = renderHook(
      () =>
        useBatchTask<string[]>({
          trigger: async () => {
            throw new Error('500');
          },
          failureMessage: '批次失敗',
        }),
      { wrapper },
    );

    act(() => result.current.start());
    await waitFor(() => expect(result.current.error).toBe('批次失敗'));
  });
});
