import { describe, expect, it } from 'vitest';

import type { HeroJourneyStage } from '@/api/narrative';
import {
  chapterRuns,
  confidenceSpan,
  displacementCounts,
  formatChapterRuns,
  lastStageChapter,
  lowConfidenceCount,
  nextReviewStatus,
  normalizeChapters,
  repEmptyReason,
  resolveRepEvents,
  reversedStageIds,
  sharedChapters,
  stagesPerChapter,
  splitAffects,
  stagesSharingRange,
  summaryGate,
} from './narrativeModel';

describe('splitAffects', () => {
  it('splits the lead-in from the item on a full-width colon', () => {
    expect(splitAffects('將被刪除／覆寫：這 3 件事件目前的權重')).toEqual({
      title: '將被刪除／覆寫',
      item: '這 3 件事件目前的權重',
    });
  });
  it('splits on a half-width colon, keeping later colons in the item', () => {
    expect(splitAffects('Will be deleted: weights (now: 1)')).toEqual({
      title: 'Will be deleted',
      item: 'weights (now: 1)',
    });
  });
  it('without a colon the whole string is the item', () => {
    expect(splitAffects('abc')).toEqual({ title: '', item: 'abc' });
  });
});

const stage = (id: string, range: number[], confidence = 0.9): HeroJourneyStage => ({
  stage_id: id,
  stage_name: id,
  chapter_range: range,
  confidence,
  notes: null,
});

describe('normalizeChapters / chapterRuns', () => {
  it('sorts and de-duplicates', () => {
    expect(normalizeChapters([8, 1, 2, 2, 5])).toEqual([1, 2, 5, 8]);
  });
  it('drops non-positive and non-integer values', () => {
    expect(normalizeChapters([0, -1, 1.5, 3])).toEqual([3]);
  });
  it('splits a discontinuous list into runs instead of one 1–8 block', () => {
    expect(chapterRuns([1, 2, 5, 8])).toEqual([[1, 2], [5, 5], [8, 8]]);
    expect(formatChapterRuns([8, 1, 2, 5])).toBe('1–2、5、8');
  });
  it('keeps one contiguous run whole', () => {
    expect(chapterRuns([3, 4, 5])).toEqual([[3, 5]]);
  });
  it('handles empty input', () => {
    expect(chapterRuns([])).toEqual([]);
    expect(formatChapterRuns(undefined)).toBe('');
  });
});

describe('coverage and shared chapters', () => {
  const stages = [stage('a', [1, 2]), stage('b', [2, 3, 4]), stage('c', [1, 2, 5, 8]), stage('d', [])];
  it('counts only chapters a stage really covers', () => {
    // c covers 1,2,5,8 — not 3,4,6,7
    expect(stagesPerChapter(stages, 8)).toEqual([2, 3, 1, 1, 1, 0, 0, 1]);
  });
  it('marks chapters with three or more stages as shared', () => {
    expect([...sharedChapters(stagesPerChapter(stages, 8))]).toEqual([2]);
  });
  it('ignores chapters past the axis', () => {
    expect(stagesPerChapter([stage('x', [1, 12])], 3)).toEqual([1, 0, 0]);
  });
  it('finds the last chapter any stage touches', () => {
    expect(lastStageChapter(stages)).toBe(8);
    expect(lastStageChapter([])).toBe(0);
  });
});

describe('reversedStageIds', () => {
  it('flags a stage that starts before the previous one', () => {
    const out = reversedStageIds([stage('a', [1]), stage('b', [2, 3, 4]), stage('c', [1, 2, 5, 8]), stage('d', [6])]);
    expect([...out]).toEqual(['c']);
  });
  it('uses the smallest chapter, not the first array element', () => {
    const out = reversedStageIds([stage('a', [3]), stage('b', [9, 2])]);
    expect([...out]).toEqual(['b']);
  });
  it('skips absent stages without resetting the comparison', () => {
    const out = reversedStageIds([stage('a', [4]), stage('b', []), stage('c', [2])]);
    expect([...out]).toEqual(['c']);
  });
});

describe('stagesSharingRange', () => {
  it('requires the same actual chapter set', () => {
    const a = stage('a', [1, 2, 5, 8]);
    const b = stage('b', [8, 5, 2, 1, 1]);
    const c = stage('c', [1, 2, 3, 4, 5, 6, 7, 8]);
    expect(stagesSharingRange(a, [a, b, c]).map((s) => s.stage_id)).toEqual(['b']);
  });
  it('an absent stage shares nothing', () => {
    const a = stage('a', []);
    expect(stagesSharingRange(a, [a, stage('b', [])])).toEqual([]);
  });
});

describe('confidence', () => {
  it('min–max ignores absent (0) stages', () => {
    expect(confidenceSpan([stage('a', [1], 0.8), stage('b', [2], 1), stage('c', [], 0)])).toEqual({
      min: 0.8,
      max: 1,
    });
    expect(confidenceSpan([stage('c', [], 0)])).toBeNull();
  });
  it('counts only the scored stages under the threshold', () => {
    expect(lowConfidenceCount([stage('a', [1], 0.52), stage('b', [2], 0.6), stage('c', [], 0)])).toBe(1);
  });
});

describe('resolveRepEvents', () => {
  it('keeps each id with its own event after a miss', () => {
    const events = { a: { t: 'A' }, c: { t: 'C' } };
    expect(resolveRepEvents(['a', 'b', 'c'], events)).toEqual([
      { id: 'a', ev: { t: 'A' } },
      { id: 'c', ev: { t: 'C' } },
    ]);
  });
  it('tolerates missing ids', () => {
    expect(resolveRepEvents(undefined, {})).toEqual([]);
  });
});

describe('repEmptyReason', () => {
  const base = { absent: false, range: [10], kernelChapters: [1, 2, 8], sharingCount: 0 };
  it('absent stage → no evidence', () => {
    expect(repEmptyReason({ ...base, absent: true, range: [] })).toBe('noEvidence');
  });
  it('range starts past the last kernel chapter → beyondKernel', () => {
    expect(repEmptyReason(base)).toBe('beyondKernel');
  });
  it('range inside kernel extent but empty must not say "stops at chapter N"', () => {
    expect(repEmptyReason({ ...base, range: [4], sharingCount: 0 })).toBe('gap');
  });
  it('shared range inside kernel extent → shared', () => {
    expect(repEmptyReason({ ...base, range: [4], sharingCount: 1 })).toBe('shared');
  });
  it('a discontinuous range is judged by its first real chapter', () => {
    expect(repEmptyReason({ ...base, range: [12, 9] })).toBe('beyondKernel');
    expect(repEmptyReason({ ...base, range: [12, 3] })).toBe('gap');
  });
  it('no kernel events at all → never claims they stop somewhere', () => {
    expect(repEmptyReason({ ...base, kernelChapters: [] })).toBe('gap');
  });
});

describe('nextReviewStatus', () => {
  it('pressing the lit button returns to pending', () => {
    expect(nextReviewStatus('approved', 'approved')).toBe('pending');
    expect(nextReviewStatus('rejected', 'rejected')).toBe('pending');
  });
  it('pressing the other or from pending sets it', () => {
    expect(nextReviewStatus('pending', 'approved')).toBe('approved');
    expect(nextReviewStatus('approved', 'rejected')).toBe('rejected');
  });
});

describe('displacementCounts', () => {
  it('counts verdict types and ignores null / other', () => {
    expect(
      displacementCounts([
        { temporalDisplacement: { type: 'analepsis' } },
        { temporalDisplacement: { type: 'analepsis' } },
        { temporalDisplacement: { type: 'prolepsis' } },
        { temporalDisplacement: { type: 'none' } },
        { temporalDisplacement: null },
        {},
      ]),
    ).toEqual({ analepsis: 2, prolepsis: 1 });
  });
});

describe('summaryGate', () => {
  it('unknown until the chapter list loads, and not blocked while unknown', () => {
    const g = summaryGate(undefined, 10);
    expect(g).toMatchObject({ known: false, total: 10, done: 0, blocked: false });
  });
  it('blocks when any summary is blank', () => {
    const g = summaryGate([{ summary: 'x' }, { summary: '  ' }, {}], 3);
    expect(g).toMatchObject({ known: true, total: 3, done: 1, missing: 2, ready: false, blocked: true });
  });
  it('ready when every chapter has one', () => {
    expect(summaryGate([{ summary: 'a' }], 1)).toMatchObject({ ready: true, blocked: false });
  });
});
