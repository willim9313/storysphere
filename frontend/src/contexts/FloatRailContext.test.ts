import { describe, expect, it } from 'vitest';

import { RAIL, isOnRail, toastBottom, type RailOccupancy } from './FloatRailContext';

const VW = 1280;
const VH = 800;
const occ = (o: Partial<RailOccupancy> = {}): RailOccupancy => ({
  bubbleOnRail: false,
  fabReserved: false,
  chatWindow: null,
  ...o,
});

/** The state table in the global-chrome spec §6.3, row by row. */
describe('toastBottom', () => {
  it('non-book route (nothing on the rail) takes slot 1', () => {
    expect(toastBottom(occ(), VW, VH)).toBe(RAIL.slots[0]);
  });

  it('book route with the bubble on the rail takes slot 2', () => {
    expect(toastBottom(occ({ bubbleOnRail: true }), VW, VH)).toBe(RAIL.slots[1]);
  });

  it('reader with the bubble on the rail and the FAB reserved takes slot 3', () => {
    expect(toastBottom(occ({ bubbleOnRail: true, fabReserved: true }), VW, VH)).toBe(RAIL.slots[2]);
  });

  it('bubble dragged off the rail releases slot 1, even on the reader', () => {
    expect(toastBottom(occ({ fabReserved: true }), VW, VH)).toBe(RAIL.slots[0]);
  });

  it('an open chat window over the rail puts the toast 8px above it', () => {
    const chatWindow = { left: VW - 24 - 380, top: VH - 72 - 8 - 520, width: 380, height: 520 };
    expect(toastBottom(occ({ bubbleOnRail: true, chatWindow }), VW, VH)).toBe(
      VH - chatWindow.top + RAIL.windowGap,
    );
  });

  it('a chat window away from the rail is ignored', () => {
    const chatWindow = { left: 100, top: 100, width: 380, height: 520 };
    expect(toastBottom(occ({ bubbleOnRail: true, chatWindow }), VW, VH)).toBe(RAIL.slots[1]);
  });

  it('a window pinned to the top edge still leaves the toast inside the viewport', () => {
    const chatWindow = { left: VW - 24 - 380, top: 8, width: 380, height: VH - 16 };
    expect(toastBottom(occ({ chatWindow }), VW, VH)).toBeLessThan(VH - RAIL.windowGap);
  });
});

describe('isOnRail', () => {
  it('the default bubble position is on the rail', () => {
    expect(isOnRail(VW - 48 - 24, VH - 48 - 24, 48, VW, VH)).toBe(true);
  });

  it('a bubble dragged up the right edge is off the rail', () => {
    expect(isOnRail(VW - 48 - 24, 300, 48, VW, VH)).toBe(false);
  });

  it('a bubble dragged to the bottom-left is off the rail', () => {
    expect(isOnRail(80, VH - 48 - 24, 48, VW, VH)).toBe(false);
  });
});
