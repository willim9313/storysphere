import type { SuggestRolesResponse } from '@/api/ingest';
import type { ReviewChapter } from '@/api/types';

/**
 * Split body chapters at the front/back matter boundaries returned by
 * 邊界輔助辨識, peeling the matter off as its own non-body chapter(s) so the
 * chapter list updates. Non-body chapters are left untouched (already matter).
 *
 * Boundaries are book-global paragraph indices: paragraphs with index <
 * frontMatterEnd are front matter; paragraphs with index >= backMatterStart are
 * back matter. Both may be null (nothing found on that side).
 */
export function applyBoundaries(
  chapters: ReviewChapter[],
  b: SuggestRolesResponse,
): ReviewChapter[] {
  const { frontMatterEnd, backMatterStart, frontRole, backRole } = b;

  // Defensive: the backend never returns crossing boundaries, but if it ever
  // did, a paragraph could land in both front and back partitions and get
  // duplicated. Treat crossing (or touching) boundaries as a no-op.
  if (
    frontMatterEnd != null &&
    backMatterStart != null &&
    backMatterStart <= frontMatterEnd
  ) {
    return chapters;
  }

  const out: ReviewChapter[] = [];
  for (const ch of chapters) {
    if ((ch.role ?? 'body') !== 'body') {
      out.push(ch);
      continue;
    }
    const paras = ch.paragraphs;
    const first = paras[0]?.paragraphIndex ?? 0;
    const last = paras.at(-1)?.paragraphIndex ?? 0;
    const touchesFront = frontMatterEnd != null && first < frontMatterEnd;
    const touchesBack = backMatterStart != null && last >= backMatterStart;
    if (!touchesFront && !touchesBack) {
      out.push(ch);
      continue;
    }
    const frontParas = frontMatterEnd != null
      ? paras.filter((p) => p.paragraphIndex < frontMatterEnd) : [];
    const backParas = backMatterStart != null
      ? paras.filter((p) => p.paragraphIndex >= backMatterStart) : [];
    const bodyParas = paras.filter((p) =>
      (frontMatterEnd == null || p.paragraphIndex >= frontMatterEnd) &&
      (backMatterStart == null || p.paragraphIndex < backMatterStart));
    const hasBody = bodyParas.length > 0;
    if (frontParas.length) {
      out.push({ ...ch, title: hasBody ? null : ch.title, role: frontRole ?? 'other', paragraphs: frontParas });
    }
    if (hasBody) {
      out.push({ ...ch, role: 'body', paragraphs: bodyParas });
    }
    if (backParas.length) {
      out.push({ ...ch, title: hasBody ? null : ch.title, role: backRole ?? 'other', paragraphs: backParas });
    }
  }
  return out.map((c, i) => ({ ...c, chapterIdx: i }));
}
