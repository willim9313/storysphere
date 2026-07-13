import type { ReviewChapter, ReviewParagraph, ReviewSubmitChapter } from '@/api/types';

/**
 * In-paragraph split support for the chapter review page.
 *
 * Preprocessing sometimes fuses several logical paragraphs into one block, so
 * the true chapter boundary can sit *inside* a paragraph. The reviewer selects
 * the text to peel off; the paragraph is locally split into 2–3 pieces which
 * then behave like ordinary paragraphs (the existing chapter-split "＋" works
 * between them).
 *
 * Pieces keep the original `paragraphIndex` and record `origStart` — the
 * piece's char offset within the *original* (pre-split) paragraph text. On
 * submit, `buildSubmitPayload` walks pieces in flat order to derive the
 * post-split global indices the backend expects, plus the `paragraphSplits`
 * map ({ originalIndex: [charOffsets...] }) it applies before rebuilding.
 */
export type SplitPiece = ReviewParagraph & { origStart?: number };

function origStartOf(p: ReviewParagraph): number {
  return (p as SplitPiece).origStart ?? 0;
}

/** Stable React key for a paragraph piece (paragraphIndex alone collides after a split). */
export function pieceKey(p: ReviewParagraph): string {
  return `${p.paragraphIndex}:${origStartOf(p)}`;
}

/**
 * Normalize a text selection [selStart, selEnd) within piece *p* into split
 * offsets, or null if the selection cannot produce a valid split:
 * whole-piece selection, a boundary inside the chapter title (`titleSpan`),
 * or a split that would leave a whitespace-only middle piece. Edge pieces
 * that would be whitespace-only just drop that boundary instead.
 */
export function normalizeSplitOffsets(
  p: ReviewParagraph,
  selStart: number,
  selEnd: number,
): number[] | null {
  const len = p.text.length;
  let offsets = [...new Set([selStart, selEnd])]
    .filter((o) => o > 0 && o < len)
    .sort((a, b) => a - b);
  if (offsets.length === 0) return null;

  if (p.titleSpan) {
    const [ts, te] = p.titleSpan;
    if (offsets.some((o) => o > ts && o < te)) return null;
  }

  // Drop a boundary whose head/tail side is whitespace-only; a whitespace-only
  // middle piece means the selection itself was blank — reject.
  if (!p.text.slice(0, offsets[0]).trim()) offsets = offsets.slice(1);
  if (offsets.length && !p.text.slice(offsets[offsets.length - 1]).trim()) {
    offsets = offsets.slice(0, -1);
  }
  if (offsets.length === 0) return null;
  const bounds = [0, ...offsets, len];
  for (let i = 0; i + 1 < bounds.length; i++) {
    if (!p.text.slice(bounds[i], bounds[i + 1]).trim()) return null;
  }
  return offsets;
}

/**
 * Split paragraph *pi* of chapter *ci* at the given selection. Returns the new
 * chapters array, or null if the selection is not splittable. Pieces inherit
 * the paragraph's role; `titleSpan` stays (offset-adjusted) on the piece that
 * fully contains it. Chapter indices are NOT re-derived — callers reindex.
 */
export function splitPiece(
  chapters: ReviewChapter[],
  ci: number,
  pi: number,
  selStart: number,
  selEnd: number,
): ReviewChapter[] | null {
  const ch = chapters[ci];
  const p = ch?.paragraphs[pi];
  if (!p) return null;
  const offsets = normalizeSplitOffsets(p, selStart, selEnd);
  if (!offsets) return null;

  const base = origStartOf(p);
  const bounds = [0, ...offsets, p.text.length];
  const pieces: SplitPiece[] = [];
  for (let i = 0; i + 1 < bounds.length; i++) {
    const [a, b] = [bounds[i], bounds[i + 1]];
    let span: [number, number] | null = null;
    if (p.titleSpan && p.titleSpan[0] >= a && p.titleSpan[1] <= b) {
      span = [p.titleSpan[0] - a, p.titleSpan[1] - a];
    }
    pieces.push({
      ...p,
      text: p.text.slice(a, b),
      titleSpan: span,
      sentences: [],
      origStart: base + a,
    });
  }

  const paragraphs = [...ch.paragraphs.slice(0, pi), ...pieces, ...ch.paragraphs.slice(pi + 1)];
  return chapters.map((c, i) => (i === ci ? { ...c, paragraphs } : c));
}

export interface SubmitPayload {
  chapters: ReviewSubmitChapter[];
  roleOverrides: Record<string, string>;
  paragraphSplits: Record<string, number[]>;
}

/**
 * Derive the POST /review payload from the reviewed chapters. Global indices
 * (startParagraphIndex, roleOverrides keys) are in *post-split* flat order —
 * matching what the backend sees after applying `paragraphSplits`. *originalRoles*
 * maps the original paragraphIndex to its role at load time.
 */
export function buildSubmitPayload(
  chapters: ReviewChapter[],
  originalRoles: Record<number, string>,
): SubmitPayload {
  const out: SubmitPayload = { chapters: [], roleOverrides: {}, paragraphSplits: {} };
  let newIdx = 0;
  for (const ch of chapters) {
    out.chapters.push({
      title: ch.title ?? '',
      role: ch.role ?? 'body',
      startParagraphIndex: newIdx,
    });
    for (const p of ch.paragraphs) {
      const original = originalRoles[p.paragraphIndex] ?? 'body';
      if ((p.role ?? 'body') !== original) out.roleOverrides[String(newIdx)] = p.role ?? 'body';
      const start = origStartOf(p);
      if (start > 0) {
        (out.paragraphSplits[String(p.paragraphIndex)] ??= []).push(start);
      }
      newIdx += 1;
    }
  }
  for (const key of Object.keys(out.paragraphSplits)) {
    out.paragraphSplits[key] = [...new Set(out.paragraphSplits[key])].sort((a, b) => a - b);
  }
  return out;
}
