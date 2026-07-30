import { describe, expect, it } from 'vitest';
import type { TimelineEvent } from '@/api/types';
import {
  BEESWARM_SPACING,
  LANE_GAP_MIN,
  MATRIX_HEIGHT,
  OUTLIER_THRESHOLD,
  STAVE_MID,
  STAVE_SCALE,
  STAVE_TARGET_PER_ROW,
  beeswarmOffset,
  buildLane,
  buildMatrixPoints,
  buildMatrixUnranked,
  buildStaveRows,
  buildTimelineData,
  chapterCentrePct,
  chapterList,
  coPresence,
  deriveMode,
  staveRowCount,
  timelineStats,
} from './timelineGeometry';

function makeEvent(over: Partial<TimelineEvent> & { id: string }): TimelineEvent {
  return {
    title: 'Event ' + over.id,
    eventType: 'plot',
    description: '',
    chapter: 1,
    chronologicalRank: null,
    narrativeMode: 'present',
    eventImportance: null,
    hasAnalysis: false,
    participants: [],
    ...over,
  } as TimelineEvent;
}

/** n events spread over `chapters` chapters, ranks exactly on the diagonal. */
function diagonal(n: number, chapters = 1): TimelineEvent[] {
  return Array.from({ length: n }, (_, i) =>
    makeEvent({
      id: 'e' + i,
      chapter: Math.floor((i / n) * chapters) + 1,
      chronologicalRank: n > 1 ? i / (n - 1) : 0,
    }),
  );
}

describe('buildTimelineData', () => {
  it('gives a single event expectedRank 0 without dividing by zero', () => {
    const [d] = buildTimelineData([makeEvent({ id: 'a', chronologicalRank: 0.5 })]);
    expect(d.expectedRank).toBe(0);
    expect(d.deviation).toBe(0.5);
  });

  it('reports zero deviation when narrative order equals story order', () => {
    const data = buildTimelineData(diagonal(10));
    expect(data.every((d) => Math.abs(d.deviation!) < 1e-9)).toBe(true);
    expect(data.some((d) => d.outlier)).toBe(false);
  });

  it('keeps deviation null for unranked events rather than coercing to 0', () => {
    const data = buildTimelineData([
      makeEvent({ id: 'a', chronologicalRank: 0 }),
      makeEvent({ id: 'b', chronologicalRank: null }),
      makeEvent({ id: 'c', chronologicalRank: 1 }),
    ]);
    expect(data[1].deviation).toBeNull();
    expect(data[1].outlier).toBe(false);
    expect(data[1].mode).toBe('unknown');
  });

  it('marks an event as an outlier only past the threshold', () => {
    // 3 events -> expectedRank 0 / 0.5 / 1.0. Stay clear of the exact
    // threshold: at 0.5 + 0.15 the float lands a hair over and the boundary
    // itself is not a behaviour worth pinning.
    const under = buildTimelineData([
      makeEvent({ id: 'a', chronologicalRank: 0 }),
      makeEvent({ id: 'b', chronologicalRank: 0.5 + OUTLIER_THRESHOLD - 0.01 }),
      makeEvent({ id: 'c', chronologicalRank: 1 }),
    ]);
    expect(under[1].outlier).toBe(false);
    expect(under[1].mode).toBe('present');

    const over = buildTimelineData([
      makeEvent({ id: 'a', chronologicalRank: 0 }),
      makeEvent({ id: 'b', chronologicalRank: 0.5 + OUTLIER_THRESHOLD + 0.01 }),
      makeEvent({ id: 'c', chronologicalRank: 1 }),
    ]);
    expect(over[1].outlier).toBe(true);
    expect(over[1].mode).toBe('flashforward');
  });

  it('derives KERNEL from eventImportance', () => {
    const data = buildTimelineData([
      makeEvent({ id: 'a', eventImportance: 'KERNEL' }),
      makeEvent({ id: 'b', eventImportance: 'SATELLITE' }),
      makeEvent({ id: 'c', eventImportance: null }),
    ]);
    expect(data.map((d) => d.isKernel)).toEqual([true, false, false]);
  });

  /* `isKernel` folds SATELLITE and "never measured" into the same false, which
     is why labels must not be derived from it. */
  it('keeps unmeasured importance distinct from SATELLITE', () => {
    const data = buildTimelineData([
      makeEvent({ id: 'a', eventImportance: 'KERNEL' }),
      makeEvent({ id: 'b', eventImportance: 'SATELLITE' }),
      makeEvent({ id: 'c', eventImportance: null }),
    ]);
    expect(data.map((d) => d.importance)).toEqual(['KERNEL', 'SATELLITE', null]);
  });
});

describe('deriveMode', () => {
  it('maps null to unknown', () => {
    expect(deriveMode(null)).toBe('unknown');
  });
  it('maps negative displacement to flashback', () => {
    expect(deriveMode(-0.4)).toBe('flashback');
  });
  it('maps positive displacement to flashforward', () => {
    expect(deriveMode(0.4)).toBe('flashforward');
  });
  it('maps small displacement to present', () => {
    expect(deriveMode(0.01)).toBe('present');
    expect(deriveMode(-OUTLIER_THRESHOLD)).toBe('present');
  });
});

describe('staveRowCount', () => {
  it('returns 0 for no events', () => {
    expect(staveRowCount(0)).toBe(0);
  });
  it('gives the seed book (62 events) three rows', () => {
    expect(staveRowCount(62)).toBe(3);
  });
  it('scales beyond the seed book instead of cramming a fixed 3 rows', () => {
    expect(staveRowCount(400)).toBe(Math.ceil(400 / STAVE_TARGET_PER_ROW));
  });
  it('never returns 0 rows for a non-empty book', () => {
    expect(staveRowCount(1)).toBe(1);
  });
});

describe('buildStaveRows', () => {
  it('places a zero-deviation point exactly on the midline', () => {
    const rows = buildStaveRows(buildTimelineData(diagonal(10)));
    expect(rows[0].points.every((p) => Math.abs(p.yPx - STAVE_MID) < 1e-9)).toBe(true);
  });

  it('places a flashback below the midline and a flashforward above', () => {
    const data = buildTimelineData([
      makeEvent({ id: 'a', chronologicalRank: 0 }),
      makeEvent({ id: 'b', chronologicalRank: 1 }), // expected 0.5 -> dev +0.5
      makeEvent({ id: 'c', chronologicalRank: 0.5 }),
    ]);
    const [row] = buildStaveRows(data);
    const b = row.points.find((p) => p.id === 'b')!;
    expect(b.yPx).toBeCloseTo(STAVE_MID - 0.5 * STAVE_SCALE);
    expect(b.yPx).toBeLessThan(STAVE_MID);
  });

  it('routes unranked events to the band instead of the midline', () => {
    const data = buildTimelineData([
      makeEvent({ id: 'a', chronologicalRank: 0 }),
      makeEvent({ id: 'b', chronologicalRank: null }),
      makeEvent({ id: 'c', chronologicalRank: 1 }),
    ]);
    const [row] = buildStaveRows(data);
    expect(row.points.map((p) => p.id)).toEqual(['a', 'c']);
    expect(row.unranked.map((u) => u.id)).toEqual(['b']);
    expect(row.hasUnranked).toBe(true);
  });

  it('annotates a judged event geometry would not have flagged', () => {
    // Dead on the diagonal — no deviation at all — but #21h called it a
    // flashback. Without the verdict this row would carry no annotation.
    const data = buildTimelineData([
      makeEvent({ id: 'a', chronologicalRank: 0 }),
      makeEvent({
        id: 'b',
        chronologicalRank: 0.5,
        temporalDisplacement: {
          type: 'analepsis',
          displacement: -4,
          textRank: 2,
          storyRank: 1,
        },
      }),
      makeEvent({ id: 'c', chronologicalRank: 1 }),
    ]);
    const [row] = buildStaveRows(data);
    expect(row.annotations).toHaveLength(1);
    expect(row.annotations[0]).toMatchObject({ id: 'b', kind: 'flashback', confirmed: true });
  });

  it('prefers the judged event over the more displaced one in a chapter', () => {
    const data = buildTimelineData([
      makeEvent({ id: 'a', chronologicalRank: 0 }),
      makeEvent({ id: 'big', chronologicalRank: 1 }), // largest deviation, unjudged
      makeEvent({
        id: 'judged',
        chronologicalRank: 0.5 + OUTLIER_THRESHOLD + 0.01,
        temporalDisplacement: {
          type: 'prolepsis',
          displacement: 2,
          textRank: 3,
          storyRank: 5,
        },
      }),
      makeEvent({ id: 'd', chronologicalRank: 1 }),
    ]);
    const [row] = buildStaveRows(data);
    expect(row.annotations).toHaveLength(1);
    expect(row.annotations[0]).toMatchObject({ id: 'judged', confirmed: true });
  });

  it('drops an overlapping annotation, keeping the judged one', () => {
    // Two adjacent chapters both qualify; their labels would print on top of
    // each other, and the judged verdict is the one worth keeping.
    // 10 events over 2 chapters: the two annotated ones sit at adjacent
    // indices, ~11% apart, which is inside ANNOTATION_MIN_GAP_PCT.
    const events = Array.from({ length: 10 }, (_, i) =>
      makeEvent({
        id: 'e' + i,
        chapter: i < 5 ? 1 : 2,
        chronologicalRank: i / 9,
      }),
    );
    events[4] = makeEvent({ id: 'geo', chapter: 1, chronologicalRank: 1 });
    events[5] = makeEvent({
      id: 'judged',
      chapter: 2,
      chronologicalRank: 5 / 9,
      temporalDisplacement: {
        type: 'analepsis',
        displacement: -3,
        textRank: 6,
        storyRank: 1,
      },
    });
    const data = buildTimelineData(events);
    const [row] = buildStaveRows(data);
    expect(row.annotations).toHaveLength(1);
    expect(row.annotations[0].id).toBe('judged');
  });

  it('falls back to the geometric reading when nothing is judged', () => {
    const data = buildTimelineData([
      makeEvent({ id: 'a', chronologicalRank: 0 }),
      makeEvent({ id: 'b', chronologicalRank: 1 }),
      makeEvent({ id: 'c', chronologicalRank: 0.5 }),
    ]);
    const [row] = buildStaveRows(data);
    expect(row.annotations[0]).toMatchObject({ confirmed: false });
  });

  it('omits the unranked band when a row has none', () => {
    const [row] = buildStaveRows(buildTimelineData(diagonal(5)));
    expect(row.hasUnranked).toBe(false);
    expect(row.unranked).toHaveLength(0);
  });

  it('keeps chapter bands for chapters whose events are all filtered out', () => {
    const data = buildTimelineData(diagonal(6, 3));
    const [row] = buildStaveRows(data, (d) => d.chapter !== 2);
    expect(row.bands.map((b) => b.chapter)).toEqual([1, 2, 3]);
    expect(row.points.some((p) => p.datum.chapter === 2)).toBe(false);
  });

  it('breaks the connecting line across a filtered-out point', () => {
    const data = buildTimelineData(diagonal(3));
    const all = buildStaveRows(data);
    const gapped = buildStaveRows(data, (d) => d.index !== 1);
    expect(all[0].links).toHaveLength(2);
    // a-b and b-c both disappear; a-c is NOT joined across the gap.
    expect(gapped[0].links).toHaveLength(0);
  });

  it('splits events across the derived number of rows', () => {
    const rows = buildStaveRows(buildTimelineData(diagonal(62)));
    expect(rows).toHaveLength(3);
    expect(rows.reduce((n, r) => n + r.points.length, 0)).toBe(62);
  });

  it('annotates at most one outlier per chapter and picks the worst', () => {
    const events = diagonal(10, 2);
    events[1].chronologicalRank = 0.9; // big flashforward, Ch.1
    events[2].chronologicalRank = 0.6; // smaller flashforward, Ch.1
    const [row] = buildStaveRows(buildTimelineData(events));
    const ch1 = row.annotations.filter((a) => a.chapter === 1);
    expect(ch1).toHaveLength(1);
    expect(ch1[0].id).toBe('e1');
    expect(ch1[0].count).toBe(2);
    expect(ch1[0].kind).toBe('flashforward');
  });
});

describe('beeswarmOffset', () => {
  it('alternates around the column centre', () => {
    const offsets = [0, 1, 2, 3, 4].map((k) => beeswarmOffset(k, BEESWARM_SPACING));
    expect(offsets).toEqual([0, -7, 7, -14, 14]);
  });

  it('never repeats an offset within a chapter, so points stay clickable', () => {
    const offsets = Array.from({ length: 11 }, (_, k) =>
      beeswarmOffset(k, BEESWARM_SPACING),
    );
    expect(new Set(offsets).size).toBe(11);
  });
});

describe('matrix', () => {
  it('maps rank 1 to the top and rank 0 to the bottom', () => {
    const data = buildTimelineData([
      makeEvent({ id: 'top', chronologicalRank: 1 }),
      makeEvent({ id: 'bottom', chronologicalRank: 0 }),
    ]);
    const pts = buildMatrixPoints(data, [1]);
    expect(pts.find((p) => p.id === 'top')!.yPx).toBe(0);
    expect(pts.find((p) => p.id === 'bottom')!.yPx).toBe(MATRIX_HEIGHT);
  });

  it('excludes unranked events from the plot', () => {
    const data = buildTimelineData([
      makeEvent({ id: 'a', chronologicalRank: 0.5 }),
      makeEvent({ id: 'b', chronologicalRank: null }),
    ]);
    expect(buildMatrixPoints(data, [1]).map((p) => p.id)).toEqual(['a']);
  });

  it('counts the beeswarm index per chapter, not globally', () => {
    const events = [
      makeEvent({ id: 'a1', chapter: 1, chronologicalRank: 0.1 }),
      makeEvent({ id: 'a2', chapter: 1, chronologicalRank: 0.2 }),
      makeEvent({ id: 'b1', chapter: 2, chronologicalRank: 0.3 }),
    ];
    const pts = buildMatrixPoints(buildTimelineData(events), [1, 2]);
    // First point of each chapter must sit at offset 0.
    expect(pts.find((p) => p.id === 'a1')!.offsetPx).toBe(0);
    expect(pts.find((p) => p.id === 'b1')!.offsetPx).toBe(0);
    expect(pts.find((p) => p.id === 'a2')!.offsetPx).not.toBe(0);
  });

  it('offsets the unranked band per chapter too', () => {
    const events = [
      makeEvent({ id: 'a1', chapter: 1 }),
      makeEvent({ id: 'a2', chapter: 1 }),
      makeEvent({ id: 'b1', chapter: 2 }),
    ];
    const un = buildMatrixUnranked(buildTimelineData(events), [1, 2]);
    expect(un.find((p) => p.id === 'a1')!.offsetPx).toBe(0);
    expect(un.find((p) => p.id === 'b1')!.offsetPx).toBe(0);
    expect(un.find((p) => p.id === 'a2')!.offsetPx).not.toBe(0);
  });

  it('spaces chapter columns evenly from the actual chapter list', () => {
    expect(chapterCentrePct(1, [1, 2])).toBe(25);
    expect(chapterCentrePct(2, [1, 2])).toBe(75);
    // Chapter numbers need not be contiguous.
    expect(chapterCentrePct(9, [3, 9])).toBe(75);
  });
});

describe('buildLane', () => {
  const cast = (ids: string[]) =>
    ids.map((id) => ({ id, name: id, type: 'character' as const }));

  it('counts appearances and absences', () => {
    const events = [
      makeEvent({ id: 'a', participants: cast(['x']) }),
      makeEvent({ id: 'b', participants: [] }),
      makeEvent({ id: 'c', participants: cast(['x']) }),
    ];
    const lane = buildLane(buildTimelineData(events), 'x', 'X');
    expect(lane.appearances).toBe(2);
    expect(lane.absent).toBe(1);
    expect(lane.dots.map((d) => d.id)).toEqual(['a', 'c']);
  });

  it('ignores absence runs shorter than the minimum', () => {
    const events = [
      makeEvent({ id: 'a', participants: cast(['x']) }),
      makeEvent({ id: 'b', participants: [] }),
      makeEvent({ id: 'c', participants: cast(['x']) }),
    ];
    const lane = buildLane(buildTimelineData(events), 'x', 'X');
    expect(lane.absences).toHaveLength(0);
    expect(lane.longestAbsence).toBe(0);
  });

  it('records an absence run at the minimum length', () => {
    const events = [
      makeEvent({ id: 'a', participants: cast(['x']) }),
      ...Array.from({ length: LANE_GAP_MIN }, (_, i) =>
        makeEvent({ id: 'gap' + i, chapter: 2, participants: [] }),
      ),
      makeEvent({ id: 'z', chapter: 3, participants: cast(['x']) }),
    ];
    const lane = buildLane(buildTimelineData(events), 'x', 'X');
    expect(lane.absences).toHaveLength(1);
    expect(lane.absences[0].length).toBe(LANE_GAP_MIN);
    expect(lane.absences[0].startChapter).toBe(2);
    expect(lane.longestAbsence).toBe(LANE_GAP_MIN);
  });

  it('flags an absence starting at the first event as an opening absence', () => {
    const events = [
      ...Array.from({ length: 4 }, (_, i) => makeEvent({ id: 'g' + i, participants: [] })),
      makeEvent({ id: 'z', participants: cast(['x']) }),
    ];
    const lane = buildLane(buildTimelineData(events), 'x', 'X');
    expect(lane.absences[0].fromOpening).toBe(true);
  });

  it('does not label absence runs too narrow to hold text', () => {
    // 40 events, one 3-event gap -> ~5% wide, below the 9% label threshold.
    const events = Array.from({ length: 40 }, (_, i) =>
      makeEvent({ id: 'e' + i, participants: i >= 10 && i < 13 ? [] : cast(['x']) }),
    );
    const lane = buildLane(buildTimelineData(events), 'x', 'X');
    expect(lane.absences).toHaveLength(1);
    expect(lane.labelled).toHaveLength(0);
  });

  it('uses narrative index for X so unranked events still position', () => {
    const events = [
      makeEvent({ id: 'a', participants: cast(['x']), chronologicalRank: null }),
      makeEvent({ id: 'b', participants: cast(['x']), chronologicalRank: null }),
    ];
    const lane = buildLane(buildTimelineData(events), 'x', 'X');
    expect(lane.dots.map((d) => d.xPct)).toEqual([0, 100]);
  });
});

describe('coPresence', () => {
  const cast = (ids: string[]) =>
    ids.map((id) => ({ id, name: id, type: 'character' as const }));

  it('returns positions where all selected characters appear', () => {
    const events = [
      makeEvent({ id: 'a', participants: cast(['x', 'y']) }),
      makeEvent({ id: 'b', participants: cast(['x']) }),
      makeEvent({ id: 'c', participants: cast(['x', 'y']) }),
    ];
    expect(coPresence(buildTimelineData(events), ['x', 'y'])).toEqual([0, 2]);
  });

  it('is empty for a single character', () => {
    const events = [makeEvent({ id: 'a', participants: cast(['x']) })];
    expect(coPresence(buildTimelineData(events), ['x'])).toEqual([]);
  });
});

describe('timelineStats', () => {
  it('splits ranked events into on-line and outliers', () => {
    const events = diagonal(10);
    events[3].chronologicalRank = 0.95; // outlier
    events[5].chronologicalRank = null; // unranked
    const stats = timelineStats(buildTimelineData(events));
    expect(stats.total).toBe(10);
    expect(stats.unranked).toBe(1);
    expect(stats.ranked).toBe(9);
    expect(stats.outliers).toBe(1);
    expect(stats.onLine).toBe(8);
  });

  it('counts analyzed events', () => {
    const events = [
      makeEvent({ id: 'a', hasAnalysis: true }),
      makeEvent({ id: 'b', hasAnalysis: false }),
    ];
    expect(timelineStats(buildTimelineData(events)).analyzed).toBe(1);
  });
});

describe('chapterList', () => {
  it('returns sorted unique chapters', () => {
    const events = [3, 1, 3, 2].map((chapter, i) => makeEvent({ id: 'e' + i, chapter }));
    expect(chapterList(buildTimelineData(events))).toEqual([1, 2, 3]);
  });
});
