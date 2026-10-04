import { describe, expect, it } from 'vitest';

import type { BuildOverviewEdge, BuildOverviewNode, NodeStatus } from '@/api/buildOverview';
import {
  NODE_SLOT,
  actionModeFor,
  aggregate,
  blockersOf,
  ctaStateFor,
  droppedNodes,
  edgeRole,
  fanAnchorY,
  layerProgress,
  layoutEdges,
  metaValueText,
  neighborIds,
  scorePct,
  sharedTriggerPeers,
  upstreamChain,
} from './buildOverviewModel';

// 後端 unraveling_manifest.py 的權威邊表（43 條），與稿的 EDGES 逐條相同。
const E = (source: string, target: string): BuildOverviewEdge => ({ source, target });
const EDGES: BuildOverviewEdge[] = [
  E('book_meta', 'chapters'),
  E('chapters', 'paragraphs'), E('chapters', 'summaries'),
  E('paragraphs', 'keywords'), E('paragraphs', 'symbols'),
  E('paragraphs', 'kg_entity'), E('paragraphs', 'kg_concept'),
  E('paragraphs', 'kg_concept_inferred'), E('paragraphs', 'kg_relation'),
  E('paragraphs', 'kg_event'),
  E('kg_event', 'kg_temporal_relation'), E('eep', 'kg_temporal_relation'),
  E('kg_entity', 'cep'), E('paragraphs', 'cep'), E('keywords', 'cep'),
  E('kg_event', 'eep'), E('kg_entity', 'eep'), E('paragraphs', 'eep'),
  E('kg_event', 'teu'), E('kg_concept', 'teu'), E('kg_concept_inferred', 'teu'), E('summaries', 'teu'),
  E('symbols', 'sep'), E('kg_entity', 'sep'),
  E('cep', 'character_analysis_result'),
  E('kg_entity', 'voice_profile'), E('paragraphs', 'voice_profile'),
  E('sep', 'symbol_analysis_result'), E('kg_entity', 'symbol_analysis_result'), E('kg_event', 'symbol_analysis_result'),
  E('eep', 'causality_analysis'), E('kg_event', 'causality_analysis'),
  E('eep', 'impact_analysis'), E('kg_event', 'impact_analysis'),
  E('teu', 'tension_lines'),
  E('summaries', 'narrative_structure'), E('kg_event', 'narrative_structure'), E('eep', 'narrative_structure'),
  E('summaries', 'hero_journey_stage'),
  E('eep', 'temporal_analysis'), E('kg_event', 'temporal_analysis'),
  E('tension_lines', 'tension_theme'),
  E('kg_temporal_relation', 'chronological_rank'),
];

const node = (nodeId: string, status: NodeStatus): BuildOverviewNode => ({
  nodeId,
  layer: NODE_SLOT[nodeId].layer,
  label: nodeId,
  status,
  counts: {},
  meta: {},
});

describe('layout', () => {
  it('places all 27 nodes and every edge of the authoritative table', () => {
    expect(Object.keys(NODE_SLOT)).toHaveLength(27);
    expect(EDGES).toHaveLength(43);
    expect(layoutEdges(EDGES)).toHaveLength(43);
  });

  it('gives no two nodes the same slot', () => {
    const slots = Object.values(NODE_SLOT).map((s) => `${s.layer}:${s.row}`);
    expect(new Set(slots).size).toBe(27);
  });

  it('routes only eep → kg_temporal_relation as a back edge', () => {
    const back = layoutEdges(EDGES).filter((e) => e.kind === 'back');
    expect(back.map((e) => `${e.source}>${e.target}`)).toEqual(['eep>kg_temporal_relation']);
  });

  it('draws edges inside one column as side loops: the L0 chain and kg_event → kg_temporal_relation', () => {
    const same = layoutEdges(EDGES).filter((e) => e.kind === 'same');
    expect(same.map((e) => `${e.source}>${e.target}`)).toEqual([
      'book_meta>chapters',
      'chapters>paragraphs',
      'kg_event>kg_temporal_relation',
    ]);
  });

  it('drops an edge whose end the page does not know', () => {
    expect(layoutEdges([E('book_meta', 'chapters'), E('chapters', 'ghost')])).toHaveLength(1);
  });

  it('keeps the manifest index so selection can refer to the edge', () => {
    const laid = layoutEdges([E('ghost', 'chapters'), E('book_meta', 'chapters')]);
    expect(laid[0].index).toBe(1);
  });

  it('spreads the seven paragraphs fan-out along the node edge', () => {
    const ys = layoutEdges(EDGES)
      .filter((e) => e.source === 'paragraphs' && e.kind === 'forward')
      .map((e) => Number(e.d.split(' ')[1]));
    expect(ys.length).toBeGreaterThan(5);
    expect(new Set(ys).size).toBe(ys.length);
  });

  it('keeps a single anchor at the node middle', () => {
    expect(fanAnchorY(100, 1, 0)).toBe(118);
    expect(fanAnchorY(100, 3, 1)).toBe(118);
    expect(fanAnchorY(100, 3, 0)).toBeLessThan(fanAnchorY(100, 3, 2));
  });
});

describe('completion', () => {
  it('weights partial nodes at half: (14 + 4 × 0.5) / 27 = 59%', () => {
    const nodes = [
      ...Array.from({ length: 14 }, (_, i) => ({ ...node('chapters', 'complete'), nodeId: `c${i}` })),
      ...Array.from({ length: 4 }, (_, i) => ({ ...node('chapters', 'partial'), nodeId: `p${i}` })),
      ...Array.from({ length: 9 }, (_, i) => ({ ...node('chapters', 'empty'), nodeId: `e${i}` })),
    ];
    const p = aggregate(nodes);
    expect([p.complete, p.partial, p.empty, p.total]).toEqual([14, 4, 9, 27]);
    expect(scorePct(p)).toBe(59);
  });

  it('is 0 for an empty node list instead of NaN', () => {
    expect(aggregate([]).score).toBe(0);
  });

  it('scores one layer on its own', () => {
    const nodes = [node('summaries', 'complete'), node('keywords', 'partial'), node('paragraphs', 'complete')];
    const l1 = layerProgress(nodes, 1);
    expect(l1.total).toBe(2);
    expect(scorePct(l1)).toBe(75);
  });
});

describe('selection', () => {
  it('walks the upstream chain transitively: kg_event needs 3 nodes', () => {
    expect(new Set(upstreamChain(EDGES, 'kg_event'))).toEqual(
      new Set(['paragraphs', 'chapters', 'book_meta']),
    );
  });

  it('has no upstream for a root node', () => {
    expect(upstreamChain(EDGES, 'book_meta')).toEqual([]);
  });

  it('follows a node that is also a neighbour through more than one path once', () => {
    const chain = upstreamChain(EDGES, 'eep');
    expect(chain.length).toBe(new Set(chain).size);
    expect(chain).toContain('book_meta');
  });

  it('lists direct neighbours on both sides', () => {
    const n = new Set(neighborIds(EDGES, 'kg_event'));
    expect(n.has('paragraphs')).toBe(true);
    expect(n.has('eep')).toBe(true);
    expect(n.has('chapters')).toBe(false);
  });

  it('colours only upstream-chain edges and direct links; everything else is rest', () => {
    const chain = new Set(upstreamChain(EDGES, 'kg_event'));
    expect(edgeRole(E('paragraphs', 'kg_event'), 'kg_event', chain)).toBe('up');
    expect(edgeRole(E('chapters', 'paragraphs'), 'kg_event', chain)).toBe('up');
    expect(edgeRole(E('kg_event', 'eep'), 'kg_event', chain)).toBe('link');
    expect(edgeRole(E('summaries', 'teu'), 'kg_event', chain)).toBe('rest');
  });
});

describe('drop table', () => {
  const all = (status: NodeStatus) => Object.keys(NODE_SLOT).map((id) => node(id, status));

  it('lists only built nodes', () => {
    const nodes = all('empty').map((n) =>
      ['sep', 'symbol_analysis_result'].includes(n.nodeId) ? { ...n, status: 'partial' as const } : n,
    );
    expect(droppedNodes('symbols', nodes).map((n) => n.nodeId)).toEqual(['sep', 'symbol_analysis_result']);
    const onlySep = nodes.map((n) => (n.nodeId === 'symbol_analysis_result' ? { ...n, status: 'empty' as const } : n));
    expect(droppedNodes('symbols', onlySep).map((n) => n.nodeId)).toEqual(['sep']);
  });

  it('knowledge-graph also drops the three nodes the backend clears beyond the draft', () => {
    const ids = droppedNodes('kg_event', all('complete')).map((n) => n.nodeId);
    expect(ids).toHaveLength(10);
    expect(ids).toEqual(
      expect.arrayContaining(['kg_temporal_relation', 'chronological_rank', 'kg_concept_inferred']),
    );
  });

  it('is shared by the four nodes of one KG rerun', () => {
    const nodes = all('complete');
    const key = (id: string) => droppedNodes(id, nodes).map((n) => n.nodeId).join();
    expect(new Set(['kg_entity', 'kg_concept', 'kg_relation', 'kg_event'].map(key)).size).toBe(1);
  });

  it('feature-extraction deletes nothing, and zero-drop triggers list nothing', () => {
    expect(droppedNodes('keywords', all('complete'))).toEqual([]);
    expect(droppedNodes('summaries', all('complete'))).toEqual([]);
    expect(droppedNodes('cep', all('complete'))).toEqual([]);
  });

  it('has no list for a node without a trigger', () => {
    expect(droppedNodes('teu', all('complete'))).toEqual([]);
  });
});

describe('shared trigger peers', () => {
  it('pairs CEP with 角色分析', () => {
    expect(sharedTriggerPeers('cep')).toEqual(['character_analysis_result']);
    expect(sharedTriggerPeers('character_analysis_result')).toEqual(['cep']);
  });

  it('groups EEP, 因果, 影響力 in column order', () => {
    expect(sharedTriggerPeers('causality_analysis')).toEqual(['eep', 'impact_analysis']);
  });

  it('groups the four KG nodes', () => {
    expect(sharedTriggerPeers('kg_entity')).toEqual(['kg_concept', 'kg_relation', 'kg_event']);
  });

  it('gives a solo trigger and a node without trigger no peers', () => {
    expect(sharedTriggerPeers('symbols')).toEqual([]);
    expect(sharedTriggerPeers('kg_concept_inferred')).toEqual([]);
    expect(sharedTriggerPeers('teu')).toEqual([]);
  });
});

describe('blockers and action mode', () => {
  it('lists first-order upstream nodes that are not complete', () => {
    const nodes = [node('eep', 'empty'), node('kg_event', 'complete'), node('causality_analysis', 'empty')];
    expect(blockersOf('causality_analysis', nodes, EDGES).map((n) => n.nodeId)).toEqual(['eep']);
  });

  it('marks L0 as a source node whatever else is true', () => {
    expect(actionModeFor({ nodeId: 'chapters', layer: 0, status: 'partial' }, 2)).toBe('source');
  });

  it('puts narrative_structure ahead of its blockers — even when complete', () => {
    expect(actionModeFor({ nodeId: 'narrative_structure', layer: 3, status: 'empty' }, 3)).toBe('hazard');
    expect(actionModeFor({ nodeId: 'narrative_structure', layer: 3, status: 'complete' }, 0)).toBe('hazard');
  });

  it('blocks an unfinished node that has unfinished upstream', () => {
    expect(actionModeFor({ nodeId: 'causality_analysis', layer: 3, status: 'empty' }, 1)).toBe('blocked');
    expect(actionModeFor({ nodeId: 'teu', layer: 2, status: 'empty' }, 1)).toBe('blocked');
  });

  it('does not block a complete node on its upstream', () => {
    expect(actionModeFor({ nodeId: 'symbols', layer: 1, status: 'complete' }, 1)).toBe('trigger');
  });

  it('keeps the planned-feature note for triggerless nodes, and hides it once complete', () => {
    expect(actionModeFor({ nodeId: 'teu', layer: 2, status: 'partial' }, 0)).toBe('soon');
    expect(actionModeFor({ nodeId: 'tension_lines', layer: 3, status: 'complete' }, 0)).toBe('none');
  });

  it('uses the partial wording for a complete node', () => {
    expect(ctaStateFor('complete')).toBe('partial');
    expect(ctaStateFor('partial')).toBe('partial');
    expect(ctaStateFor('empty')).toBe('empty');
  });
});

describe('metaValueText', () => {
  it('shows an em dash for empty values', () => {
    expect(metaValueText('')).toBe('—');
    expect(metaValueText('  ')).toBe('—');
    expect(metaValueText(undefined)).toBe('—');
  });

  it('keeps real values, including 0 and false', () => {
    expect(metaValueText('zh-tw')).toBe('zh-tw');
    expect(metaValueText(0)).toBe('0');
    expect(metaValueText(false)).toBe('false');
  });
});
