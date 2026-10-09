import { useId, useState } from 'react';
import { describe, expect, it } from 'vitest';
import { fireEvent, render, screen } from '@testing-library/react';

import { useDialogFocus } from './useDialogFocus';

function Harness() {
  const [open, setOpen] = useState(false);
  const ref = useDialogFocus(open);
  const titleId = useId();
  return (
    <>
      <button onClick={() => setOpen(true)}>trigger</button>
      {open && (
        <aside ref={ref} role="dialog" aria-modal="true" aria-labelledby={titleId}>
          <h3 id={titleId} tabIndex={-1}>
            title
          </h3>
          <button>first</button>
          <button disabled>skipped</button>
          <button tabIndex={-1}>skipped2</button>
          <button onClick={() => setOpen(false)}>last</button>
        </aside>
      )}
    </>
  );
}

function openDrawer() {
  const trigger = screen.getByText('trigger');
  trigger.focus();
  fireEvent.click(trigger);
  return trigger;
}

describe('useDialogFocus', () => {
  it('moves focus to the title on open', () => {
    render(<Harness />);
    openDrawer();
    expect(document.activeElement).toBe(screen.getByText('title'));
  });

  it('wraps Tab from the last element to the first', () => {
    render(<Harness />);
    openDrawer();
    screen.getByText('last').focus();
    fireEvent.keyDown(document.activeElement!, { key: 'Tab' });
    expect(document.activeElement).toBe(screen.getByText('first'));
  });

  it('wraps Shift+Tab from the first element to the last', () => {
    render(<Harness />);
    openDrawer();
    screen.getByText('first').focus();
    fireEvent.keyDown(document.activeElement!, { key: 'Tab', shiftKey: true });
    expect(document.activeElement).toBe(screen.getByText('last'));
  });

  it('returns focus to the trigger on close', () => {
    render(<Harness />);
    const trigger = openDrawer();
    fireEvent.click(screen.getByText('last'));
    expect(screen.queryByRole('dialog')).toBeNull();
    expect(document.activeElement).toBe(trigger);
  });
});
