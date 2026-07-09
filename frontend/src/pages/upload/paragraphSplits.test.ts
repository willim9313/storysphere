import { describe, expect, it } from 'vitest';
import type { ReviewChapter, ReviewParagraph } from '@/api/types';
import { buildSubmitPayload, normalizeSplitOffsets, pieceKey, splitPiece } from './paragraphSplits';

// ── fixtures ──────────────────────────────────────────────────────────────────

function para(paragraphIndex: number, text: string, extra: Partial<ReviewParagraph> = {}): ReviewParagraph {
  return { paragraphIndex, text, role: 'body', titleSpan: null, sentences: [], ...extra };
}

function chapter(idx: number, paragraphs: ReviewParagraph[], role = 'body'): ReviewChapter {
  return { chapterIdx: idx, title: null, role, paragraphs };
}

// ── normalizeSplitOffsets ─────────────────────────────────────────────────────

describe('normalizeSplitOffsets', () => {
  it('keeps both boundaries of a mid-paragraph selection', () => {
    expect(normalizeSplitOffsets(para(0, 'AAABBBCCC'), 3, 6)).toEqual([3, 6]);
  });

  it('drops the start boundary when selection starts at 0', () => {
    expect(normalizeSplitOffsets(para(0, 'AAABBB'), 0, 3)).toEqual([3]);
  });

  it('drops the end boundary when selection reaches the end', () => {
    expect(normalizeSplitOffsets(para(0, 'AAABBB'), 3, 6)).toEqual([3]);
  });

  it('rejects a whole-paragraph selection', () => {
    expect(normalizeSplitOffsets(para(0, 'AAABBB'), 0, 6)).toBeNull();
  });

  it('rejects a boundary inside the titleSpan', () => {
    const p = para(0, '第一章 潮水AAA', { titleSpan: [0, 6] });
    expect(normalizeSplitOffsets(p, 3, 9)).toBeNull();
  });

  it('allows a boundary exactly at the titleSpan end', () => {
    const p = para(0, '第一章潮水AAA', { titleSpan: [0, 3] });
    expect(normalizeSplitOffsets(p, 3, 5)).toEqual([3, 5]);
  });

  it('drops a boundary that would leave a whitespace-only head', () => {
    expect(normalizeSplitOffsets(para(0, '  ABBB'), 2, 4)).toEqual([4]);
  });

  it('rejects a whitespace-only selection', () => {
    expect(normalizeSplitOffsets(para(0, 'AAA   BBB'), 3, 6)).toBeNull();
  });
});

// ── splitPiece ────────────────────────────────────────────────────────────────

describe('splitPiece', () => {
  it('splits a paragraph into three pieces around the selection', () => {
    const chs = [chapter(0, [para(0, 'AAABBBCCC')])];
    const out = splitPiece(chs, 0, 0, 3, 6)!;
    expect(out[0].paragraphs.map((p) => p.text)).toEqual(['AAA', 'BBB', 'CCC']);
    expect(out[0].paragraphs.map((p) => p.paragraphIndex)).toEqual([0, 0, 0]);
  });

  it('records origStart relative to the original paragraph on re-split', () => {
    const chs = [chapter(0, [para(0, 'AAABBBCCC')])];
    const once = splitPiece(chs, 0, 0, 3, 9)!; // AAA | BBBCCC
    const twice = splitPiece(once, 0, 1, 3, 6)!; // AAA | BBB | CCC
    expect(twice[0].paragraphs.map((p) => pieceKey(p))).toEqual(['0:0', '0:3', '0:6']);
  });

  it('pieces inherit role and keep other paragraphs untouched', () => {
    const chs = [chapter(0, [para(0, 'AAABBB', { role: 'preamble' }), para(1, 'CCC')])];
    const out = splitPiece(chs, 0, 0, 3, 6)!;
    expect(out[0].paragraphs.map((p) => p.role)).toEqual(['preamble', 'preamble', 'body']);
    expect(out[0].paragraphs).toHaveLength(3);
  });

  it('adjusts titleSpan onto the piece that fully contains it', () => {
    const chs = [chapter(0, [para(0, 'AAA第一章BBB', { titleSpan: [3, 6] })])];
    const out = splitPiece(chs, 0, 0, 3, 9)!;
    expect(out[0].paragraphs[0].titleSpan).toBeNull();
    expect(out[0].paragraphs[1].titleSpan).toEqual([0, 3]);
  });

  it('returns null for an unsplittable selection', () => {
    const chs = [chapter(0, [para(0, 'AAABBB')])];
    expect(splitPiece(chs, 0, 0, 0, 6)).toBeNull();
    expect(splitPiece(chs, 0, 5, 0, 3)).toBeNull(); // no such paragraph
  });
});

// ── buildSubmitPayload ────────────────────────────────────────────────────────

describe('buildSubmitPayload', () => {
  it('matches the legacy payload when nothing was split', () => {
    const chs = [
      chapter(0, [para(0, 'A'), para(1, 'B')]),
      chapter(1, [para(2, 'C')], 'afterword'),
    ];
    const out = buildSubmitPayload(chs, { 0: 'body', 1: 'body', 2: 'body' });
    expect(out.chapters).toEqual([
      { title: '', role: 'body', startParagraphIndex: 0 },
      { title: '', role: 'afterword', startParagraphIndex: 2 },
    ]);
    expect(out.roleOverrides).toEqual({});
    expect(out.paragraphSplits).toEqual({});
  });

  it('uses post-split indices for chapter starts and role overrides', () => {
    const chs = [chapter(0, [para(0, 'AAABBB'), para(1, 'CCC')])];
    const split = splitPiece(chs, 0, 0, 3, 6)!; // pieces AAA|BBB then CCC
    // move a chapter boundary between the two pieces (what the user does next)
    const reviewed: ReviewChapter[] = [
      chapter(0, [split[0].paragraphs[0]]),
      chapter(1, split[0].paragraphs.slice(1)),
    ];
    reviewed[1].paragraphs[1] = { ...reviewed[1].paragraphs[1], role: 'separator' };
    const out = buildSubmitPayload(reviewed, { 0: 'body', 1: 'body' });
    expect(out.chapters.map((c) => c.startParagraphIndex)).toEqual([0, 1]);
    expect(out.paragraphSplits).toEqual({ '0': [3] });
    // CCC is original index 1 but post-split global index 2
    expect(out.roleOverrides).toEqual({ '2': 'separator' });
  });

  it('collects multiple offsets of one paragraph sorted ascending', () => {
    const chs = [chapter(0, [para(0, 'AAABBBCCC')])];
    const once = splitPiece(chs, 0, 0, 6, 9)!;
    const twice = splitPiece(once, 0, 0, 3, 6)!;
    const out = buildSubmitPayload(twice, { 0: 'body' });
    expect(out.paragraphSplits).toEqual({ '0': [3, 6] });
  });
});
