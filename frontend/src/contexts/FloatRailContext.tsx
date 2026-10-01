import { createContext, useContext, useEffect, useState, type ReactNode } from 'react';

/**
 * Floating rail (DS v3 · global-chrome spec §6) — the bottom-right position
 * contract shared by the chat bubble, the reader's back-to-top FAB and the
 * toast stack. Before it each one hard-coded its own corner, and the toast
 * (z60) landed exactly on top of the bubble (z50): the only way into chat
 * vanished whenever a toast appeared.
 *
 * R1 one rail: right 24, slots at bottom 24 / 88 / 144.
 * R2 a toast stack takes the lowest free slot when it first appears and never
 *    moves after that. Things that pop up on their own (the FAB) keep their
 *    slot permanently; things the user drags away (the bubble) release it.
 * R3 an open chat window over the rail pushes the toast to 8px above it.
 * R4 persistent controls sit above transient notices: bubble > window > toast > FAB.
 */
export const RAIL = {
  right: 24,
  slots: [24, 88, 144] as const,
  /** Toast stack width — the rail's horizontal footprint. */
  width: 340,
  windowGap: 8,
  z: { bubble: 60, window: 59, toast: 55, fab: 30 },
} as const;

interface Rect {
  left: number;
  top: number;
  width: number;
  height: number;
}

export interface RailOccupancy {
  bubbleOnRail: boolean;
  fabReserved: boolean;
  chatWindow: Rect | null;
}

/** A title-only toast is ~60px; leave a little more than that. */
const MIN_TOAST_HEIGHT = 72;

const EMPTY: RailOccupancy = { bubbleOnRail: false, fabReserved: false, chatWindow: null };

/** A mutable box, not React state: occupancy is only *read* at the moment a
 *  toast stack appears (R2), so nothing should re-render when the bubble moves. */
export interface FloatRail {
  read: () => RailOccupancy;
  set: <K extends keyof RailOccupancy>(key: K, value: RailOccupancy[K]) => void;
}

function createRail(): FloatRail {
  const occ: RailOccupancy = { ...EMPTY };
  return {
    read: () => occ,
    set: (key, value) => {
      occ[key] = value;
    },
  };
}

const FloatRailContext = createContext<FloatRail | null>(null);

export function FloatRailProvider({ children }: { children: ReactNode }) {
  const [rail] = useState(createRail);
  return <FloatRailContext.Provider value={rail}>{children}</FloatRailContext.Provider>;
}

const DETACHED = createRail();

// eslint-disable-next-line react-refresh/only-export-components
export function useFloatRail(): FloatRail {
  return useContext(FloatRailContext) ?? DETACHED;
}

/** Register one occupant while the calling component is mounted. */
// eslint-disable-next-line react-refresh/only-export-components
export function useRailOccupant<K extends keyof RailOccupancy>(key: K, value: RailOccupancy[K]) {
  const rail = useFloatRail();
  useEffect(() => {
    rail.set(key, value);
  }, [rail, key, value]);
  useEffect(() => () => rail.set(key, EMPTY[key]), [rail, key]);
}

/** Whether a bubble at (x, y) still sits on the rail's first slot. */
// eslint-disable-next-line react-refresh/only-export-components
export function isOnRail(x: number, y: number, size: number, vw: number, vh: number): boolean {
  const railLeft = vw - RAIL.right - RAIL.width;
  return x + size > railLeft && y + size > vh - RAIL.slots[1];
}

/** The toast stack's `bottom`, decided once when the stack appears (R2/R3). */
// eslint-disable-next-line react-refresh/only-export-components
export function toastBottom(o: RailOccupancy, vw: number, vh: number): number {
  const w = o.chatWindow;
  const railLeft = vw - RAIL.right - RAIL.width;
  if (w && w.left + w.width > railLeft && w.top + w.height > vh - RAIL.slots[2]) {
    // Clamp into the viewport the way the window clamps itself: keep room
    // for at least one short toast below the top edge.
    const above = vh - w.top + RAIL.windowGap;
    return Math.min(Math.max(above, RAIL.slots[0]), vh - RAIL.windowGap - MIN_TOAST_HEIGHT);
  }
  if (!o.bubbleOnRail) return RAIL.slots[0];
  if (!o.fabReserved) return RAIL.slots[1];
  return RAIL.slots[2];
}
