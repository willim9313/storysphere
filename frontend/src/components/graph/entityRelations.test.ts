import { describe, expect, it } from 'vitest';
import type { GraphEdge, GraphNode } from '@/api/types';
import { buildEntityRelations } from './entityRelations';

const node = (id: string, name: string): GraphNode => ({ id, name, type: 'character', chunkCount: 1 });
const edge = (id: string, source: string, target: string, extra: Partial<GraphEdge> = {}): GraphEdge => ({
  id,
  source,
  target,
  inferred: false,
  ...extra,
});

const nodes = [node('a', 'A'), node('b', 'B'), node('c', 'C'), node('d', 'D')];

describe('buildEntityRelations', () => {
  it('lists both directions, resolves the other endpoint', () => {
    const rows = buildEntityRelations('a', nodes, [edge('1', 'a', 'b'), edge('2', 'c', 'a')], null);
    expect(rows.map((r) => r.otherId).sort()).toEqual(['b', 'c']);
  });

  it('skips inferred edges, unrelated edges and unknown endpoints', () => {
    const rows = buildEntityRelations(
      'a',
      nodes,
      [edge('1', 'a', 'b', { inferred: true }), edge('2', 'c', 'd'), edge('3', 'a', 'zzz')],
      null,
    );
    expect(rows).toEqual([]);
  });

  it('sorts by weight desc then bucket, classifies bucket', () => {
    const rows = buildEntityRelations(
      'a',
      nodes,
      [
        edge('1', 'a', 'b', { weight: 0.3, label: 'ally' }),
        edge('2', 'a', 'c', { weight: 0.9, label: 'enemy' }),
        edge('3', 'a', 'd', { weight: 0.3, label: 'owns' }),
      ],
      null,
    );
    expect(rows.map((r) => r.otherId)).toEqual(['c', 'b', 'd']);
    expect(rows.map((r) => r.bucket)).toEqual(['negative', 'positive', 'neutral']);
  });

  it('flags relations whose other endpoint is off the canvas', () => {
    const rows = buildEntityRelations('a', nodes, [edge('1', 'a', 'b'), edge('2', 'a', 'c')], new Set(['a', 'b']));
    expect(rows.find((r) => r.otherId === 'b')?.hidden).toBe(false);
    expect(rows.find((r) => r.otherId === 'c')?.hidden).toBe(true);
  });

  it('lists the same other end and type once, keeping the strongest copy', () => {
    const nodes = [
      { id: 'a', name: 'A' },
      { id: 'b', name: 'B' },
    ] as unknown as Parameters<typeof buildEntityRelations>[1];
    const edges = [
      { id: 'e1', source: 'a', target: 'b', label: 'family', weight: 0.4 },
      { id: 'e2', source: 'b', target: 'a', label: 'family', weight: 0.9 },
      { id: 'e3', source: 'a', target: 'b', label: 'ally', weight: 0.5 },
    ] as unknown as Parameters<typeof buildEntityRelations>[2];
    const rows = buildEntityRelations('a', nodes, edges, null);
    expect(rows.map((r) => [r.type, r.edgeId])).toEqual([['family', 'e2'], ['ally', 'e3']]);
  });
});
