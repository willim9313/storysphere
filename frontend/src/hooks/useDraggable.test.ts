import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import type { MouseEvent as ReactMouseEvent } from 'react';
import { act, renderHook } from '@testing-library/react';

import { useDraggable } from './useDraggable';

const KEY = 'test-drag-pos';
const SIZE = 48;

function resize(width: number, height: number) {
  act(() => {
    Object.defineProperty(window, 'innerWidth', { configurable: true, value: width });
    Object.defineProperty(window, 'innerHeight', { configurable: true, value: height });
    window.dispatchEvent(new Event('resize'));
  });
}

function mount() {
  return renderHook(() =>
    useDraggable({
      storageKey: KEY,
      defaultPos: () => ({ x: window.innerWidth - SIZE - 24, y: window.innerHeight - SIZE - 24 }),
      elementWidth: SIZE,
      elementHeight: SIZE,
    }),
  );
}

function drag(result: ReturnType<typeof mount>['result'], to: { x: number; y: number }) {
  const from = result.current.pos;
  act(() => {
    result.current.dragHandleProps.onMouseDown({
      button: 0, clientX: from.x, clientY: from.y, preventDefault: () => {},
    } as unknown as ReactMouseEvent);
  });
  act(() => {
    document.dispatchEvent(new MouseEvent('mousemove', { clientX: to.x, clientY: to.y }));
    document.dispatchEvent(new MouseEvent('mouseup'));
  });
}

beforeEach(() => {
  localStorage.clear();
  resize(1024, 900);
});
afterEach(() => localStorage.clear());

describe('useDraggable', () => {
  it('keeps the default bottom-right distance when the window widens', () => {
    const { result } = mount();
    expect(result.current.pos).toEqual({ x: 1024 - 72, y: 900 - 72 });
    resize(1440, 1000);
    expect(result.current.pos).toEqual({ x: 1440 - 72, y: 1000 - 72 });
  });

  it('springs back to its corner distance after a shrink clamps it', () => {
    const { result } = mount();
    resize(40, 40);
    expect(result.current.pos).toEqual({ x: 0, y: 0 });
    resize(1440, 900);
    expect(result.current.pos).toEqual({ x: 1440 - 72, y: 900 - 72 });
  });

  it('anchors a drag to the nearest corner and persists that anchor', () => {
    const { result } = mount();
    drag(result, { x: 100, y: 50 });
    expect(JSON.parse(localStorage.getItem(KEY)!)).toEqual({ ax: 'left', dx: 100, ay: 'top', dy: 50 });
    resize(1440, 1000);
    expect(result.current.pos).toEqual({ x: 100, y: 50 });
  });

  it('reads the pre-anchor absolute format against the nearest corner', () => {
    localStorage.setItem(KEY, JSON.stringify({ x: 1024 - 72, y: 900 - 72 }));
    const { result } = mount();
    resize(1440, 900);
    expect(result.current.pos).toEqual({ x: 1440 - 72, y: 900 - 72 });
  });
});
