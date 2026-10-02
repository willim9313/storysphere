import { describe, expect, it } from 'vitest';

import {
  getFrameworkCategories,
  getFrameworks,
  type Framework,
  type FrameworkItem,
} from '@/data/frameworksData';
import {
  buildRailGroups,
  firstOfCategory,
  groupItemsByBadge,
  matchFramework,
  normalizeQuery,
  scaleLabel,
} from './methodologyModel';

const item = (name: string, badge?: string): FrameworkItem => ({ id: name, name, badge, details: [] });

const fw = (o: Partial<Framework>): Framework =>
  ({
    key: 'k',
    name: '方法',
    category: '分類',
    categoryId: 'character',
    itemLabel: '類型',
    items: [],
    ...o,
  }) as Framework;

describe('matchFramework', () => {
  it('matches method name, item name and category name, case-insensitively', () => {
    const f = fw({ name: 'Jung', category: '角色分析', items: [item('Hero')] });
    expect(matchFramework(f, 'jung')).toBe(true);
    expect(matchFramework(f, '角色')).toBe(true);
    expect(matchFramework(f, 'hero')).toBe(true);
    expect(matchFramework(f, 'nope')).toBe(false);
  });

  it('treats an empty query as match-all', () => {
    expect(matchFramework(fw({}), '')).toBe(true);
  });
});

describe('normalizeQuery', () => {
  it('trims and lowercases', () => {
    expect(normalizeQuery('  AbC ')).toBe('abc');
  });
});

describe('buildRailGroups against real data', () => {
  const frameworks = getFrameworks('zh-TW');
  const categories = getFrameworkCategories('zh-TW');

  it('returns all four categories when there is no query', () => {
    const groups = buildRailGroups(frameworks, categories, '');
    expect(groups.map((g) => g.frameworks.length)).toEqual([2, 3, 2, 1]);
  });

  it('"英雄" leaves 角色分析 2 / 敘事弧分析 1 and drops the other groups entirely', () => {
    const groups = buildRailGroups(frameworks, categories, '英雄');
    expect(groups.map((g) => [g.category.name, g.frameworks.length])).toEqual([
      ['角色分析', 2],
      ['敘事弧分析', 1],
    ]);
  });

  it('returns no groups when nothing matches', () => {
    expect(buildRailGroups(frameworks, categories, 'zzzz-no-hit')).toEqual([]);
  });

  it('matches by category name alone', () => {
    const groups = buildRailGroups(frameworks, categories, '象徵分析');
    expect(groups.map((g) => g.category.id)).toEqual(['symbol']);
  });
});

describe('scaleLabel / firstOfCategory', () => {
  const frameworks = getFrameworks('zh-TW');

  it('formats the scale as "N label"', () => {
    const schmidt = frameworks.find((f) => f.key === 'schmidt')!;
    expect(scaleLabel(schmidt)).toBe('45 類型');
  });

  it('picks the first method of a category', () => {
    expect(firstOfCategory(frameworks, 'arc')?.key).toBe('hero_journey');
    expect(firstOfCategory([], 'arc')).toBeUndefined();
  });
});

describe('groupItemsByBadge', () => {
  it('groups by badge head word, keeping data order and original numbers', () => {
    const groups = groupItemsByBadge([
      item('a', '女性'),
      item('b', '男性 · 反派'),
      item('c', '女性 · 反派'),
      item('d', '中性'),
    ]);
    expect(groups.map((g) => [g.label, g.entries.map((e) => e.n)])).toEqual([
      ['女性', [1, 3]],
      ['男性', [2]],
      ['中性', [4]],
    ]);
  });

  it('skips items without a badge', () => {
    expect(groupItemsByBadge([item('a'), item('b', '')])).toEqual([]);
  });

  it.each([
    ['zh-TW', ['女性', '男性', '中性']],
    ['en', ['Female', 'Male', 'Neutral']],
  ])('splits the 45 Schmidt types 17 / 18 / 10 in %s', (lang, labels) => {
    const schmidt = getFrameworks(lang).find((f) => f.key === 'schmidt')!;
    const groups = groupItemsByBadge(schmidt.items);
    expect(groups.map((g) => g.label)).toEqual(labels);
    expect(groups.map((g) => g.entries.length)).toEqual([17, 18, 10]);
    expect(groups.reduce((n, g) => n + g.entries.length, 0)).toBe(45);
  });
});
