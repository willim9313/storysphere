import { useState, useCallback, useEffect, useRef } from 'react';
import type { MouseEvent } from 'react';

interface Position {
  x: number;
  y: number;
}

interface UseDraggableOptions {
  storageKey: string;
  defaultPos: () => Position;
  elementWidth: number;
  elementHeight: number;
}

interface UseDraggableReturn {
  pos: Position;
  isDragging: boolean;
  dragHandleProps: {
    onMouseDown: (e: MouseEvent) => void;
  };
  draggedRef: { current: boolean };
}

/**
 * Where the element sits, as a distance from its nearest viewport corner.
 * Absolute x/y went stale on every resize: a bubble left at the bottom-right
 * of a 1024 window ended up mid-content once the window was widened (B-130).
 */
interface Anchor {
  ax: 'left' | 'right';
  dx: number;
  ay: 'top' | 'bottom';
  dy: number;
}

function clamp(val: number, min: number, max: number): number {
  return Math.max(min, Math.min(max, val));
}

function toAnchor(p: Position, w: number, h: number): Anchor {
  const vw = window.innerWidth;
  const vh = window.innerHeight;
  const right = p.x + w / 2 > vw / 2;
  const bottom = p.y + h / 2 > vh / 2;
  return {
    ax: right ? 'right' : 'left',
    dx: right ? vw - p.x - w : p.x,
    ay: bottom ? 'bottom' : 'top',
    dy: bottom ? vh - p.y - h : p.y,
  };
}

function toPos(a: Anchor, w: number, h: number): Position {
  const vw = window.innerWidth;
  const vh = window.innerHeight;
  return {
    x: clamp(a.ax === 'right' ? vw - w - a.dx : a.dx, 0, vw - w),
    y: clamp(a.ay === 'bottom' ? vh - h - a.dy : a.dy, 0, vh - h),
  };
}

function loadAnchor(
  storageKey: string,
  fallback: Position,
  w: number,
  h: number,
): Anchor {
  try {
    const raw = localStorage.getItem(storageKey);
    if (raw) {
      const parsed = JSON.parse(raw) as Partial<Anchor> & { x?: unknown; y?: unknown };
      if (
        (parsed.ax === 'left' || parsed.ax === 'right') &&
        (parsed.ay === 'top' || parsed.ay === 'bottom') &&
        typeof parsed.dx === 'number' &&
        typeof parsed.dy === 'number'
      ) {
        return { ax: parsed.ax, dx: parsed.dx, ay: parsed.ay, dy: parsed.dy };
      }
      // Pre-anchor format: absolute x/y, re-read against the nearest corner.
      if (typeof parsed.x === 'number' && typeof parsed.y === 'number') {
        return toAnchor(
          { x: clamp(parsed.x, 0, window.innerWidth - w), y: clamp(parsed.y, 0, window.innerHeight - h) },
          w,
          h,
        );
      }
    }
  } catch {
    // ignore parse / storage errors
  }
  return toAnchor(fallback, w, h);
}

export function useDraggable({
  storageKey,
  defaultPos,
  elementWidth,
  elementHeight,
}: UseDraggableOptions): UseDraggableReturn {
  const [isDragging, setIsDragging] = useState(false);
  // The anchor is the source of truth; pos is derived from it on resize.
  const [initialAnchor] = useState(() => loadAnchor(storageKey, defaultPos(), elementWidth, elementHeight));
  const anchorRef = useRef<Anchor>(initialAnchor);
  const [pos, setPos] = useState<Position>(() => toPos(initialAnchor, elementWidth, elementHeight));

  // Ref always holds the latest pos so onMouseDown closure doesn't go stale
  const posRef = useRef(pos);
  // Track whether the last interaction moved the element (click vs drag)
  const draggedRef = useRef(false);
  useEffect(() => {
    posRef.current = pos;
  }, [pos]);

  // Re-place from the anchor on resize, so the element keeps its distance to
  // its corner (a shrink that clamps it springs back when the window grows).
  useEffect(() => {
    const onResize = () => {
      setPos(toPos(anchorRef.current, elementWidth, elementHeight));
    };
    window.addEventListener('resize', onResize);
    return () => window.removeEventListener('resize', onResize);
  }, [elementWidth, elementHeight]);

  const onMouseDown = useCallback(
    (e: MouseEvent) => {
      if (e.button !== 0) return;
      e.preventDefault();

      draggedRef.current = false;

      // Capture offset from element's top-left at drag start
      const startX = e.clientX - posRef.current.x;
      const startY = e.clientY - posRef.current.y;
      setIsDragging(true);

      let latestPos = posRef.current;

      const onMouseMove = (me: globalThis.MouseEvent) => {
        draggedRef.current = true;
        const newPos: Position = {
          x: clamp(me.clientX - startX, 0, window.innerWidth - elementWidth),
          y: clamp(me.clientY - startY, 0, window.innerHeight - elementHeight),
        };
        latestPos = newPos;
        setPos(newPos);
      };

      const onMouseUp = () => {
        setIsDragging(false);
        document.removeEventListener('mousemove', onMouseMove);
        document.removeEventListener('mouseup', onMouseUp);
        anchorRef.current = toAnchor(latestPos, elementWidth, elementHeight);
        try {
          localStorage.setItem(storageKey, JSON.stringify(anchorRef.current));
        } catch {
          // ignore storage errors
        }
      };

      document.addEventListener('mousemove', onMouseMove);
      document.addEventListener('mouseup', onMouseUp);
    },
    [storageKey, elementWidth, elementHeight],
  );

  return { pos, isDragging, dragHandleProps: { onMouseDown }, draggedRef };
}
