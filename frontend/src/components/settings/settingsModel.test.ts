import { describe, expect, it } from 'vitest';

import { deployBadges, gapLayer, isUnsetValue, kgMigrationGate, splitFeatureIds } from './settingsModel';

describe('splitFeatureIds', () => {
  it('keeps known ids in backend order and dedupes', () => {
    expect(splitFeatureIds(['factions', 'graph', 'factions'])).toEqual({
      known: ['factions', 'graph'],
      unknownCount: 0,
    });
  });

  it('never lets an unknown id through — it only bumps the count', () => {
    const r = splitFeatureIds(['graph', 'brand_new_feature', 'another_one', 'another_one']);
    expect(r.known).toEqual(['graph']);
    expect(r.unknownCount).toBe(2);
  });

  it('handles empty input', () => {
    expect(splitFeatureIds([])).toEqual({ known: [], unknownCount: 0 });
  });
});

describe('gapLayer', () => {
  const gaps = { networkx: [], neo4j: ['character_metrics', 'factions'] };

  it('is none when neither backend has a gap', () => {
    expect(gapLayer({ networkx: [], neo4j: [] }, 'networkx')).toEqual({ kind: 'none' });
    expect(gapLayer({}, 'neo4j')).toEqual({ kind: 'none' });
  });

  it('shows wording two (if-switch) when only the other backend has a gap', () => {
    expect(gapLayer(gaps, 'networkx')).toEqual({
      kind: 'ifSwitch',
      ids: ['character_metrics', 'factions'],
      otherMode: 'neo4j',
    });
  });

  it('shows wording one (now) when the current backend has a gap', () => {
    expect(gapLayer(gaps, 'neo4j')).toEqual({ kind: 'now', ids: ['character_metrics', 'factions'] });
  });

  it('draws only wording one when both sides have gaps', () => {
    const both = { networkx: ['link_prediction'], neo4j: ['factions'] };
    expect(gapLayer(both, 'networkx')).toEqual({ kind: 'now', ids: ['link_prediction'] });
  });
});

describe('kgMigrationGate', () => {
  it('is unmet outside Standard or when the backend is NetworkX', () => {
    expect(kgMigrationGate({ isStandard: false, backend: 'neo4j', busy: false })).toEqual({ met: false, canRun: false });
    expect(kgMigrationGate({ isStandard: true, backend: 'networkx', busy: false })).toEqual({ met: false, canRun: false });
  });

  it('is met and runnable in Standard + Neo4j', () => {
    expect(kgMigrationGate({ isStandard: true, backend: 'neo4j', busy: false })).toEqual({ met: true, canRun: true });
  });

  it('stays met but not runnable while a migration is in flight', () => {
    expect(kgMigrationGate({ isStandard: true, backend: 'neo4j', busy: true })).toEqual({ met: true, canRun: false });
  });
});

describe('deployBadges', () => {
  it('marks only the actual mode as current and nothing as previewing when they agree', () => {
    expect(deployBadges('lightweight', 'lightweight', 'lightweight')).toEqual({ current: true, previewing: false });
    expect(deployBadges('standard', 'lightweight', 'lightweight')).toEqual({ current: false, previewing: false });
  });

  it('hangs 預覽中 on the selected card when selection and actual diverge', () => {
    expect(deployBadges('lightweight', 'standard', 'lightweight')).toEqual({ current: true, previewing: false });
    expect(deployBadges('standard', 'standard', 'lightweight')).toEqual({ current: false, previewing: true });
  });
});

describe('isUnsetValue', () => {
  it('treats (none), blank and nullish as unset', () => {
    expect(isUnsetValue('(none)')).toBe(true);
    expect(isUnsetValue('')).toBe(true);
    expect(isUnsetValue(null)).toBe(true);
    expect(isUnsetValue(undefined)).toBe(true);
  });

  it('keeps real values primary', () => {
    expect(isUnsetValue('gemini-2.5-flash')).toBe(false);
    expect(isUnsetValue('0.3')).toBe(false);
  });
});
