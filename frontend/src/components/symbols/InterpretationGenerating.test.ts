import { describe, expect, it } from 'vitest';

import { deriveStages } from './symbolViewModel';

const states = (progress: number) => deriveStages(progress, 7).map((s) => s.state);

describe('deriveStages', () => {
  it('marks the stage being worked on as running, not waiting', () => {
    expect(states(0)).toEqual(['running', 'running', 'running', 'pending', 'pending']);
    expect(states(40)).toEqual(['done', 'done', 'done', 'running', 'pending']);
    expect(states(90)).toEqual(['done', 'done', 'done', 'done', 'running']);
    expect(states(100)).toEqual(['done', 'done', 'done', 'done', 'done']);
  });

  it('keeps the three evidence stages in one state', () => {
    for (const p of [0, 10, 40, 100]) {
      const [a, b, c] = states(p);
      expect(a).toBe(b);
      expect(b).toBe(c);
    }
  });

  it('carries the total occurrence count, not a live one', () => {
    expect(deriveStages(40, 7)[1].count).toBe(7);
  });
});
