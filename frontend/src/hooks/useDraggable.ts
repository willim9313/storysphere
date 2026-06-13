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

function clamp(val: number, min: number, max: number): number {
  return Math.max(min, Math.min(max, val));
}

function loadPos(
  storageKey: string,
  fallback: Position,
  w: number,
  h: number,
): Position {
  try {
    const raw = localStorage.getItem(storageKey);
    if (raw) {
      const parsed = JSON.parse(raw) as { x?: unknown; y?: unknown };
      if (typeof parsed.x === 'number' && typeof parsed.y === 'number') {
        return {
          x: clamp(parsed.x, 0, window.innerWidth - w),
          y: clamp(parsed.y, 0, window.innerHeight - h),
        };
      }
    }
  } catch {
    // ignore parse / storage errors
  }
  return fallback;
}

export function useDraggable({
  storageKey,
  defaultPos,
  elementWidth,
  elementHeight,
}: UseDraggableOptions): UseDraggableReturn {
  const [isDragging, setIsDragging] = useState(false);
  const [pos, setPos] = useState<Position>(() =>
    loadPos(storageKey, defaultPos(), elementWidth, elementHeight),
  );

  // Ref always holds the latest pos so onMouseDown closure doesn't go stale
  const posRef = useRef(pos);
  // Track whether the last interaction moved the element (click vs drag)
  const draggedRef = useRef(false);
  useEffect(() => {
    posRef.current = pos;
  }, [pos]);

  // Re-clamp if viewport resizes (e.g. rotate phone, resize window)
  useEffect(() => {
    const onResize = () => {
      setPos((p) => ({
        x: clamp(p.x, 0, window.innerWidth - elementWidth),
        y: clamp(p.y, 0, window.innerHeight - elementHeight),
      }));
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
        try {
          localStorage.setItem(storageKey, JSON.stringify(latestPos));
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
