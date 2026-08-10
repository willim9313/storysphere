import { describe, expect, it } from 'vitest';

import type { SymbolOverview, SymbolOverviewItem } from '@/api/symbols';

import { findClusters } from './symbolClusters';
import { analyseSymbols } from './symbolSignals';

const TIDE_ROLES: Record<string, string> = {
  '-1': 'preface',
  '0': 'toc',
  '1': 'body', '2': 'body', '3': 'body', '4': 'body', '5': 'body',
  '6': 'body', '7': 'body', '8': 'body', '9': 'body', '10': 'body',
  '11': 'afterword',
};

/** 名字的潮汐 的正文出現分布，取自 `sample-payloads/15a-symbols-list.json`。 */
const DISTRIBUTIONS: Record<string, Record<string, number>> = {
  海: { '-1': 3, '0': 2, '1': 1, '5': 1, '7': 2, '8': 1, '9': 1, '11': 2 },
  手: { '1': 1, '2': 1, '4': 1, '5': 1, '7': 1, '8': 1, '10': 1 },
  血: { '2': 1, '6': 1, '8': 1, '11': 1 },
  泥: { '6': 1, '7': 1, '9': 1, '10': 1 },
  沙: { '-1': 1, '5': 1, '6': 1, '11': 1 },
  鹽: { '0': 1, '1': 1, '2': 1 },
  水: { '4': 1, '10': 1 },
  光: { '8': 1, '9': 1 },
  懷錶: { '3': 1, '7': 1 },
};

/**
 * 實測的結盟關係（`#15i` 的 `co_occurring_imagery`）。
 * 值 1 的配對刻意保留，用來驗證它們不會進入叢集。
 */
const ALLIES: Record<string, Array<[string, number]>> = {
  海: [['手', 4], ['沙', 2], ['泥', 2], ['光', 2], ['腳印', 1]],
  手: [['海', 4], ['鹽', 2], ['水', 2], ['泥', 2], ['門檻', 1]],
  泥: [['海', 2], ['手', 2], ['沙', 1], ['血', 1]],
  沙: [['海', 2], ['腳印', 1], ['月亮', 1]],
  光: [['海', 2], ['手', 1], ['臉', 1]],
  鹽: [['手', 2], ['海', 1], ['門檻', 1]],
  水: [['手', 2], ['船', 1], ['霧', 1]],
  血: [['手', 1], ['傷口', 1], ['鹽', 1]],
  懷錶: [['馬車', 1], ['皮箱', 1], ['掌心', 1]],
};

function makeItem(term: string): SymbolOverviewItem {
  const distribution = DISTRIBUTIONS[term] ?? { '1': 1 };
  const frequency = Object.values(distribution).reduce((a, b) => a + b, 0);
  return {
    id: `img-${term}`,
    book_id: 'book-1',
    term,
    imagery_type: 'other',
    aliases: [],
    frequency,
    chapter_distribution: distribution,
    first_chapter: null,
    co_occurring_entities: [],
    self_match_count: null,
    co_occurring_event_count: 0,
    co_occurring_imagery: (ALLIES[term] ?? []).map(([t, n]) => ({
      term: t,
      imagery_id: `img-${t}`,
      co_occurrence_count: n,
      imagery_type: 'other',
    })),
    interpretation: null,
  };
}

function overview(terms: string[]): SymbolOverview {
  return {
    book_id: 'book-1',
    body_chapter_count: 10,
    body_paragraph_count: 40,
    chapter_roles: TIDE_ROLES,
    global_chapter_max: 2,
    items: terms.map(makeItem),
    assembled_by: 'symbol_service_v1',
  };
}

/** An overview built from explicit chapters and allies, for cases the book lacks. */
function synthetic(
  spec: Record<string, { chapters: Record<string, number>; allies: Array<[string, number]> }>,
): SymbolOverview {
  const items = Object.entries(spec).map(([term, { chapters, allies }]) => ({
    ...makeItem(term),
    chapter_distribution: chapters,
    frequency: Object.values(chapters).reduce((a, b) => a + b, 0),
    co_occurring_imagery: allies.map(([t, n]) => ({
      term: t,
      imagery_id: `img-${t}`,
      co_occurrence_count: n,
      imagery_type: 'other',
    })),
  }));
  return { ...overview([]), items };
}

const TIDE = ['海', '手', '血', '泥', '沙', '鹽', '水', '光', '懷錶'];

const clustersOf = (terms: string[] = TIDE) => findClusters(analyseSymbols(overview(terms)));
const termsIn = (c: { members: Array<{ signals: { term: string } }> }) =>
  c.members.map((m) => m.signals.term);

describe('findClusters', () => {
  it('keeps 海叢 and 手叢, which centre on different allies', () => {
    const clusters = clustersOf();
    const seeds = clusters.map((c) => c.seed.term);
    expect(seeds).toContain('海');
    expect(seeds).toContain('手');
    // Three members in common, but 海 pulls in 沙／光 and 手 pulls in 鹽／水, so
    // neither is redundant.
    expect(termsIn(clusters.find((c) => c.seed.term === '海')!)).toEqual(
      expect.arrayContaining(['海', '手', '沙', '泥', '光']),
    );
    expect(termsIn(clusters.find((c) => c.seed.term === '手')!)).toEqual(
      expect.arrayContaining(['手', '海', '鹽', '水', '泥']),
    );
  });

  it('drops a cluster whose members all sit inside one already kept', () => {
    // 泥 allies only with 海 and 手 at strength ≥ 2, and all three are in 海叢.
    expect(clustersOf().map((c) => c.seed.term)).not.toContain('泥');
  });

  it('ignores allies sharing only one paragraph', () => {
    // 懷錶's three allies are all count 1, so it heads no cluster and appears in
    // none — despite having more allies listed than 光 does.
    const clusters = clustersOf();
    expect(clusters.map((c) => c.seed.term)).not.toContain('懷錶');
    expect(clusters.flatMap(termsIn)).not.toContain('懷錶');
  });

  it('needs more than one qualifying ally, since a pair is just an edge', () => {
    // 沙 and 光 each ally with 海 alone at strength 2.
    const clusters = clustersOf(['沙', '光', '懷錶']);
    expect(clusters).toEqual([]);
  });

  it('orders members with the seed first, then by descending strength', () => {
    const hai = clustersOf().find((c) => c.seed.term === '海')!;
    expect(hai.members[0].withSeed).toBeNull();
    expect(hai.members[0].signals.term).toBe('海');
    const strengths = hai.members.slice(1).map((m) => m.withSeed!);
    expect(strengths).toEqual([...strengths].sort((a, b) => b - a));
    expect(strengths[0]).toBe(4);
  });

  it('reports the body chapters where the most members converge', () => {
    const hai = clustersOf().find((c) => c.seed.term === '海')!;
    // 海 5,7,8,9 · 手 1,2,4,5,7,8,10 · 沙 5,6 · 泥 6,7,9,10 · 光 8,9
    // → ch5: 海手沙 = 3, ch7: 海手泥 = 3, ch8: 海手光 = 3, ch9: 海泥光 = 3
    expect(hai.hotCount).toBe(3);
    expect(hai.hotChapters).toEqual([5, 7, 8, 9]);
  });

  it('reports no hot chapter when members never share one', () => {
    // Synthetic, because 名字的潮汐 has no cluster with disjoint members: every
    // ally strong enough to join also overlaps the seed somewhere.
    const clusters = findClusters(
      analyseSymbols(
        synthetic({
          // Two occurrences each, or they fall into the unranked tail and are not
          // eligible to be cluster members at all.
          A: { chapters: { '1': 1, '2': 1 }, allies: [['B', 2], ['C', 2]] },
          B: { chapters: { '4': 1, '5': 1 }, allies: [['A', 2]] },
          C: { chapters: { '7': 1, '8': 1 }, allies: [['A', 2]] },
        }),
      ),
    );
    expect(clusters).toHaveLength(1);
    expect(clusters[0].hotChapters).toEqual([]);
    // Zero, not one: every member having a chapter to itself is the absence of a
    // shared landing point, not one shared by a single member.
    expect(clusters[0].hotCount).toBe(0);
  });

  it('returns nothing for a book whose symbols never co-occur twice', () => {
    expect(clustersOf(['血', '懷錶'])).toEqual([]);
  });
});
