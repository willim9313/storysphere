import { describe, expect, it } from 'vitest';
import type { ReviewChapter, ReviewParagraph } from '@/api/types';
import type { SuggestRolesResponse } from '@/api/ingest';
import { applyBoundaries } from './applyBoundaries';

// ── fixtures ──────────────────────────────────────────────────────────────────

let nextGlobal = 0;

function para(text: string): ReviewParagraph {
  return { paragraphIndex: nextGlobal++, text, role: 'body', titleSpan: null, sentences: [text] };
}

/** Build a chapter whose paragraphs take the next N global indices in order. */
function chapter(idx: number, title: string | null, role: string, n: number): ReviewChapter {
  return { chapterIdx: idx, title, role, paragraphs: Array.from({ length: n }, () => para(`p${nextGlobal}`)) };
}

function boundaries(b: Partial<SuggestRolesResponse>): SuggestRolesResponse {
  return { frontMatterEnd: null, backMatterStart: null, frontRole: null, backRole: null, ...b };
}

/** Flatten all paragraph indices across the output, in order. */
function allIndices(chs: ReviewChapter[]): number[] {
  return chs.flatMap((c) => c.paragraphs.map((p) => p.paragraphIndex));
}

// ── tests ─────────────────────────────────────────────────────────────────────

describe('applyBoundaries', () => {
  it('splits front matter off the first body chapter', () => {
    nextGlobal = 0;
    const chs = [chapter(0, 'Ch1', 'body', 3)]; // p0,p1,p2
    const out = applyBoundaries(chs, boundaries({ frontMatterEnd: 1, frontRole: 'preface' }));
    expect(out).toHaveLength(2);
    expect(out[0].role).toBe('preface');
    expect(out[0].title).toBeNull(); // matter piece loses the title
    expect(out[0].paragraphs.map((p) => p.paragraphIndex)).toEqual([0]);
    expect(out[1].role).toBe('body');
    expect(out[1].title).toBe('Ch1'); // body piece keeps the title
    expect(out[1].paragraphs.map((p) => p.paragraphIndex)).toEqual([1, 2]);
  });

  it('splits back matter off the last body chapter', () => {
    nextGlobal = 0;
    const chs = [chapter(0, 'Ch1', 'body', 3)]; // p0,p1,p2
    const out = applyBoundaries(chs, boundaries({ backMatterStart: 2, backRole: 'afterword' }));
    expect(out).toHaveLength(2);
    expect(out[0].role).toBe('body');
    expect(out[0].paragraphs.map((p) => p.paragraphIndex)).toEqual([0, 1]);
    expect(out[1].role).toBe('afterword');
    expect(out[1].paragraphs.map((p) => p.paragraphIndex)).toEqual([2]);
  });

  it('splits a single chapter touched by BOTH edges into three', () => {
    nextGlobal = 0;
    const chs = [chapter(0, 'Ch1', 'body', 3)]; // p0 front, p1 body, p2 back
    const out = applyBoundaries(
      chs,
      boundaries({ frontMatterEnd: 1, frontRole: 'other', backMatterStart: 2, backRole: 'afterword' }),
    );
    expect(out.map((c) => c.role)).toEqual(['other', 'body', 'afterword']);
    expect(out.map((c) => c.paragraphs.map((p) => p.paragraphIndex))).toEqual([[0], [1], [2]]);
  });

  it('re-roles a whole chapter that is entirely front matter (keeps its title)', () => {
    nextGlobal = 0;
    const chs = [chapter(0, 'FrontCh', 'body', 2), chapter(1, 'Story', 'body', 2)]; // p0,p1 | p2,p3
    const out = applyBoundaries(chs, boundaries({ frontMatterEnd: 2, frontRole: 'toc' }));
    expect(out).toHaveLength(2);
    expect(out[0].role).toBe('toc');
    expect(out[0].title).toBe('FrontCh'); // no body remainder → keeps title
    expect(out[1].role).toBe('body');
  });

  it('leaves non-body chapters untouched', () => {
    nextGlobal = 0;
    const toc = chapter(0, '目錄', 'toc', 2);      // p0,p1
    const body = chapter(1, 'Ch1', 'body', 2);     // p2,p3
    const out = applyBoundaries([toc, body], boundaries({ backMatterStart: 3, backRole: 'other' }));
    // toc passes through; body splits at p3
    expect(out[0].role).toBe('toc');
    expect(out[0].paragraphs.map((p) => p.paragraphIndex)).toEqual([0, 1]);
    expect(out.map((c) => c.role)).toEqual(['toc', 'body', 'other']);
  });

  it('renumbers chapterIdx sequentially and preserves every paragraph exactly once', () => {
    nextGlobal = 0;
    const chs = [chapter(0, 'Ch1', 'body', 4)];
    const out = applyBoundaries(
      chs,
      boundaries({ frontMatterEnd: 1, frontRole: 'other', backMatterStart: 3, backRole: 'afterword' }),
    );
    expect(out.map((c) => c.chapterIdx)).toEqual([0, 1, 2]);
    // no paragraph lost or duplicated
    expect(allIndices(out).sort((a, b) => a - b)).toEqual([0, 1, 2, 3]);
  });

  it('is a no-op when there are no boundaries', () => {
    nextGlobal = 0;
    const chs = [chapter(0, 'Ch1', 'body', 2)];
    const out = applyBoundaries(chs, boundaries({}));
    expect(out).toHaveLength(1);
    expect(out[0].paragraphs.map((p) => p.paragraphIndex)).toEqual([0, 1]);
  });

  it('ignores crossing boundaries (defensive) without duplicating paragraphs', () => {
    nextGlobal = 0;
    const chs = [chapter(0, 'Ch1', 'body', 6)];
    const out = applyBoundaries(chs, boundaries({ frontMatterEnd: 5, backMatterStart: 3 }));
    expect(out).toBe(chs); // returned unchanged
    expect(allIndices(out)).toEqual([0, 1, 2, 3, 4, 5]);
  });
});
