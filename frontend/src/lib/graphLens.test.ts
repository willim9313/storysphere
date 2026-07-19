import { describe, expect, it } from 'vitest';
import { resolveEpistemicChapter, stepTimelinePlayback } from './graphLens';

// ── resolveEpistemicChapter ─────────────────────────────────────────────────

describe('resolveEpistemicChapter', () => {
  it('uses the exact position when in chapter mode with a position set', () => {
    expect(resolveEpistemicChapter('chapter', 3, 7)).toBe(3);
  });

  it('falls back to the final chapter when timeline is "all chapters" (position 0)', () => {
    expect(resolveEpistemicChapter('chapter', 0, 7)).toBe(7);
  });

  it('falls back to the final chapter in story mode regardless of position', () => {
    expect(resolveEpistemicChapter('story', 5, 7)).toBe(7);
  });

  it('falls back to chapter 1 when totalChapters is unknown (0)', () => {
    expect(resolveEpistemicChapter('chapter', 0, 0)).toBe(1);
    expect(resolveEpistemicChapter('story', 2, 0)).toBe(1);
  });
});

// ── stepTimelinePlayback ─────────────────────────────────────────────────────

describe('stepTimelinePlayback', () => {
  it('advances by one chapter', () => {
    expect(stepTimelinePlayback(2, 7)).toEqual({ next: 3, done: false });
  });

  it('caps at max and reports done', () => {
    expect(stepTimelinePlayback(7, 7)).toEqual({ next: 7, done: true });
    expect(stepTimelinePlayback(6, 7)).toEqual({ next: 7, done: true });
  });

  it('starts from 0 and steps toward max', () => {
    expect(stepTimelinePlayback(0, 3)).toEqual({ next: 1, done: false });
  });

  it('is done immediately when max is 0', () => {
    expect(stepTimelinePlayback(0, 0)).toEqual({ next: 0, done: true });
  });
});
