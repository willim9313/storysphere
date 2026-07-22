/**
 * Pure helpers backing LensCard's timeline / epistemic-perspective logic
 * (knowledge-graph redesign Phase 3). Kept outside the component so they're
 * testable without React or DOM.
 */

/**
 * Epistemic `up_to_chapter` fallback (brief §9-5, overrides the old
 * "chapter 1" default). There's no definite chapter position to compute a
 * focal character's knowledge against when either:
 *  - the timeline is set to "all chapters" (position === 0), or
 *  - the timeline is in story (chronological) mode, whose position doesn't
 *    map onto a chapter number.
 * In both cases fall back to the book's final chapter, so the perspective
 * reflects the whole book by default instead of only chapter 1.
 */
export function resolveEpistemicChapter(
  timelineMode: 'chapter' | 'story',
  timelinePosition: number,
  totalChapters: number,
): number {
  if (timelineMode === 'chapter' && timelinePosition > 0) return timelinePosition;
  return totalChapters > 0 ? totalChapters : 1;
}

/**
 * One playback tick for F3 "逐章成長播放" (chapter-by-chapter growth
 * playback): advances the timeline position by one chapter, capped at
 * `max`. `done` is true once playback has reached the last chapter and
 * should stop (the caller clears its interval on `done`).
 */
export function stepTimelinePlayback(
  position: number,
  max: number,
): { next: number; done: boolean } {
  const next = Math.min(position + 1, max);
  return { next, done: next >= max };
}
