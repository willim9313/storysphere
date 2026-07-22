import { describe, it, expect } from 'vitest';
import { deriveFactionLabel, factionChapterParam } from './kgClustering';

describe('deriveFactionLabel', () => {
  it('anchors to the first top member name when present', () => {
    expect(deriveFactionLabel(['寇仲', '徐子陵'], 'Faction 1')).toBe('寇仲陣營');
  });

  it('falls back when topMemberNames is empty', () => {
    expect(deriveFactionLabel([], 'Faction 1')).toBe('Faction 1');
  });

  it('falls back when topMemberNames is undefined', () => {
    expect(deriveFactionLabel(undefined, 'Faction 1')).toBe('Faction 1');
  });

  it('skips leading empty/whitespace names and uses the first non-empty one', () => {
    expect(deriveFactionLabel(['', '   ', '寇仲'], 'Faction 1')).toBe('寇仲陣營');
  });
});

describe('factionChapterParam', () => {
  it('returns the position in chapter mode with a positive position', () => {
    expect(factionChapterParam({ mode: 'chapter', position: 3 })).toBe(3);
  });

  it('returns undefined in chapter mode with position 0', () => {
    expect(factionChapterParam({ mode: 'chapter', position: 0 })).toBeUndefined();
  });

  it('returns undefined in story mode', () => {
    expect(factionChapterParam({ mode: 'story', position: 5 })).toBeUndefined();
  });

  it('returns undefined for null/undefined timeline', () => {
    expect(factionChapterParam(null)).toBeUndefined();
    expect(factionChapterParam(undefined)).toBeUndefined();
  });
});
