import { useEffect } from 'react';
import { describe, expect, it, vi } from 'vitest';
import { act, render, screen, within } from '@testing-library/react';

import { ToastProvider, useToast, type PushToastInput } from '@/contexts/ToastContext';
import { ToastHost } from './ToastHost';

vi.mock('react-i18next', () => ({
  useTranslation: () => ({ t: (k: string) => k }),
}));

const api: { push: (t: PushToastInput) => void } = { push: () => {} };
const push = (t: PushToastInput) => api.push(t);
function Pusher() {
  const { push: p } = useToast();
  useEffect(() => {
    api.push = p;
  }, [p]);
  return null;
}

function mount() {
  return render(
    <ToastProvider>
      <Pusher />
      <ToastHost />
    </ToastProvider>,
  );
}

describe('ToastHost announcer', () => {
  it('keeps both live regions mounted before any toast appears', () => {
    mount();
    expect(screen.getByRole('status')).toBeEmptyDOMElement();
    expect(screen.getByRole('alert')).toBeEmptyDOMElement();
  });

  it('routes errors to the assertive region and the rest to the polite one', () => {
    mount();
    const status = screen.getByRole('status');
    const alert = screen.getByRole('alert');
    act(() => {
      push({ type: 'success', title: '已儲存' });
      push({ type: 'error', title: '儲存失敗', body: '請稍後再試' });
    });
    expect(status).toHaveTextContent('已儲存');
    expect(alert).toHaveTextContent('儲存失敗 請稍後再試');
    expect(status).not.toHaveTextContent('儲存失敗');
  });

  it('adds one node per toast and leaves the buttons out', () => {
    mount();
    const status = screen.getByRole('status');
    act(() => {
      push({ type: 'info', title: 'A', action: { label: '前往', onClick: () => {} } });
      push({ type: 'warning', title: 'B' });
    });
    expect(status.children).toHaveLength(2);
    expect(within(status).queryByRole('button')).toBeNull();
    expect(status).not.toHaveTextContent('前往');
  });

  it('does not re-add a toast pushed again with the same dedupe key', () => {
    mount();
    act(() => {
      push({ type: 'success', title: 'done', dedupeKey: 'k' });
      push({ type: 'success', title: 'done', dedupeKey: 'k' });
    });
    expect(screen.getByRole('status').children).toHaveLength(1);
  });

  it('keeps the same region nodes when the visible stack mounts and unmounts', () => {
    mount();
    const status = screen.getByRole('status');
    act(() => push({ type: 'success', title: 'x', persist: true }));
    expect(screen.getByRole('status')).toBe(status);
    act(() => screen.getByLabelText('close').click());
    expect(screen.getByRole('status')).toBe(status);
    expect(status).toBeEmptyDOMElement();
  });
});
