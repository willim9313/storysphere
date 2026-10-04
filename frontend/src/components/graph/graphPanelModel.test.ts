import { describe, expect, it } from 'vitest';
import {
  MAIN_PANEL_WIDTH,
  RAIL_CHAIN,
  SECONDARY_PANEL_WIDTH,
  activeSecondaryPanel,
  railWidth,
  resolveRailPanel,
  type RailInput,
} from './graphPanelModel';

const base: RailInput = {
  compareReady: false,
  inferredReviewOpen: false,
  aggregateLens: false,
  hasSelectedNode: false,
};

describe('resolveRailPanel', () => {
  it('returns null when nothing asks for the rail', () => {
    expect(resolveRailPanel(base)).toBeNull();
  });

  it('compare beats everything else', () => {
    expect(
      resolveRailPanel({
        compareReady: true,
        inferredReviewOpen: true,
        aggregateLens: true,
        hasSelectedNode: true,
      }),
    ).toBe('compare');
  });

  it('inferred review beats cluster overview and entity detail', () => {
    expect(
      resolveRailPanel({ ...base, inferredReviewOpen: true, aggregateLens: true, hasSelectedNode: true }),
    ).toBe('inferred');
  });

  it('cluster overview shows on an aggregate lens only while no node is selected', () => {
    expect(resolveRailPanel({ ...base, aggregateLens: true })).toBe('cluster');
    expect(resolveRailPanel({ ...base, aggregateLens: true, hasSelectedNode: true })).toBe('entity');
  });

  it('entity detail shows for a selected node on the individual lens', () => {
    expect(resolveRailPanel({ ...base, hasSelectedNode: true })).toBe('entity');
  });

  it('chain order is the priority order', () => {
    expect(RAIL_CHAIN).toEqual(['compare', 'inferred', 'cluster', 'entity']);
  });
});

describe('activeSecondaryPanel', () => {
  it('passes the request through only when the entity panel is the main one', () => {
    expect(activeSecondaryPanel('entity', 'analysis')).toBe('analysis');
    expect(activeSecondaryPanel('entity', null)).toBeNull();
  });

  it('drops the request when another panel took over (the old overlap bug)', () => {
    expect(activeSecondaryPanel('inferred', 'analysis')).toBeNull();
    expect(activeSecondaryPanel('compare', 'paragraphs')).toBeNull();
    expect(activeSecondaryPanel('cluster', 'paragraphs')).toBeNull();
    expect(activeSecondaryPanel(null, 'analysis')).toBeNull();
  });
});

describe('railWidth', () => {
  it('is 0 with no main panel', () => {
    expect(railWidth(null, null)).toBe(0);
  });

  it('is 320 for every main panel', () => {
    for (const p of RAIL_CHAIN) expect(railWidth(p, null)).toBe(MAIN_PANEL_WIDTH);
    expect(MAIN_PANEL_WIDTH).toBe(320);
  });

  it('adds the secondary panel width on top (360 / 400)', () => {
    expect(railWidth('entity', 'analysis')).toBe(320 + SECONDARY_PANEL_WIDTH.analysis);
    expect(railWidth('entity', 'paragraphs')).toBe(320 + 400);
  });
});
