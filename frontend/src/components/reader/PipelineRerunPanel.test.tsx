import { beforeAll, beforeEach, describe, expect, it, vi } from 'vitest';
import { fireEvent, render, screen, waitFor } from '@testing-library/react';
import { MemoryRouter } from 'react-router-dom';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import type { ReactNode } from 'react';

import { ApiError } from '@/api/client';
import { fetchTaskStatus, rerunStep } from '@/api/ingest';
import { PipelineRerunPanel } from './PipelineRerunPanel';

vi.mock('react-i18next', () => ({
  useTranslation: () => ({ t: (k: string) => k }),
}));

vi.mock('@/api/ingest', () => ({
  rerunStep: vi.fn(() => new Promise(() => {})),
  fetchTaskStatus: vi.fn(),
}));

beforeAll(() => {
  // jsdom has no <dialog> modal API.
  HTMLDialogElement.prototype.showModal = vi.fn();
  HTMLDialogElement.prototype.close = vi.fn();
});

beforeEach(() => {
  vi.mocked(rerunStep).mockReset();
  vi.mocked(rerunStep).mockImplementation(() => new Promise(() => {}));
  vi.mocked(fetchTaskStatus).mockReset();
});

const STATUS = {
  summarization: 'done',
  featureExtraction: 'done',
  knowledgeGraph: 'failed',
  symbolDiscovery: 'done',
} as const;

function renderPanel() {
  const client = new QueryClient();
  const spy = vi.spyOn(client, 'invalidateQueries');
  const wrapper = ({ children }: { children: ReactNode }) => (
    <MemoryRouter>
      <QueryClientProvider client={client}>{children}</QueryClientProvider>
    </MemoryRouter>
  );
  render(<PipelineRerunPanel bookId="book-1" pipelineStatus={STATUS} />, { wrapper });
  return spy;
}

function confirmRerun() {
  fireEvent.click(screen.getByRole('button', { name: 'rerun.rerun' }));
  const buttons = screen.getAllByRole('button', { name: 'rerun.rerun', hidden: true });
  fireEvent.click(buttons[buttons.length - 1]);
}

describe('PipelineRerunPanel', () => {
  it('asks for confirmation before spending tokens on a rerun', () => {
    renderPanel();
    fireEvent.click(screen.getByRole('button', { name: 'rerun.rerun' }));

    expect(screen.getByText('rerun.confirmBody')).toBeTruthy();
    expect(rerunStep).not.toHaveBeenCalled();
  });

  it('reruns the failed step once confirmed', () => {
    renderPanel();
    fireEvent.click(screen.getByRole('button', { name: 'rerun.rerun' }));
    // jsdom never opens the <dialog>, so its buttons count as hidden.
    const buttons = screen.getAllByRole('button', { name: 'rerun.rerun', hidden: true });
    // The dialog's execute button is the last one rendered.
    fireEvent.click(buttons[buttons.length - 1]);

    expect(rerunStep).toHaveBeenCalledWith('book-1', 'knowledge-graph');
  });

  it('explains a 409 from the shared build lock instead of showing the raw detail', async () => {
    vi.mocked(rerunStep).mockRejectedValue(
      new ApiError(409, "A knowledge-graph run is already going for book 'book-1'", true, 'batch_running'),
    );
    renderPanel();
    confirmRerun();

    expect(await screen.findByText('rerun.busy')).toBeTruthy();
    expect(screen.getByRole('link', { name: 'unanalyzed.cta' }).getAttribute('href')).toBe(
      '/books/book-1/unraveling',
    );
    expect(screen.queryByText(/already going/)).toBeNull();
  });

  it('goes back to idle quietly when the run is cancelled', async () => {
    vi.mocked(rerunStep).mockResolvedValue({ taskId: 't1' });
    vi.mocked(fetchTaskStatus).mockResolvedValue({
      taskId: 't1', status: 'error', error: 'cancelled', progress: 0, stage: '', murmurEvents: [],
    });
    const spy = renderPanel();
    confirmRerun();

    await waitFor(() => expect(spy).toHaveBeenCalled());
    expect(screen.queryByText('cancelled')).toBeNull();
    expect(screen.getAllByRole('button', { name: 'rerun.rerun' })[0].hasAttribute('disabled')).toBe(false);
  });

  it('goes back to idle quietly when the task is gone', async () => {
    vi.mocked(rerunStep).mockResolvedValue({ taskId: 't1' });
    vi.mocked(fetchTaskStatus).mockRejectedValue(new ApiError(404, 'Task not found'));
    const spy = renderPanel();
    confirmRerun();

    await waitFor(() => expect(spy).toHaveBeenCalled());
    expect(screen.queryByText('Task not found')).toBeNull();
  });
});
