import { describe, expect, it } from 'vitest';

import { MIN_LABEL_PX, placeLabels, type LabelCandidate } from './labelPlacement';

const node = (id: string, x: number, y: number, priority = 1, labelWidth = 40): LabelCandidate => ({
  id,
  x,
  y,
  halfWidth: 8,
  halfHeight: 8,
  labelWidth,
  priority,
});

describe('placeLabels', () => {
  it('labels every node when nothing collides', () => {
    const shown = placeLabels([node('a', 0, 0), node('b', 200, 0), node('c', 0, 200)], 12);
    expect([...shown].sort()).toEqual(['a', 'b', 'c']);
  });

  it('keeps the higher-priority label when two would overlap', () => {
    // Side by side, 20px apart: their 40px-wide labels collide.
    const shown = placeLabels([node('minor', 0, 0, 1), node('major', 20, 0, 5)], 12);
    expect([...shown]).toEqual(['major']);
  });

  it('skips a label that would cover another node', () => {
    // b sits right under a, where a's label would go.
    const shown = placeLabels([node('a', 0, 0, 5, 20), node('b', 0, 20, 1, 20)], 12);
    expect(shown.has('a')).toBe(false);
    expect(shown.has('b')).toBe(true);
  });

  it('skips a label under a screen obstacle', () => {
    const ribbon = { x1: -100, x2: 100, y1: 0, y2: 40 };
    const shown = placeLabels([node('a', 0, 0), node('b', 300, 0)], 12, [ribbon]);
    expect([...shown]).toEqual(['b']);
  });

  it('labels nothing once the rendered font is too small to read', () => {
    expect(placeLabels([node('a', 0, 0)], MIN_LABEL_PX - 0.5).size).toBe(0);
  });

  it('is deterministic for equal priorities', () => {
    const run = () => [...placeLabels([node('b', 20, 0), node('a', 0, 0)], 12)];
    expect(run()).toEqual(run());
    expect(run()).toEqual(['a']);
  });
});
