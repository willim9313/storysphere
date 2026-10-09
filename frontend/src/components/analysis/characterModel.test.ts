import { describe, expect, it } from 'vitest';
import {
  archetypeDisplayName,
  archetypeIdOf,
  archetypeKey,
  DIMMED_OPACITY,
  archetypeState,
  assignArcRows,
  buildFactionLegend,
  confidenceBand,
  factionToken,
  isDimmed,
  mentionBarWidth,
  orderTones,
  parseChapterRange,
  quadrantStatus,
  rankFactions,
  showToneLabel,
  toggleFactionSelection,
  toneFamilyOf,
} from './characterModel';

const fac = (id: string, n: number) => ({
  id,
  label: id,
  memberIds: Array.from({ length: n }, (_, i) => `${id}-${i}`),
});

describe('mentionBarWidth', () => {
  it('is 6 + 94·√(m/max)', () => {
    expect(mentionBarWidth(214, 214)).toBeCloseTo(100);
    expect(mentionBarWidth(0, 214)).toBe(6);
    expect(mentionBarWidth(54, 216)).toBeCloseTo(6 + 94 * 0.5);
  });
  it('falls back to the floor when max is 0', () => {
    expect(mentionBarWidth(5, 0)).toBe(6);
  });
});

describe('rankFactions', () => {
  it('ranks by member count, biggest first', () => {
    const ranked = rankFactions([fac('a', 4), fac('b', 6), fac('c', 5)]);
    expect(ranked.map((f) => f.id)).toEqual(['b', 'c', 'a']);
    expect(ranked.map((f) => f.slot)).toEqual([0, 1, 2]);
  });

  it('breaks ties by backend order (no first-chapter data in #6d)', () => {
    const ranked = rankFactions([fac('x', 3), fac('y', 3), fac('z', 3)]);
    expect(ranked.map((f) => f.id)).toEqual(['x', 'y', 'z']);
  });

  it('keeps the original index so characters can be matched back', () => {
    const ranked = rankFactions([fac('small', 1), fac('big', 9)]);
    expect(ranked.find((f) => f.id === 'big')?.index).toBe(1);
  });

  it('gives at most 5 slots and merges the 6th onward into other', () => {
    const ranked = rankFactions(Array.from({ length: 9 }, (_, i) => fac(`f${i}`, 20 - i)));
    expect(ranked.filter((f) => f.slot !== null)).toHaveLength(5);
    expect(ranked.slice(5).every((f) => f.slot === null)).toBe(true);
  });

  it('handles zero factions', () => {
    expect(rankFactions([])).toEqual([]);
    expect(buildFactionLegend([])).toEqual({ slotted: [], merged: [], mergedMemberCount: 0 });
  });

  it('tolerates a missing memberIds', () => {
    expect(rankFactions([{ id: 'a', label: 'a' }])[0].memberCount).toBe(0);
  });
});

describe('buildFactionLegend', () => {
  it('splits slotted from merged and totals the merged members', () => {
    const ranked = rankFactions(Array.from({ length: 7 }, (_, i) => fac(`f${i}`, 10 - i)));
    const legend = buildFactionLegend(ranked);
    expect(legend.slotted).toHaveLength(5);
    expect(legend.merged.map((f) => f.id)).toEqual(['f5', 'f6']);
    expect(legend.mergedMemberCount).toBe(5 + 4);
  });

  it('has no merged group when nothing overflows', () => {
    const legend = buildFactionLegend(rankFactions([fac('a', 2), fac('b', 1)]));
    expect(legend.merged).toEqual([]);
    expect(legend.mergedMemberCount).toBe(0);
  });
});

describe('factionToken', () => {
  const ranked = rankFactions(Array.from({ length: 6 }, (_, i) => fac(`f${i}`, 10 - i)));
  it('maps rank to cat-1…5 in order', () => {
    expect(factionToken(0, ranked)).toBe('cat-1');
    expect(factionToken(4, ranked)).toBe('cat-5');
  });
  it('maps the 6th faction to the other colour', () => {
    expect(factionToken(5, ranked)).toBe('cat-other');
  });
  it('follows rank, not the backend position', () => {
    const r = rankFactions([fac('small', 1), fac('big', 9)]);
    expect(factionToken(1, r)).toBe('cat-1');
    expect(factionToken(0, r)).toBe('cat-2');
  });
  it('returns null for unaffiliated or unknown', () => {
    expect(factionToken(null, ranked)).toBeNull();
    expect(factionToken(99, ranked)).toBeNull();
  });
});

describe('faction legend isolation', () => {
  const ranked = rankFactions(Array.from({ length: 7 }, (_, i) => fac(`f${i}`, 10 - i)));

  it('dims nothing when nothing is selected', () => {
    expect(isDimmed(null, 0, ranked)).toBe(false);
    expect(isDimmed(null, null, ranked)).toBe(false);
  });

  it('keeps only the chosen faction lit', () => {
    const sel = { kind: 'faction', index: 2 } as const;
    expect(isDimmed(sel, 2, ranked)).toBe(false);
    expect(isDimmed(sel, 3, ranked)).toBe(true);
    expect(isDimmed(sel, null, ranked)).toBe(true);
  });

  it('lights every merged faction when other is chosen', () => {
    const sel = { kind: 'other' } as const;
    expect(isDimmed(sel, 5, ranked)).toBe(false);
    expect(isDimmed(sel, 6, ranked)).toBe(false);
    expect(isDimmed(sel, 0, ranked)).toBe(true);
    expect(isDimmed(sel, null, ranked)).toBe(true);
  });

  it('dims to 0.3', () => {
    expect(DIMMED_OPACITY).toBe(0.3);
  });

  it('toggles: picking the same entry again clears, a different one switches', () => {
    const a = { kind: 'faction', index: 1 } as const;
    const b = { kind: 'faction', index: 2 } as const;
    expect(toggleFactionSelection(null, a)).toEqual(a);
    expect(toggleFactionSelection(a, a)).toBeNull();
    expect(toggleFactionSelection(a, b)).toEqual(b);
    expect(toggleFactionSelection(a, { kind: 'other' })).toEqual({ kind: 'other' });
    expect(toggleFactionSelection({ kind: 'other' }, { kind: 'other' })).toBeNull();
  });
});

describe('tone', () => {
  it('maps the three backend segments onto families', () => {
    expect(toneFamilyOf('declarative')).toBe('steady');
    expect(toneFamilyOf('interrogative')).toBe('inquiry');
    expect(toneFamilyOf('exclamatory')).toBe('agitated');
  });

  it('does not guess a colour for an unknown label', () => {
    expect(toneFamilyOf('sarcastic')).toBeNull();
  });

  it('orders segments by family (warm → agitated), same input order irrelevant', () => {
    const out = orderTones([
      { label: 'exclamatory', value: 0.1 },
      { label: 'declarative', value: 0.7 },
      { label: 'interrogative', value: 0.2 },
    ]);
    expect(out.map((s) => s.label)).toEqual(['interrogative', 'declarative', 'exclamatory']);
  });

  it('puts unclassified labels last, keeping their label', () => {
    const out = orderTones([
      { label: 'mystery', value: 0.05 },
      { label: 'exclamatory', value: 0.1 },
    ]);
    expect(out.map((s) => s.label)).toEqual(['exclamatory', 'mystery']);
    expect(out[1].family).toBeNull();
  });

  it('writes a label inside the segment only from 8%', () => {
    expect(showToneLabel(0.08)).toBe(true);
    expect(showToneLabel(0.0799)).toBe(false);
    expect(showToneLabel(0.34)).toBe(true);
  });
});

describe('parseChapterRange', () => {
  it('parses hyphen and en-dash ranges', () => {
    expect(parseChapterRange('1-3')).toEqual([1, 3]);
    expect(parseChapterRange('3 – 6')).toEqual([3, 6]);
  });
  it('parses a single chapter as a one-chapter range', () => {
    expect(parseChapterRange('5')).toEqual([5, 5]);
    expect(parseChapterRange(' 1 ')).toEqual([1, 1]);
  });
  it('returns null for unparseable input', () => {
    expect(parseChapterRange('Ch.1')).toBeNull();
    expect(parseChapterRange('')).toBeNull();
    expect(parseChapterRange('1-2-3')).toBeNull();
    expect(parseChapterRange('1-')).toBeNull();
  });
});

describe('assignArcRows', () => {
  it('staggers only phases that share a chapter', () => {
    // the canvas example: 1–3, 3–6, 6–8, 8–10 — every neighbour shares a boundary chapter
    expect(
      assignArcRows([
        [1, 3],
        [3, 6],
        [6, 8],
        [8, 10],
      ]),
    ).toEqual([0, 1, 0, 1]);
  });

  it('keeps disjoint phases on one row', () => {
    expect(
      assignArcRows([
        [1, 3],
        [4, 6],
        [7, 9],
      ]),
    ).toEqual([0, 0, 0]);
  });

  it('only staggers the pairs that actually overlap', () => {
    expect(
      assignArcRows([
        [1, 3],
        [3, 5],
        [6, 8],
      ]),
    ).toEqual([0, 1, 0]);
  });

  it('opens a third row when two rows are both taken', () => {
    expect(
      assignArcRows([
        [1, 6],
        [2, 7],
        [3, 8],
      ]),
    ).toEqual([0, 1, 2]);
  });

  it('puts unparseable ranges on row 0 without disturbing the rest', () => {
    expect(assignArcRows([null, [1, 2], [2, 3]])).toEqual([0, 0, 1]);
  });

  it('handles an empty arc', () => {
    expect(assignArcRows([])).toEqual([]);
  });
});

describe('confidenceBand', () => {
  it('uses the 80 / 50 thresholds', () => {
    expect(confidenceBand(87)).toBe('high');
    expect(confidenceBand(80)).toBe('high');
    expect(confidenceBand(79)).toBe('mid');
    expect(confidenceBand(50)).toBe('mid');
    expect(confidenceBand(49)).toBe('low');
    expect(confidenceBand(0)).toBe('low');
  });
});

describe('archetypeState', () => {
  const only = (fw: string) => ({ archetypes: [{ framework: fw }] });
  it('is ready when the framework has an archetype', () => {
    expect(archetypeState(only('jung'), 'jung')).toBe('ready');
  });
  it('is notGenerated when absent and not reported as failed', () => {
    expect(archetypeState(only('jung'), 'schmidt')).toBe('notGenerated');
    expect(archetypeState({ archetypes: [], failedParts: [] }, 'jung')).toBe('notGenerated');
  });
  it('is failed when failedParts names that framework', () => {
    expect(archetypeState({ ...only('jung'), failedParts: ['archetype:schmidt'] }, 'schmidt')).toBe('failed');
  });
  it('does not mistake the other framework failing', () => {
    expect(archetypeState({ ...only('jung'), failedParts: ['archetype:jung'] }, 'schmidt')).toBe('notGenerated');
  });
  it('tolerates a null failedParts', () => {
    expect(archetypeState({ archetypes: [], failedParts: null }, 'jung')).toBe('notGenerated');
  });
});

describe('quadrantStatus', () => {
  it('never reports unavailable while metrics are still loading', () => {
    expect(quadrantStatus(true, 0)).toBe('loading');
  });
  it('reports unavailable once loaded with nothing to plot', () => {
    expect(quadrantStatus(false, 0)).toBe('unavailable');
  });
  it('is ready with plotted characters', () => {
    expect(quadrantStatus(false, 12)).toBe('ready');
  });
});

describe('archetype names across languages', () => {
  it('maps a name in either language to the shared id', () => {
    expect(archetypeIdOf('jung', '統治者')).toBe('ruler');
    expect(archetypeIdOf('jung', 'The Ruler')).toBe('ruler');
    expect(archetypeIdOf('jung', ' the ruler ')).toBe('ruler');
    expect(archetypeIdOf('schmidt', '國王')).toBe('king');
  });
  it('returns null for unknown or empty names', () => {
    expect(archetypeIdOf('jung', '不存在的原型')).toBeNull();
    expect(archetypeIdOf('jung', undefined)).toBeNull();
  });
  it('keys by id, falling back to the raw name', () => {
    expect(archetypeKey('jung', '統治者')).toBe('ruler');
    expect(archetypeKey('jung', '自創原型')).toBe('自創原型');
  });
  it('displays the name in the interface language', () => {
    expect(archetypeDisplayName('jung', '統治者', 'en')).toBe('The Ruler');
    expect(archetypeDisplayName('jung', 'The Ruler', 'zh-TW')).toBe('統治者');
    expect(archetypeDisplayName('jung', '自創原型', 'en')).toBe('自創原型');
  });
});

