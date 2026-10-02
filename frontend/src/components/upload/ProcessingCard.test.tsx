import type { ReactNode } from 'react';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { render, waitFor } from '@testing-library/react';
import { MemoryRouter } from 'react-router-dom';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';

import { ApiError } from '@/api/client';
import type { TaskStatus } from '@/api/types';
import { ProcessingCard } from './ProcessingCard';

const fetchTaskStatus = vi.hoisted(() => vi.fn());
vi.mock('@/api/ingest', () => ({
  fetchTaskStatus,
  acceptReview: vi.fn(),
  cancelTask: vi.fn(),
  rerunStep: vi.fn(),
}));
vi.mock('@/api/books', () => ({ deleteBook: vi.fn() }));

const TASK = { taskId: 't1', fileName: '雪線之下.pdf', title: '雪線之下' };

function status(over: Partial<TaskStatus>): TaskStatus {
  return { taskId: 't1', status: 'running', progress: 0, stage: '', murmurEvents: [], ...over };
}

let queryClient: QueryClient;

function Wrapper({ children }: { children: ReactNode }) {
  return (
    <MemoryRouter>
      <QueryClientProvider client={queryClient}>{children}</QueryClientProvider>
    </MemoryRouter>
  );
}

function renderCard() {
  const handlers = { onDone: vi.fn(), onError: vi.fn(), onGone: vi.fn() };
  render(<ProcessingCard task={TASK} {...handlers} />, { wrapper: Wrapper });
  return handlers;
}

beforeEach(() => {
  queryClient = new QueryClient({ defaultOptions: { queries: { gcTime: 0 } } });
  fetchTaskStatus.mockReset();
});

describe('ProcessingCard terminal states', () => {
  it('a task the server no longer knows (404) leaves instead of waiting forever', async () => {
    fetchTaskStatus.mockImplementation(() => Promise.reject(new ApiError(404, "Task 't1' not found")));
    const h = renderCard();
    await waitFor(() => expect(h.onGone).toHaveBeenCalledWith('t1'));
    expect(h.onError).not.toHaveBeenCalled();
    // 404 is final: no retries, no further polling.
    expect(fetchTaskStatus).toHaveBeenCalledTimes(1);
  });

  it('a user-cancelled task leaves without an error card', async () => {
    fetchTaskStatus.mockImplementation(() => Promise.resolve(status({ status: 'error', error: 'cancelled' })));
    const h = renderCard();
    await waitFor(() => expect(h.onGone).toHaveBeenCalledWith('t1'));
    expect(h.onError).not.toHaveBeenCalled();
  });

  it('a real failure still becomes an error card', async () => {
    fetchTaskStatus.mockImplementation(() => Promise.resolve(status({ status: 'error', error: 'PdfParseError: encrypted' })));
    const h = renderCard();
    await waitFor(() => expect(h.onError).toHaveBeenCalledWith('t1', '雪線之下.pdf', 'PdfParseError: encrypted'));
    expect(h.onGone).not.toHaveBeenCalled();
  });
});
