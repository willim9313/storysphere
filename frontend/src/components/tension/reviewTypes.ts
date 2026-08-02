import type { components } from '@/api/generated';

export type TensionLineDetail = components['schemas']['TensionLineDetail'];
export type TEUSummary = components['schemas']['TEUSummary'];

export type ReviewStatus = TensionLineDetail['review_status'];
export type ReviewFilter = 'all' | ReviewStatus;
export type ReviewSort = 'intensity' | 'chapter' | 'count';

/** Chapters that actually carry a TEU, not the `chapter_range` endpoints.
 *
 * `chapter_range` is `[min, max]`, so rendering it as a span claims coverage of
 * every chapter in between — a line built from ch1 and ch5 has nothing in 2–4.
 */
export function lineChapters(line: TensionLineDetail): number[] {
  const fromTeus = (line.teus ?? []).map((t) => t.chapter);
  const chapters = fromTeus.length > 0 ? fromTeus : (line.chapter_range ?? []);
  return [...new Set(chapters)].sort((a, b) => a - b);
}

/** `1·5·7` — interpunct, per the design's number formatting rules. */
export function formatChapters(line: TensionLineDetail): string {
  return lineChapters(line).join('·');
}

export function sortLines(lines: TensionLineDetail[], sort: ReviewSort): TensionLineDetail[] {
  const out = [...lines];
  if (sort === 'intensity') {
    out.sort((a, b) => b.intensity_summary - a.intensity_summary);
  } else if (sort === 'chapter') {
    out.sort((a, b) => (lineChapters(a)[0] ?? 0) - (lineChapters(b)[0] ?? 0));
  } else {
    out.sort((a, b) => (b.teus?.length ?? 0) - (a.teus?.length ?? 0));
  }
  return out;
}

export function countByFilter(lines: TensionLineDetail[]): Record<ReviewFilter, number> {
  const counts: Record<ReviewFilter, number> = {
    all: lines.length,
    pending: 0,
    approved: 0,
    modified: 0,
    rejected: 0,
  };
  for (const line of lines) counts[line.review_status] += 1;
  return counts;
}
