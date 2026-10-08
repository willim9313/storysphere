import { beforeAll, beforeEach, describe, expect, it, vi } from 'vitest';
import { fireEvent, render, screen } from '@testing-library/react';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import type { ReactNode } from 'react';

import { rerunStep } from '@/api/ingest';
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
  vi.mocked(rerunStep).mockClear();
});

const STATUS = {
  summarization: 'done',
  featureExtraction: 'done',
  knowledgeGraph: 'failed',
  symbolDiscovery: 'done',
} as const;

function renderPanel() {
  const client = new QueryClient();
  const wrapper = ({ children }: { children: ReactNode }) => (
    <QueryClientProvider client={client}>{children}</QueryClientProvider>
  );
  render(<PipelineRerunPanel bookId="book-1" pipelineStatus={STATUS} />, { wrapper });
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
});
