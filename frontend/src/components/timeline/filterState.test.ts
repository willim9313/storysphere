import { describe, expect, it } from 'vitest';
import type { TimelineEvent } from '@/api/types';
import { buildTimelineData } from '@/lib/timelineGeometry';
import { buildFilterOptions, createDefaultFilter, eventPassesFilter } from './filterState';

const ev = (id: string, rank: number | null, narrativeMode = 'present') =>
  ({
    id,
    title: id,
    eventType: 'plot',
    chapter: 1,
    narrativeMode,
    chronologicalRank: rank,
    eventImportance: null,
    hasAnalysis: false,
    temporalDisplacement: null,
    participants: [],
  }) as unknown as TimelineEvent;

describe('narrative mode in the filter', () => {
  it('matches the derived mode, not the backend field', () => {
    // Told third of three but happened first: a flashback by deviation, while
    // the backend still says "present".
    const data = buildTimelineData([ev('a', 0.5), ev('b', 1), ev('c', 0)]);
    const c = data.find((d) => d.id === 'c')!;
    expect(c.mode).toBe('flashback');

    const filter = { ...createDefaultFilter(), narrativeModes: new Set(['flashback']) };
    expect(eventPassesFilter(c, filter)).toBe(true);
    const present = { ...createDefaultFilter(), narrativeModes: new Set(['present']) };
    expect(eventPassesFilter(c, present)).toBe(false);
  });

  it('ignores a backend flashback the ranks do not support', () => {
    const data = buildTimelineData([ev('a', null, 'flashback'), ev('b', null)]);
    const filter = { ...createDefaultFilter(), narrativeModes: new Set(['flashback']) };
    expect(data.some((d) => eventPassesFilter(d, filter))).toBe(false);
  });

  it('offers only the derived modes as options', () => {
    const unranked = buildTimelineData([ev('a', null, 'flashback'), ev('b', null, 'present')]);
    expect(buildFilterOptions(unranked).narrativeModes).toEqual(['unknown']);

    const ranked = buildTimelineData([ev('a', 0), ev('b', 1), ev('c', 0.5)]);
    expect(buildFilterOptions(ranked).narrativeModes).toEqual(['flashback', 'flashforward', 'present']);
  });
});
