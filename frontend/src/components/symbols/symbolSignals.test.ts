import { describe, expect, it } from 'vitest';

import type { CoOccurringEntityRef, SymbolOverview, SymbolOverviewItem } from '@/api/symbols';

import {
  LOAD_STRONG,
  analyseSymbols,
  classifyShape,
  interpretationAdvice,
  rankSymbols,
  strongestAttachment,
} from './symbolSignals';
import { segmentDistribution } from './chapterAxis';
import type { ChapterAxis } from './chapterAxis';
import { buildChapterAxis } from './chapterAxis';

/** 名字的潮汐的真實章節角色：前置頁 -1／目次 0／正文 1–10／後記 11。 */
const TIDE_ROLES: Record<string, string> = {
  '-1': 'preface',
  '0': 'toc',
  '1': 'body', '2': 'body', '3': 'body', '4': 'body', '5': 'body',
  '6': 'body', '7': 'body', '8': 'body', '9': 'body', '10': 'body',
  '11': 'afterword',
};

/**
 * 名字的潮汐 的 29 個意象，逐字取自 `sample-payloads/15a-symbols-list.json`。
 * 共現實體與事件數不在該回應裡，由各測試自行補上。
 */
const TIDE_ROWS: Array<[string, string, number, Record<string, number>]> = [
  ['海', 'nature', 13, { '-1': 3, '0': 2, '1': 1, '5': 1, '7': 2, '8': 1, '9': 1, '11': 2 }],
  ['手', 'body', 7, { '1': 1, '2': 1, '4': 1, '5': 1, '7': 1, '8': 1, '10': 1 }],
  ['血', 'body', 4, { '2': 1, '6': 1, '8': 1, '11': 1 }],
  ['泥', 'nature', 4, { '6': 1, '7': 1, '9': 1, '10': 1 }],
  ['沙', 'object', 4, { '-1': 1, '5': 1, '6': 1, '11': 1 }],
  ['鹽', 'other', 3, { '0': 1, '1': 1, '2': 1 }],
  ['懷錶', 'object', 2, { '3': 1, '7': 1 }],
  ['水', 'nature', 2, { '4': 1, '10': 1 }],
  ['油燈', 'object', 2, { '4': 1, '5': 1 }],
  ['光', 'nature', 2, { '8': 1, '9': 1 }],
  ['爐火', 'other', 2, { '2': 1, '6': 1 }],
  ['腳印', 'body', 1, { '-1': 1 }],
  ['門檻', 'spatial', 1, { '1': 1 }],
  ['門', 'object', 1, { '1': 1 }],
  ['傷口', 'other', 1, { '2': 1 }],
  ['馬車', 'object', 1, { '3': 1 }],
  ['皮箱', 'object', 1, { '3': 1 }],
  ['掌心', 'body', 1, { '3': 1 }],
  ['水窪', 'nature', 1, { '3': 1 }],
  ['船', 'object', 1, { '4': 1 }],
  ['霧', 'nature', 1, { '4': 1 }],
  ['月亮', 'nature', 1, { '5': 1 }],
  ['雪', 'nature', 1, { '6': 1 }],
  ['臉', 'body', 1, { '8': 1 }],
  ['礁石', 'nature', 1, { '9': 1 }],
  ['風', 'nature', 1, { '9': 1 }],
  ['外套', 'object', 1, { '10': 1 }],
  ['浪', 'nature', 1, { '10': 1 }],
  ['戒指', 'object', 1, { '11': 1 }],
];

function makeItem(
  term: string,
  overrides: Partial<SymbolOverviewItem> = {},
): SymbolOverviewItem {
  const row = TIDE_ROWS.find(([t]) => t === term);
  const [, type, frequency, distribution] = row ?? [term, 'other', 1, { '1': 1 }];
  return {
    id: `img-${term}`,
    book_id: 'book-1',
    term,
    imagery_type: type,
    aliases: [],
    frequency,
    chapter_distribution: distribution,
    first_chapter: null,
    co_occurring_entities: [],
    self_match_count: null,
    co_occurring_event_count: 0,
    co_occurring_imagery: [],
    interpretation: null,
    ...overrides,
  };
}

function character(
  name: string,
  bodyCount: number,
  paragraphCount: number,
): CoOccurringEntityRef {
  return {
    id: `ent-${name}`,
    name,
    entity_type: 'character',
    count: bodyCount,
    body_count: bodyCount,
    paragraph_count: paragraphCount,
  };
}

function makeOverview(
  items: SymbolOverviewItem[],
  bodyParagraphCount = 400,
): SymbolOverview {
  return {
    book_id: 'book-1',
    body_chapter_count: 10,
    body_paragraph_count: bodyParagraphCount,
    chapter_roles: TIDE_ROLES,
    global_chapter_max: 2,
    items,
    assembled_by: 'symbol_service_v1',
  };
}

const TIDE_AXIS: ChapterAxis = buildChapterAxis(
  TIDE_ROWS.map(([, , , d]) => d),
  { chapterRoles: TIDE_ROLES, bodyChapterCount: 10 },
);

const shapeOf = (term: string) => {
  const item = makeItem(term);
  const seg = segmentDistribution(item.chapter_distribution ?? {}, TIDE_AXIS);
  const first = seg.firstBodyChapter;
  const last = seg.lastBodyChapter;
  const span = first !== null && last !== null ? (last - first + 1) / 10 : 0;
  return classifyShape(seg, span, 10);
};

describe('classifyShape', () => {
  it('reads the real distributions as distinct behaviours', () => {
    expect(shapeOf('海')).toBe('through');
    expect(shapeOf('手')).toBe('through');
    expect(shapeOf('泥')).toBe('backHalf');
    expect(shapeOf('鹽')).toBe('earlyExit');
    expect(shapeOf('懷錶')).toBe('scatter');
    expect(shapeOf('門檻')).toBe('single');
  });

  it('gives a symbol living only outside the body no shape', () => {
    // 腳印 occurs once, in the colophon; 戒指 once, in the afterword. Neither
    // traces anything through the story, and reporting 「結尾才登場」 for 戒指 would
    // claim it enters a story it never appears in.
    expect(shapeOf('腳印')).toBe('none');
    expect(shapeOf('戒指')).toBe('none');
  });

  it('separates leaving early from merely sitting in the front half', () => {
    const early = segmentDistribution({ '1': 1, '2': 1 }, TIDE_AXIS);
    const front = segmentDistribution({ '1': 1, '5': 1 }, TIDE_AXIS);
    expect(classifyShape(early, 0.2, 10)).toBe('earlyExit');
    expect(classifyShape(front, 0.5, 10)).toBe('frontHalf');
  });

  it('separates arriving late from merely sitting in the back half', () => {
    const late = segmentDistribution({ '9': 1, '10': 1 }, TIDE_AXIS);
    const back = segmentDistribution({ '6': 1, '10': 1 }, TIDE_AXIS);
    expect(classifyShape(late, 0.2, 10)).toBe('lateEntry');
    expect(classifyShape(back, 0.5, 10)).toBe('backHalf');
  });

  it('scales its boundaries to the book, not to a ten-chapter one', () => {
    // Chapter 2 of 4 is mid-book; in a ten-chapter book it would be an early exit.
    const seg = segmentDistribution({ '1': 1, '2': 1 }, TIDE_AXIS);
    expect(classifyShape(seg, 0.5, 4)).toBe('frontHalf');
    expect(classifyShape(seg, 0.2, 10)).toBe('earlyExit');
  });
});

describe('strongestAttachment', () => {
  it('prefers the surprising pairing over the merely frequent one', () => {
    // The protagonist shares more occurrences, but she is in half the book. The
    // minor character is in 8 paragraphs and 3 of them hold this symbol.
    const item = makeItem('海', {
      co_occurring_entities: [character('伊內絲', 5, 200), character('泰奧多爾', 3, 8)],
    });
    const attachment = strongestAttachment(item, 6, 400);
    expect(attachment?.entity.name).toBe('泰奧多爾');
  });

  it('scores a pairing no better than chance at zero', () => {
    // Present in 6 of 6 occurrences, but also in every paragraph of the book.
    const item = makeItem('海', { co_occurring_entities: [character('伊內絲', 6, 400)] });
    const attachment = strongestAttachment(item, 6, 400);
    expect(attachment?.lift).toBeCloseTo(1);
    expect(attachment?.score).toBe(0);
  });

  it('does not let a lift built on one observation outrank a solid one', () => {
    // The thin pairing has the higher lift by far — a single occurrence makes the
    // share 1 by construction — but it rests on one paragraph.
    const thin = strongestAttachment(
      makeItem('懷錶', { co_occurring_entities: [character('泰奧多爾', 1, 10)] }),
      1,
      400,
    );
    const solid = strongestAttachment(
      makeItem('海', { co_occurring_entities: [character('泰奧多爾', 4, 40)] }),
      6,
      400,
    );
    expect(thin!.lift).toBeGreaterThan(solid!.lift);
    expect(solid!.score).toBeGreaterThan(thin!.score);
  });

  it('scores more observations of the same lift higher', () => {
    const once = strongestAttachment(
      makeItem('懷錶', { co_occurring_entities: [character('泰奧多爾', 1, 100)] }),
      2,
      400,
    );
    const twice = strongestAttachment(
      makeItem('海', { co_occurring_entities: [character('泰奧多爾', 2, 100)] }),
      4,
      400,
    );
    expect(twice!.lift).toBeCloseTo(once!.lift);
    expect(twice!.score).toBeCloseTo(once!.score * 2);
  });

  it('keeps the share for display even when it is not what ranking uses', () => {
    const item = makeItem('海', { co_occurring_entities: [character('伊內絲', 3, 100)] });
    const attachment = strongestAttachment(item, 6, 400);
    expect(attachment?.share).toBeCloseTo(0.5);
    expect(attachment?.expected).toBeCloseTo(0.25);
    expect(attachment?.lift).toBeCloseTo(2);
  });

  it('ignores entities that are not characters', () => {
    const item = makeItem('海', {
      co_occurring_entities: [
        { ...character('鹽田', 5, 10), entity_type: 'location' },
        { ...character('鹽', 4, 10), entity_type: 'concept' },
      ],
    });
    expect(strongestAttachment(item, 6, 400)).toBeNull();
  });

  it('is null when a base rate cannot be established', () => {
    const noBaseRate = makeItem('海', { co_occurring_entities: [character('幽靈', 2, 0)] });
    expect(strongestAttachment(noBaseRate, 6, 400)).toBeNull();
    expect(strongestAttachment(makeItem('海'), 6, 400)).toBeNull();
    // A symbol with no body occurrences has nothing to attach.
    expect(
      strongestAttachment(
        makeItem('腳印', { co_occurring_entities: [character('伊內絲', 1, 10)] }),
        0,
        400,
      ),
    ).toBeNull();
  });
});

describe('analyseSymbols', () => {
  it('separates single-occurrence words from the ranked list', () => {
    const analysis = analyseSymbols(makeOverview(TIDE_ROWS.map(([t]) => makeItem(t))));
    expect(analysis.all).toHaveLength(29);
    expect(analysis.main).toHaveLength(11);
    expect(analysis.tail).toHaveLength(18);
    expect(analysis.main.map((s) => s.term)).not.toContain('戒指');
  });

  it('splits occurrences three ways rather than trusting frequency', () => {
    const analysis = analyseSymbols(makeOverview([makeItem('海')]));
    const sea = analysis.all[0];
    expect(sea.frequency).toBe(13);
    expect(sea.distribution.body).toBe(6);
    expect(sea.distribution.front).toBe(5);
    expect(sea.distribution.back).toBe(2);
  });

  it('discounts a symbol whose evidence is largely front matter', () => {
    // 5 of 海's 13 occurrences are the colophon and title page; 8 are usable.
    const analysis = analyseSymbols(makeOverview([makeItem('海')]));
    expect(analysis.all[0].trust).toBeCloseTo(8 / 13);
  });

  it('counts the afterword as evidence even though it is outside the body', () => {
    // 手 is clean; 海 is not, despite the afterword lines being its best evidence.
    const analysis = analyseSymbols(makeOverview([makeItem('手'), makeItem('海')]));
    const hand = analysis.all.find((s) => s.term === '手')!;
    expect(hand.trust).toBe(1);
    expect(analysis.all.find((s) => s.term === '海')!.trust).toBeLessThan(1);
  });

  it('applies trust as a multiplier, so pollution cannot be compensated for', () => {
    const clean = makeItem('手', {
      co_occurring_event_count: 14,
      co_occurring_imagery: [],
    });
    // Same body shape and stronger signals, but 5 occurrences of noise.
    const polluted = makeItem('海', { co_occurring_event_count: 25 });
    const analysis = analyseSymbols(makeOverview([clean, polluted]));
    const load = (term: string) => analysis.all.find((s) => s.term === term)!.load;
    expect(load('手')).toBeGreaterThan(load('海'));
  });

  it('normalises events and allies against this book, not a fixed ceiling', () => {
    // The strongest symbol in the book earns the full term whatever the absolute
    // numbers are, so a book with fewer events is not scored as though it were weak.
    const small = analyseSymbols(
      makeOverview([
        makeItem('手', { co_occurring_event_count: 3 }),
        makeItem('泥', { co_occurring_event_count: 1 }),
      ]),
    );
    const large = analyseSymbols(
      makeOverview([
        makeItem('手', { co_occurring_event_count: 300 }),
        makeItem('泥', { co_occurring_event_count: 100 }),
      ]),
    );
    expect(small.all.find((s) => s.term === '手')!.load).toBeCloseTo(
      large.all.find((s) => s.term === '手')!.load,
    );
  });

  it('ranks by load rather than by frequency', () => {
    // 海 has nearly twice the occurrences, but 手 runs clean across ten chapters
    // while a third of 海's evidence is front matter.
    const analysis = analyseSymbols(
      makeOverview([
        makeItem('海', {
          co_occurring_entities: [character('伊內絲', 3, 200)],
          co_occurring_event_count: 25,
        }),
        makeItem('手', {
          co_occurring_entities: [character('伊內絲', 5, 200)],
          co_occurring_event_count: 14,
        }),
      ]),
    );
    expect(analysis.main[0].term).toBe('手');
  });

  it('gives every symbol a load without any interpretation existing', () => {
    // Zero interpretations is this page's normal state, so nothing may depend on one.
    const analysis = analyseSymbols(makeOverview(TIDE_ROWS.map(([t]) => makeItem(t))));
    expect(analysis.all.every((s) => !s.hasInterpretation)).toBe(true);
    expect(analysis.main.every((s) => Number.isFinite(s.load))).toBe(true);
    expect(analysis.main.some((s) => s.load > 0)).toBe(true);
  });

  it('surfaces review state when an interpretation exists', () => {
    const analysis = analyseSymbols(
      makeOverview([
        makeItem('海', {
          interpretation: { review_status: 'pending', polarity: 'mixed', confidence: 0.9 },
        }),
      ]),
    );
    expect(analysis.all[0]).toMatchObject({
      hasInterpretation: true,
      reviewStatus: 'pending',
      polarity: 'mixed',
    });
  });

  it('survives a book with no symbols at all', () => {
    const analysis = analyseSymbols(makeOverview([]));
    expect(analysis.all).toEqual([]);
    expect(analysis.axis.globalBodyMax).toBe(1);
  });

  it('tolerates the optional fields the API omits when empty', () => {
    const bare: SymbolOverviewItem = {
      id: 'img-x',
      book_id: 'book-1',
      term: 'x',
      imagery_type: 'other',
      frequency: 2,
      co_occurring_event_count: 0,
    };
    const analysis = analyseSymbols(makeOverview([bare]));
    expect(analysis.all[0].load).toBe(0);
    expect(analysis.all[0].shape).toBe('none');
  });
});

describe('rankSymbols', () => {
  const analysis = analyseSymbols(
    makeOverview([
      makeItem('海', {
        co_occurring_entities: [character('伊內絲', 3, 200)],
        co_occurring_event_count: 25,
        interpretation: { review_status: 'pending', polarity: 'mixed', confidence: 0.9 },
      }),
      makeItem('手', {
        co_occurring_entities: [character('瑪蒂爾德夫人', 4, 20)],
        co_occurring_event_count: 14,
      }),
      makeItem('鹽'),
    ]),
  );
  const order = (axis: Parameters<typeof rankSymbols>[1]) =>
    rankSymbols(analysis.main, axis).map((s) => s.term);

  it('orders by body occurrences, not by the inflated total', () => {
    // 海 has 13 occurrences to 手's 7, but only 6 of them are body text — fewer
    // than 手's 7. Ranking on frequency as recorded would invert this.
    expect(order('freq')).toEqual(['手', '海', '鹽']);
  });

  it('orders by attachment lift, not by co-occurrence count', () => {
    expect(order('attach')[0]).toBe('手');
  });

  it('puts the earliest first chapter first, ignoring front matter', () => {
    // 海 first appears in the colophon, but its first *body* chapter is 1, the
    // same as 手's; 懷錶 starts at 3 and 泥 at 6.
    const byFirst = analyseSymbols(
      makeOverview([makeItem('泥'), makeItem('懷錶'), makeItem('海')]),
    );
    expect(rankSymbols(byFirst.main, 'first').map((s) => s.term)).toEqual([
      '海', '懷錶', '泥',
    ]);
  });

  it('puts interpreted symbols first when asked for review state', () => {
    expect(order('review')[0]).toBe('海');
  });

  it('orders by span and by events', () => {
    expect(order('span')[0]).toBe('手');
    expect(order('events')[0]).toBe('海');
  });

  it('is a total order even when the axis ties', () => {
    const tied = rankSymbols(analysis.main, 'review');
    expect(tied).toHaveLength(3);
    expect(new Set(tied.map((s) => s.term)).size).toBe(3);
  });

  it('does not mutate its input', () => {
    const before = analysis.main.map((s) => s.term);
    rankSymbols(analysis.main, 'span');
    expect(analysis.main.map((s) => s.term)).toEqual(before);
  });
});

describe('interpretationAdvice', () => {
  const withLoad = (load: number) => ({ load }) as never;

  it('urges generation only once the signals justify the spend', () => {
    expect(interpretationAdvice(withLoad(LOAD_STRONG))).toBe('recommended');
    expect(interpretationAdvice(withLoad(0.3))).toBe('available');
    expect(interpretationAdvice(withLoad(0.05))).toBe('discouraged');
  });

  it('discourages the single-occurrence tail, which has no load to speak of', () => {
    const analysis = analyseSymbols(makeOverview(TIDE_ROWS.map(([t]) => makeItem(t))));
    expect(analysis.tail.every((s) => interpretationAdvice(s) === 'discouraged')).toBe(true);
  });
});
