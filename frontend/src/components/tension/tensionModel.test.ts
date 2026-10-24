import { describe, expect, it } from 'vitest';

import { ApiError } from '@/api/client';
import {
  assignFailureKind,
  chapterStatus,
  densityBarHeight,
  isNoTheme,
  runSequentially,
} from './tensionModel';

describe('densityBarHeight', () => {
  it('scales to the busiest chapter', () => {
    expect(densityBarHeight(9, 9)).toBe(64);
    expect(densityBarHeight(2, 9)).toBe(14);
  });
  it('never collapses a non-empty chapter and returns 0 for empty', () => {
    expect(densityBarHeight(1, 1000)).toBe(1);
    expect(densityBarHeight(0, 9)).toBe(0);
    expect(densityBarHeight(3, 0)).toBe(0);
  });
});

describe('chapterStatus', () => {
  it('distinguishes none, some and all dropped', () => {
    expect(chapterStatus(5, 0)).toEqual({ kind: 'allCovered' });
    expect(chapterStatus(5, 1)).toEqual({ kind: 'some', orphans: 1 });
    expect(chapterStatus(5, 5)).toEqual({ kind: 'whole' });
  });
});

describe('isNoTheme', () => {
  it('only treats the app 404 as "no theme"', () => {
    expect(isNoTheme(new ApiError(404, 'x', true))).toBe(true);
    expect(isNoTheme(new ApiError(404, 'x', false))).toBe(false);
    expect(isNoTheme(new ApiError(500, 'x', true))).toBe(false);
    expect(isNoTheme(new Error('x'))).toBe(false);
  });
});

describe('assignFailureKind', () => {
  it('409 is a conflict, anything else is other', () => {
    expect(assignFailureKind(new ApiError(409, 'claimed'))).toBe('conflict');
    expect(assignFailureKind(new ApiError(500, 'boom'))).toBe('other');
    expect(assignFailureKind(new Error('net'))).toBe('other');
  });
});

describe('runSequentially', () => {
  it('keeps going past a failure and reports it', async () => {
    const seen: string[] = [];
    const { failed } = await runSequentially(['a', 'b', 'c'], (id) => {
      seen.push(id);
      return id === 'b' ? Promise.reject(new Error('no')) : Promise.resolve();
    });
    expect(seen).toEqual(['a', 'b', 'c']);
    expect(failed).toEqual(['b']);
  });
});
