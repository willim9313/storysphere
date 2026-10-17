import type { ReactNode } from 'react';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { fireEvent, render, screen, waitFor } from '@testing-library/react';
import { MemoryRouter } from 'react-router-dom';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';

import { ApiError } from '@/api/client';
import type { TaskStatus } from '@/api/types';
import { ProcessingCard } from './ProcessingCard';

const { fetchTaskStatus, rerunStep, fetchBook, fetchRunningUnraveling } = vi.hoisted(() => ({
  fetchTaskStatus: vi.fn(),
  rerunStep: vi.fn(),
  fetchBook: vi.fn(),
  fetchRunningUnraveling: vi.fn(),
}));
vi.mock('@/api/ingest', () => ({
  fetchTaskStatus,
  acceptReview: vi.fn(),
  cancelTask: vi.fn(),
  rerunStep,
}));
vi.mock('@/api/books', () => ({ deleteBook: vi.fn(), fetchBook }));
vi.mock('@/api/buildOverview', () => ({ fetchRunningUnraveling }));

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
  rerunStep.mockReset();
  fetchBook.mockReset();
  fetchRunningUnraveling.mockReset();
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

  it('a failed poll (5xx) is not a failed task: the card stays and says so', async () => {
    queryClient = new QueryClient({ defaultOptions: { queries: { gcTime: 0, retryDelay: 0 } } });
    fetchTaskStatus
      .mockImplementationOnce(() => Promise.resolve(status({ progress: 40 })))
      .mockImplementation(() => Promise.reject(new ApiError(500, 'boom')));
    const h = renderCard();
    await waitFor(() => expect(fetchTaskStatus).toHaveBeenCalledTimes(1));
    await queryClient.refetchQueries();
    await waitFor(() => expect(document.querySelector('[role="status"]')).not.toBeNull());
    expect(h.onError).not.toHaveBeenCalled();
    expect(h.onGone).not.toHaveBeenCalled();
  });
});

describe('PartialRerunCard', () => {
  const PARTIAL = status({
    status: 'done',
    progress: 100,
    result: { bookId: 'b1', failedSteps: ['summarization: RateLimitError 429', 'symbol_discovery: timeout'] },
  });
  const pipeline = (over: Record<string, string>) => ({
    summarization: 'failed', featureExtraction: 'done', knowledgeGraph: 'done', symbolDiscovery: 'failed', ...over,
  });

  function setup(opts: { pipelineStatus?: Record<string, string>; running?: { op: string | null; taskId: string | null } }) {
    fetchBook.mockImplementation(() => Promise.resolve({ id: 'b1', pipelineStatus: opts.pipelineStatus ?? pipeline({}) }));
    fetchRunningUnraveling.mockImplementation(() => Promise.resolve(opts.running ?? { op: null, taskId: null }));
    fetchTaskStatus.mockImplementation((id: string) =>
      Promise.resolve(id === 't1' ? PARTIAL : status({ taskId: id, status: 'running' })));
    renderCard();
  }

  it('steps the book has made good since are not offered again', async () => {
    setup({ pipelineStatus: pipeline({ summarization: 'done', symbolDiscovery: 'done' }) });
    await screen.findByText('card.allResolved');
    expect(screen.queryByRole('button', { name: 'card.rerun' })).toBeNull();
  });

  it('a rerun already going for a step is adopted, not offered', async () => {
    setup({ running: { op: 'summarization', taskId: 'r9' } });
    await screen.findByText('card.rerunning');
    expect(screen.getAllByRole('button', { name: 'card.rerun' })).toHaveLength(1);
    await waitFor(() => expect(fetchTaskStatus).toHaveBeenCalledWith('r9', expect.anything()));
  });

  it('409 for another step shows the busy line instead of a failure', async () => {
    setup({});
    rerunStep.mockImplementation(() => Promise.reject(new ApiError(409, 'busy', true, 'batch_running')));
    fireEvent.click((await screen.findAllByRole('button', { name: 'card.rerun' }))[0]);
    await waitFor(() => expect(screen.getByRole('status')).toBeTruthy());
    expect(screen.queryByRole('button', { name: 'card.rerunRetry' })).toBeNull();
  });

  it('409 for this very step adopts the running rerun', async () => {
    setup({});
    rerunStep.mockImplementation(() => Promise.reject(new ApiError(409, 'busy', true, 'batch_running')));
    fireEvent.click((await screen.findAllByRole('button', { name: 'card.rerun' }))[0]);
    fetchRunningUnraveling.mockImplementation(() => Promise.resolve({ op: 'summarization', taskId: 'r7' }));
    await screen.findByText('card.rerunning');
  });

  it('503 (no LLM provider) is shown in place, not as a failure', async () => {
    setup({});
    rerunStep.mockImplementation(() => Promise.reject(new ApiError(503, 'no provider', true)));
    fireEvent.click((await screen.findAllByRole('button', { name: 'card.rerun' }))[0]);
    await waitFor(() => expect(screen.getByRole('status')).toBeTruthy());
    expect(screen.queryByRole('button', { name: 'card.rerunRetry' })).toBeNull();
  });
});
