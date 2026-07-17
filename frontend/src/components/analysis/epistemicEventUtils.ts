// Shared parsing helpers for epistemic-state event objects (EpistemicStateResponse
// .knownEvents/.unknownEvents). Backend event shape isn't a fixed named schema
// (see #12e), so both the single-character EpistemicStateSection and the
// two-character EpistemicCompareDrawer (#10) need the exact same tolerant
// field lookups to stay consistent — in particular #10's set operations rely
// on getId() matching what EpistemicStateSection already uses for markers.

export function getChapter(ev: Record<string, unknown>): number | null {
  const v = ev.chapter ?? ev.chapterNumber ?? ev.chapter_number;
  if (typeof v === 'number' && Number.isFinite(v)) return v;
  if (typeof v === 'string') {
    const parsed = Number(v);
    return Number.isFinite(parsed) ? parsed : null;
  }
  return null;
}

export function getTitle(ev: Record<string, unknown>): string {
  return String(ev.title ?? ev.name ?? ev.event ?? '');
}

export function getId(ev: Record<string, unknown>, fallback: number): string {
  return String(ev.id ?? ev.eventId ?? fallback);
}
