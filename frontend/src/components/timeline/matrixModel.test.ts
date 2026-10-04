import { describe, expect, it } from 'vitest';
import type { TimelineDatum } from '@/lib/timelineGeometry';
import { bucketRange, buildMatrix, cellKey, densityStep, isDiagonal, rankBucket } from './matrixModel';

const ev = (id: string, chapter: number, rank: number | null) =>
  ({ id, chapter, chronologicalRank: rank }) as unknown as TimelineDatum;

describe('rankBucket', () => {
  it('puts rank 1.0 in the top bucket (91–100%), not an eleventh', () => {
    expect(rankBucket(1)).toBe(9);
    expect(bucketRange(rankBucket(1))).toEqual({ from: 91, to: 100 });
  });
  it('puts rank 0 in the bottom bucket (1–10%)', () => {
    expect(rankBucket(0)).toBe(0);
    expect(bucketRange(0)).toEqual({ from: 1, to: 10 });
  });
  it('splits on the decile edge', () => {
    expect(rankBucket(0.099)).toBe(0);
    expect(rankBucket(0.1)).toBe(1);
    expect(rankBucket(0.95)).toBe(9);
  });
});

describe('densityStep', () => {
  it('leaves 0 unfilled and folds 4+ into the top step', () => {
    expect([0, 1, 2, 3, 4, 5, 40].map(densityStep)).toEqual([0, 1, 2, 3, 4, 4, 4]);
  });
  it('is absolute: a book of one event is still step 1', () => {
    expect(densityStep(1)).toBe(1);
  });
});

describe('buildMatrix', () => {
  it('is empty for an empty book', () => {
    const m = buildMatrix([]);
    expect(m.cells.size).toBe(0);
    expect(m.ranked).toBe(0);
    expect(m.unranked).toBe(0);
  });
  it('draws nothing when every event is unranked', () => {
    const m = buildMatrix([ev('a', 1, null), ev('b', 2, null)]);
    expect(m.cells.size).toBe(0);
    expect(m.unranked).toBe(2);
  });
  it('groups several events into one cell, in the order given', () => {
    const m = buildMatrix([ev('a', 3, 0.52), ev('b', 3, 0.55), ev('c', 3, 0.99), ev('d', 4, null)]);
    expect(m.cells.get(cellKey(3, 5))?.map((d) => d.id)).toEqual(['a', 'b']);
    expect(m.cells.get(cellKey(3, 9))?.map((d) => d.id)).toEqual(['c']);
    expect(m.ranked).toBe(3);
    expect(m.unranked).toBe(1);
  });
  it('lands rank 1.0 in the top row', () => {
    const m = buildMatrix([ev('a', 1, 1)]);
    expect(m.cells.has(cellKey(1, 9))).toBe(true);
  });
});

describe('isDiagonal', () => {
  it('meets column i with row i when there are ten chapters', () => {
    for (let i = 0; i < 10; i += 1) expect(isDiagonal(i, 10, i)).toBe(true);
    expect(isDiagonal(2, 10, 3)).toBe(false);
  });
  it('spreads over several columns when the book has more chapters than rows', () => {
    expect(isDiagonal(0, 62, 0)).toBe(true);
    expect(isDiagonal(61, 62, 9)).toBe(true);
    expect(isDiagonal(61, 62, 0)).toBe(false);
  });
  it('is never diagonal without chapters', () => {
    expect(isDiagonal(0, 0, 0)).toBe(false);
  });
});
