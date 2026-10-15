import type { ReactNode } from 'react';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { act, renderHook, waitFor } from '@testing-library/react';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';

import { ApiError } from '@/api/client';
import type { TaskStatus } from '@/api/types';
import { qk } from '@/api/queryKeys';
import { useBuildRun } from './useBuildRun';

const fetchTaskStatus = vi.hoisted(() => vi.fn());
const fetchRunningUnraveling = vi.hoisted(() => vi.fn());
const fetchActiveEntityBatch = vi.hoisted(() => vi.fn());
const fetchActiveEventBatch = vi.hoisted(() => vi.fn());
vi.mock('@/api/ingest', () => ({ fetchTaskStatus }));
vi.mock('@/api/buildOverview', () => ({ fetchRunningUnraveling }));
vi.mock('@/api/analysis', () => ({ fetchActiveEntityBatch, fetchActiveEventBatch }));

function task(over: Partial<TaskStatus> = {}): TaskStatus {
  return { taskId: 't1', status: 'running', progress: 0, stage: '', murmurEvents: [], ...over };
}

let queryClient: QueryClient;

function wrapper({ children }: { children: ReactNode }) {
  return <QueryClientProvider client={queryClient}>{children}</QueryClientProvider>;
}

function idle() {
  fetchRunningUnraveling.mockResolvedValue({ op: null, taskId: null });
  fetchActiveEntityBatch.mockResolvedValue({ taskId: null });
  fetchActiveEventBatch.mockResolvedValue({ taskId: null });
}

async function poll() {
  await act(async () => {
    await queryClient.refetchQueries({ queryKey: qk.tasks.all });
  });
}

beforeEach(() => {
  queryClient = new QueryClient({ defaultOptions: { queries: { retry: false, gcTime: 0 } } });
  for (const fn of [fetchTaskStatus, fetchRunningUnraveling, fetchActiveEntityBatch, fetchActiveEventBatch]) {
    fn.mockReset();
  }
  idle();
});

describe('useBuildRun', () => {
  it('picks up a rerun already going for the book on mount', async () => {
    fetchRunningUnraveling.mockResolvedValue({ op: 'knowledge-graph', taskId: 't1' });
    fetchTaskStatus.mockResolvedValue(task());
    const trigger = vi.fn();

    const { result } = renderHook(() => useBuildRun('b1', trigger), { wrapper });

    await waitFor(() => expect(result.current.runningKey).toBe('knowledge-graph'));
    expect(result.current.busy).toBe(true);
    expect(trigger).not.toHaveBeenCalled();
  });

  it('maps a running concept inference and the analysis batches to their triggers', async () => {
    fetchRunningUnraveling.mockResolvedValue({ op: 'concepts', taskId: 't1' });
    fetchTaskStatus.mockResolvedValue(task());
    const a = renderHook(() => useBuildRun('b1', vi.fn()), { wrapper });
    await waitFor(() => expect(a.result.current.runningKey).toBe('concept-inference'));

    idle();
    fetchActiveEventBatch.mockResolvedValue({ taskId: 't2' });
    const b = renderHook(() => useBuildRun('b2', vi.fn()), { wrapper });
    await waitFor(() => expect(b.result.current.runningKey).toBe('event-batch'));
  });

  it('follows the run it started until it lands, then refreshes the book', async () => {
    fetchTaskStatus.mockResolvedValue(task());
    const trigger = vi.fn(async () => ({ taskId: 't1' }));
    const spy = vi.spyOn(queryClient, 'invalidateQueries');

    const { result } = renderHook(() => useBuildRun('b1', trigger), { wrapper });
    await act(() => result.current.start('summarization'));
    await waitFor(() => expect(result.current.runningKey).toBe('summarization'));

    fetchTaskStatus.mockResolvedValue(task({ status: 'done' }));
    await poll();

    await waitFor(() => expect(result.current.runningKey).toBeNull());
    expect(result.current.failure).toBeNull();
    expect(spy).toHaveBeenCalledWith({ queryKey: qk.book('b1') });
    expect(spy).toHaveBeenCalledWith({ queryKey: qk.buildOverview.manifest('b1') });
    expect(spy).toHaveBeenCalledWith({ queryKey: ['narrative', 'b1'] });
    expect(spy).toHaveBeenCalledWith({ queryKey: qk.symbols.overview('b1') });
  });

  it('adopts the run that beat it on a 409 instead of failing', async () => {
    fetchTaskStatus.mockResolvedValue(task());
    const trigger = vi.fn(async () => {
      fetchRunningUnraveling.mockResolvedValue({ op: 'symbol-discovery', taskId: 't9' });
      throw new ApiError(409, 'A symbol-discovery run is already going', true, 'batch_running');
    });

    const { result } = renderHook(() => useBuildRun('b1', trigger), { wrapper });
    await waitFor(() => expect(fetchRunningUnraveling).toHaveBeenCalled());
    await act(() => result.current.start('knowledge-graph'));

    await waitFor(() => expect(result.current.runningKey).toBe('symbol-discovery'));
    expect(result.current.failure).toBeNull();
  });

  it('keeps a refused trigger as that trigger\'s failure', async () => {
    const refusal = new ApiError(500, 'boom');
    const trigger = vi.fn(async () => {
      throw refusal;
    });

    const { result } = renderHook(() => useBuildRun('b1', trigger), { wrapper });
    await act(() => result.current.start('knowledge-graph'));

    expect(result.current.failure).toEqual({ key: 'knowledge-graph', error: refusal });
    expect(result.current.busy).toBe(false);
  });

  it('reports a failed task with its message', async () => {
    fetchTaskStatus.mockResolvedValue(task({ status: 'error', error: 'quota exceeded' }));
    const { result } = renderHook(() => useBuildRun('b1', async () => ({ taskId: 't1' })), { wrapper });

    await act(() => result.current.start('entity-batch'));

    await waitFor(() =>
      expect(result.current.failure).toEqual({ key: 'entity-batch', message: 'quota exceeded' }),
    );
    expect(result.current.runningKey).toBeNull();
  });

  it('treats a cancelled run as idle, not failed', async () => {
    fetchTaskStatus.mockResolvedValue(task({ status: 'error', error: 'cancelled' }));
    const { result } = renderHook(() => useBuildRun('b1', async () => ({ taskId: 't1' })), { wrapper });

    await act(() => result.current.start('knowledge-graph'));

    await waitFor(() => expect(result.current.runningKey).toBeNull());
    expect(result.current.failure).toBeNull();
  });

  it('stops showing a run whose task is gone', async () => {
    fetchRunningUnraveling.mockResolvedValue({ op: 'knowledge-graph', taskId: 't1' });
    fetchTaskStatus.mockRejectedValue(new ApiError(404, 'gone'));

    const { result } = renderHook(() => useBuildRun('b1', vi.fn()), { wrapper });

    await waitFor(() => expect(fetchTaskStatus).toHaveBeenCalled());
    await waitFor(() => expect(result.current.runningKey).toBeNull());
    expect(result.current.busy).toBe(false);
  });
});
