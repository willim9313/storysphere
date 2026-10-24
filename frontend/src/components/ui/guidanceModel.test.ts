import { describe, expect, it } from 'vitest';

import {
  countDismissed,
  dismissedAmong,
  dismissSurface,
  guidanceKey,
  isSurfaceDismissed,
  listDismissedKeys,
  reopenSurface,
  resetAllDismissed,
  type GuidanceStorage,
} from './guidanceModel';

function fakeStorage(seed: Record<string, string> = {}): GuidanceStorage {
  const data = new Map(Object.entries(seed));
  return {
    get length() {
      return data.size;
    },
    key: (i) => [...data.keys()][i] ?? null,
    getItem: (k) => data.get(k) ?? null,
    setItem: (k, v) => void data.set(k, v),
    removeItem: (k) => void data.delete(k),
  };
}

describe('guidance dismiss model', () => {
  it('builds the documented key', () => {
    expect(guidanceKey('graph')).toBe('storysphere:guidance-dismissed:graph');
  });

  it('lists and counts only guidance keys', () => {
    const s = fakeStorage({
      'storysphere:guidance-dismissed:graph': '1',
      'storysphere:guidance-dismissed:reader': '1',
      'storysphere:theme': 'ink',
      'guidance-dismissed:legacy': '1',
    });
    expect(listDismissedKeys(s).sort()).toEqual([
      'storysphere:guidance-dismissed:graph',
      'storysphere:guidance-dismissed:reader',
    ]);
    expect(countDismissed(s)).toBe(2);
    expect(countDismissed(fakeStorage())).toBe(0);
  });

  it('dismisses and reopens one surface without touching others', () => {
    const s = fakeStorage();
    dismissSurface(s, 'event-overview');
    dismissSurface(s, 'event-detail');
    reopenSurface(s, 'event-detail');
    expect(isSurfaceDismissed(s, 'event-overview')).toBe(true);
    expect(isSurfaceDismissed(s, 'event-detail')).toBe(false);
  });

  it('reset removes every guidance key and keeps unrelated ones', () => {
    const s = fakeStorage({
      'storysphere:guidance-dismissed:a': '1',
      'storysphere:guidance-dismissed:b': '1',
      'storysphere:theme': 'ink',
    });
    expect(resetAllDismissed(s)).toBe(2);
    expect(countDismissed(s)).toBe(0);
    expect(s.getItem('storysphere:theme')).toBe('ink');
    expect(resetAllDismissed(s)).toBe(0);
  });

  it('only considers mounted surfaces for the reopen button', () => {
    const dismissed = new Set(['event-overview', 'graph']);
    expect(dismissedAmong(['event-detail'], (x) => dismissed.has(x))).toEqual([]);
    expect(dismissedAmong(['event-overview'], (x) => dismissed.has(x))).toEqual(['event-overview']);
  });
});
