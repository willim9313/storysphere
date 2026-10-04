import { beforeAll, describe, expect, it, vi } from 'vitest';
import { render, screen } from '@testing-library/react';

import { ConfirmDialog } from './ConfirmDialog';
import { visibleSections } from './confirmSections';

vi.mock('react-i18next', () => ({
  useTranslation: () => ({ t: (k: string) => k }),
}));

beforeAll(() => {
  // jsdom has no <dialog> modal API.
  HTMLDialogElement.prototype.showModal = vi.fn();
  HTMLDialogElement.prototype.close = vi.fn();
});

const base = { open: true, title: 'T', message: 'M', onConfirm: () => {}, onCancel: () => {} };

describe('visibleSections', () => {
  it('drops sections with no items and keeps order', () => {
    const out = visibleSections([
      { title: 'a', items: ['1'] },
      { title: 'b', items: [] },
      { title: 'c', items: ['2', '3'] },
    ]);
    expect(out.map((s) => s.title)).toEqual(['a', 'c']);
  });

  it('is empty for undefined', () => {
    expect(visibleSections(undefined)).toEqual([]);
  });
});

describe('ConfirmDialog', () => {
  it('renders as before without the new props', () => {
    const { container } = render(<ConfirmDialog {...base} />);
    expect(container.querySelector('.ss-dialog-cost')).toBeNull();
    expect(container.querySelector('.ss-dialog-section')).toBeNull();
  });

  it('shows the cost hint as plain text before the buttons', () => {
    const { container } = render(<ConfirmDialog {...base} costHint="會呼叫 LLM" />);
    const hint = container.querySelector('.ss-dialog-cost');
    expect(hint?.textContent).toBe('會呼叫 LLM');
    expect(hint?.querySelector('svg')).toBeNull();
    expect(hint?.nextElementSibling?.tagName).toBe('BUTTON');
  });

  it('renders items and sections together, skipping empty sections', () => {
    render(
      <ConfirmDialog
        {...base}
        items={['舊項目']}
        sections={[
          { title: '會失去：', items: ['A'] },
          { title: '空的：', items: [] },
          { title: '會連帶過期：', items: ['B'] },
        ]}
      />,
    );
    expect(screen.getByText('舊項目')).toBeTruthy();
    expect(screen.getByText('會失去：')).toBeTruthy();
    expect(screen.getByText('會連帶過期：')).toBeTruthy();
    expect(screen.queryByText('空的：')).toBeNull();
  });
});
