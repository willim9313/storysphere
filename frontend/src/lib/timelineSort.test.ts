import { describe, expect, it } from 'vitest';
import { sortEventsForOrder } from './timelineSort';
import type { TimelineEvent } from '@/api/types';

function makeEvent(
  id: string,
  chapter: number,
  chronologicalRank: number | null,
): TimelineEvent {
  return {
    id,
    title: `事件 ${id}`,
    eventType: 'ACTION',
    description: '',
    chapter,
    chronologicalRank,
    narrativeMode: 'present',
    eventImportance: null,
    hasAnalysis: false,
    participants: [],
  };
}

const ids = (events: TimelineEvent[]) => events.map((e) => e.id);

describe('sortEventsForOrder — chronological', () => {
  it('orders by rank ascending', () => {
    const events = [makeEvent('c', 3, 0.9), makeEvent('a', 1, 0.1), makeEvent('b', 2, 0.5)];
    expect(ids(sortEventsForOrder(events, 'chronological'))).toEqual(['a', 'b', 'c']);
  });

  it('sinks unranked events to the end instead of treating them as rank 0', () => {
    const events = [makeEvent('unranked', 9, null), makeEvent('ranked', 1, 0.4)];
    expect(ids(sortEventsForOrder(events, 'chronological'))).toEqual(['ranked', 'unranked']);
  });

  it('keeps several unranked events in chapter order at the end', () => {
    const events = [
      makeEvent('u5', 5, null),
      makeEvent('r', 4, 0.7),
      makeEvent('u2', 2, null),
    ];
    expect(ids(sortEventsForOrder(events, 'chronological'))).toEqual(['r', 'u2', 'u5']);
  });

  it('falls back to chapter order when nothing has a rank', () => {
    const events = [makeEvent('c', 3, null), makeEvent('a', 1, null), makeEvent('b', 2, null)];
    expect(ids(sortEventsForOrder(events, 'chronological'))).toEqual(['a', 'b', 'c']);
  });

  it('breaks equal ranks by chapter', () => {
    const events = [makeEvent('late', 8, 0.5), makeEvent('early', 2, 0.5)];
    expect(ids(sortEventsForOrder(events, 'chronological'))).toEqual(['early', 'late']);
  });

  it('treats rank 0 as a real position, not as missing', () => {
    const events = [makeEvent('unranked', 1, null), makeEvent('zero', 7, 0)];
    expect(ids(sortEventsForOrder(events, 'chronological'))).toEqual(['zero', 'unranked']);
  });
});

describe('sortEventsForOrder — other views', () => {
  it('leaves narrative order untouched (backend already sorts by chapter)', () => {
    const events = [makeEvent('a', 1, 0.9), makeEvent('b', 2, null), makeEvent('c', 3, 0.1)];
    expect(ids(sortEventsForOrder(events, 'narrative'))).toEqual(['a', 'b', 'c']);
  });

  it('leaves matrix order untouched', () => {
    const events = [makeEvent('a', 1, 0.9), makeEvent('b', 2, 0.1)];
    expect(ids(sortEventsForOrder(events, 'matrix'))).toEqual(['a', 'b']);
  });

  it('does not mutate the input array', () => {
    const events = [makeEvent('c', 3, 0.9), makeEvent('a', 1, 0.1)];
    sortEventsForOrder(events, 'chronological');
    expect(ids(events)).toEqual(['c', 'a']);
  });
});
