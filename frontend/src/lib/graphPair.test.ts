import { describe, it, expect } from 'vitest';
import {
  commonNeighborIds,
  capCommonNeighbors,
  pairEvolution,
  shortestPath,
  isInsufficientChange,
  COMMON_NEIGHBOR_CAP,
  type PairChapterStep,
} from './graphPair';
import type { GraphData, GraphEdge, GraphNode } from '@/api/types';

function node(id: string): GraphNode {
  return { id, name: id, type: 'character', chunkCount: 1 };
}

function edge(id: string, source: string, target: string, weight?: number): GraphEdge {
  return { id, source, target, weight };
}

function graph(nodeIds: string[], edges: GraphEdge[]): GraphData {
  return { nodes: nodeIds.map(node), edges };
}

// ── commonNeighborIds ────────────────────────────────────────────────────

describe('commonNeighborIds', () => {
  it('finds the basic intersection and excludes a/b themselves', () => {
    const g = graph(
      ['a', 'b', 'x', 'y', 'z'],
      [
        edge('e1', 'a', 'b'),
        edge('e2', 'a', 'x'),
        edge('e3', 'b', 'x'),
        edge('e4', 'a', 'y'),
        edge('e5', 'b', 'y'),
        edge('e6', 'a', 'z'), // z only adjacent to a, not b
      ],
    );
    const result = commonNeighborIds(g, 'a', 'b');
    expect(result).not.toContain('a');
    expect(result).not.toContain('b');
    expect(result.sort()).toEqual(['x', 'y']);
  });

  it('orders by co-occurrence weight descending', () => {
    const g = graph(
      ['a', 'b', 'x', 'y'],
      [
        edge('e1', 'a', 'x', 3),
        edge('e2', 'b', 'x', 2), // weight(x) = 5
        edge('e3', 'a', 'y', 1),
        edge('e4', 'b', 'y', 1), // weight(y) = 2
      ],
    );
    expect(commonNeighborIds(g, 'a', 'b')).toEqual(['x', 'y']);
  });

  it('breaks ties deterministically by id when weights default to 1', () => {
    const g = graph(
      ['a', 'b', 'n', 'm'],
      [
        edge('e1', 'a', 'n'),
        edge('e2', 'b', 'n'),
        edge('e3', 'a', 'm'),
        edge('e4', 'b', 'm'),
      ],
    );
    // both n and m have weight 1+1=2 -> tie-break by id ascending
    expect(commonNeighborIds(g, 'a', 'b')).toEqual(['m', 'n']);
  });
});

// ── capCommonNeighbors ───────────────────────────────────────────────────

describe('capCommonNeighbors', () => {
  it('returns overflow 0 when under the cap', () => {
    const ids = ['a', 'b', 'c'];
    expect(capCommonNeighbors(ids, 15)).toEqual({ shown: ids, overflow: 0 });
  });

  it('caps and reports overflow when over the cap', () => {
    const ids = Array.from({ length: 20 }, (_, i) => `n${i}`);
    const result = capCommonNeighbors(ids, COMMON_NEIGHBOR_CAP);
    expect(result.shown).toHaveLength(COMMON_NEIGHBOR_CAP);
    expect(result.overflow).toBe(5);
    expect(result.shown).toEqual(ids.slice(0, COMMON_NEIGHBOR_CAP));
  });
});

// ── pairEvolution ────────────────────────────────────────────────────────

describe('pairEvolution', () => {
  it('diffs addedIds correctly against the previous chapter and grows the union', () => {
    const ch1 = graph(
      ['a', 'b', 'x'],
      [edge('e1', 'a', 'x'), edge('e2', 'b', 'x')],
    );
    const ch2 = graph(
      ['a', 'b', 'x', 'y'],
      [edge('e1', 'a', 'x'), edge('e2', 'b', 'x'), edge('e3', 'a', 'y'), edge('e4', 'b', 'y')],
    );
    const ch3 = graph(
      ['a', 'b', 'x', 'y', 'z'],
      [
        edge('e1', 'a', 'x'),
        edge('e2', 'b', 'x'),
        edge('e3', 'a', 'y'),
        edge('e4', 'b', 'y'),
        edge('e5', 'a', 'z'),
        edge('e6', 'b', 'z'),
      ],
    );

    const steps = pairEvolution(
      [
        { chapter: 1, graph: ch1 },
        { chapter: 2, graph: ch2 },
        { chapter: 3, graph: ch3 },
      ],
      'a',
      'b',
    );

    expect(steps).toHaveLength(3);
    expect(steps[0]).toMatchObject({ chapter: 1, commonIds: ['x'], addedIds: ['x'] });
    expect(steps[1].addedIds).toEqual(['y']);
    expect(steps[1].commonIds.sort()).toEqual(['x', 'y']);
    expect(steps[2].addedIds).toEqual(['z']);
    expect(steps[2].commonIds.sort()).toEqual(['x', 'y', 'z']);
  });

  it('skips snapshots with a missing graph', () => {
    const ch1 = graph(['a', 'b', 'x'], [edge('e1', 'a', 'x'), edge('e2', 'b', 'x')]);
    const steps = pairEvolution(
      [
        { chapter: 1, graph: ch1 },
        { chapter: 2, graph: undefined },
      ],
      'a',
      'b',
    );
    expect(steps).toHaveLength(1);
    expect(steps[0].chapter).toBe(1);
  });
});

// ── shortestPath ─────────────────────────────────────────────────────────

describe('shortestPath', () => {
  it('finds a direct path', () => {
    const g = graph(['a', 'b'], [edge('e1', 'a', 'b')]);
    expect(shortestPath(g, 'a', 'b')).toEqual(['a', 'b']);
  });

  it('finds the shortest multi-hop path over a longer alternative', () => {
    const g = graph(
      ['a', 'b', 'x', 'y', 'z'],
      [
        edge('e1', 'a', 'x'),
        edge('e2', 'x', 'b'), // a-x-b (length 3)
        edge('e3', 'a', 'y'),
        edge('e4', 'y', 'z'),
        edge('e5', 'z', 'b'), // a-y-z-b (length 4)
      ],
    );
    expect(shortestPath(g, 'a', 'b')).toEqual(['a', 'x', 'b']);
  });

  it('returns null when there is no path', () => {
    const g = graph(
      ['a', 'b', 'x', 'y'],
      [edge('e1', 'a', 'x'), edge('e2', 'b', 'y')],
    );
    expect(shortestPath(g, 'a', 'b')).toBeNull();
  });

  it('returns a single-element path when a === b', () => {
    const g = graph(['a'], []);
    expect(shortestPath(g, 'a', 'a')).toEqual(['a']);
  });
});

// ── isInsufficientChange ─────────────────────────────────────────────────

describe('isInsufficientChange', () => {
  it('is true for an empty steps list', () => {
    expect(isInsufficientChange([])).toBe(true);
  });

  it('is true when the final common set is empty', () => {
    const steps: PairChapterStep[] = [{ chapter: 1, commonIds: [], addedIds: [] }];
    expect(isInsufficientChange(steps)).toBe(true);
  });

  it('is true when the union never grows after the first contributing chapter', () => {
    const steps: PairChapterStep[] = [
      { chapter: 1, commonIds: ['x'], addedIds: ['x'] },
      { chapter: 2, commonIds: ['x'], addedIds: [] },
      { chapter: 3, commonIds: ['x'], addedIds: [] },
    ];
    expect(isInsufficientChange(steps)).toBe(true);
  });

  it('is false for a genuinely growing union', () => {
    const steps: PairChapterStep[] = [
      { chapter: 1, commonIds: ['x'], addedIds: ['x'] },
      { chapter: 2, commonIds: ['x', 'y'], addedIds: ['y'] },
    ];
    expect(isInsufficientChange(steps)).toBe(false);
  });
});
