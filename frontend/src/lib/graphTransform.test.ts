import { describe, expect, it } from 'vitest';
import {
  classifyRelationLabel,
  computeClusterPresetPositions,
  computeDegrees,
  partitionOrphanNodes,
  selectFocusLabelIds,
  FOCUS_LABEL_TOP_N,
  type CytoscapeElement,
} from './graphTransform';

// ── fixtures ──────────────────────────────────────────────────────────────────

function node(id: string, extra: Partial<CytoscapeElement['data']> = {}): CytoscapeElement {
  return { group: 'nodes', data: { id, label: id, entityType: 'character', ...extra } };
}

function edge(source: string, target: string, extra: Partial<CytoscapeElement['data']> = {}): CytoscapeElement {
  return {
    group: 'edges',
    data: { id: `${source}-${target}`, source, target, ...extra },
  };
}

// ── computeDegrees ────────────────────────────────────────────────────────────

describe('computeDegrees', () => {
  it('counts each edge once per endpoint', () => {
    const els = [node('a'), node('b'), node('c'), edge('a', 'b'), edge('a', 'c')];
    const degrees = computeDegrees(els);
    expect(degrees.get('a')).toBe(2);
    expect(degrees.get('b')).toBe(1);
    expect(degrees.get('c')).toBe(1);
  });

  it('returns an empty map when there are no edges', () => {
    const els = [node('a'), node('b')];
    expect(computeDegrees(els).size).toBe(0);
  });
});

// ── selectFocusLabelIds ───────────────────────────────────────────────────────

describe('selectFocusLabelIds', () => {
  it('always includes the focus node itself', () => {
    const result = selectFocusLabelIds('focus', [], new Map());
    expect(result.has('focus')).toBe(true);
  });

  it('picks the top-N neighbors by degree, dropping the rest', () => {
    const degrees = new Map([
      ['n1', 10],
      ['n2', 8],
      ['n3', 6],
      ['n4', 4],
    ]);
    const result = selectFocusLabelIds('focus', ['n4', 'n1', 'n2', 'n3'], degrees, 2);
    expect(result).toEqual(new Set(['focus', 'n1', 'n2']));
  });

  it('keeps all neighbors when there are fewer than N', () => {
    const degrees = new Map([
      ['n1', 5],
      ['n2', 3],
    ]);
    const result = selectFocusLabelIds('focus', ['n1', 'n2'], degrees, FOCUS_LABEL_TOP_N);
    expect(result).toEqual(new Set(['focus', 'n1', 'n2']));
  });

  it('treats neighbors missing from the degree map as degree 0', () => {
    const degrees = new Map([['known', 5]]);
    const result = selectFocusLabelIds('focus', ['known', 'unknown'], degrees, 1);
    expect(result).toEqual(new Set(['focus', 'known']));
  });
});

// ── partitionOrphanNodes ──────────────────────────────────────────────────────

describe('partitionOrphanNodes', () => {
  it('separates degree-0 nodes into the orphan list', () => {
    const els = [node('a'), node('b'), node('orphan'), edge('a', 'b')];
    const { connected, orphans } = partitionOrphanNodes(els);
    expect(orphans).toEqual([{ id: 'orphan', name: 'orphan', type: 'character' }]);
    expect(connected.map((e) => e.data.id)).toEqual(['a', 'b', 'a-b']);
  });

  it('returns no orphans when every node has an edge', () => {
    const els = [node('a'), node('b'), edge('a', 'b')];
    const { connected, orphans } = partitionOrphanNodes(els);
    expect(orphans).toEqual([]);
    expect(connected).toHaveLength(3);
  });

  it('leaves cluster super-nodes untouched even with degree 0', () => {
    const els = [node('super', { cluster: true, label: 'Cluster' })];
    const { connected, orphans } = partitionOrphanNodes(els);
    expect(orphans).toEqual([]);
    expect(connected).toEqual(els);
  });

  it('captures orphan name/type from node data', () => {
    const els = [node('e1', { label: '事件標題', entityType: 'event' })];
    const { orphans } = partitionOrphanNodes(els);
    expect(orphans).toEqual([{ id: 'e1', name: '事件標題', type: 'event' }]);
  });
});

// ── classifyRelationLabel ─────────────────────────────────────────────────────

describe('classifyRelationLabel', () => {
  it.each(['ally', 'family', 'friendship', 'member_of', 'romance'])(
    'classifies "%s" as positive',
    (label) => {
      expect(classifyRelationLabel(label)).toBe('positive');
    },
  );

  it('classifies "enemy" as negative', () => {
    expect(classifyRelationLabel('enemy')).toBe('negative');
  });

  it.each(['subordinate', 'located_in', 'owns', 'other', 'participates_in', undefined, null, ''])(
    'classifies %s as neutral',
    (label) => {
      expect(classifyRelationLabel(label)).toBe('neutral');
    },
  );
});

// ── computeClusterPresetPositions ────────────────────────────────────────────

describe('computeClusterPresetPositions', () => {
  it('places N ids at N distinct positions, deterministically', () => {
    const ids = ['cluster:type:character', 'cluster:type:location', 'cluster:type:event'];
    const first = computeClusterPresetPositions(ids);
    const second = computeClusterPresetPositions(ids);
    expect(first.size).toBe(3);
    const positions = ids.map((id) => first.get(id));
    const unique = new Set(positions.map((p) => `${p?.x},${p?.y}`));
    expect(unique.size).toBe(3);
    for (const id of ids) {
      expect(second.get(id)).toEqual(first.get(id));
    }
  });

  it('places a single id at the origin', () => {
    const result = computeClusterPresetPositions(['cluster:type:character']);
    expect(result.get('cluster:type:character')).toEqual({ x: 0, y: 0 });
  });

  it('returns an empty map for no ids', () => {
    expect(computeClusterPresetPositions([]).size).toBe(0);
  });
});
