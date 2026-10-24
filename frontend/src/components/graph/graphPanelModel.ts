/**
 * Right-rail priority chain for the knowledge-graph page (pure logic, no React).
 *
 * `compare > inferred review > cluster overview > entity / event detail` — one
 * main panel at a time, decided by selection state alone. The rail only *names*
 * the winner (a read-out, never a control).
 */

export type RailPanel = 'compare' | 'inferred' | 'cluster' | 'entity';

/** Chain order = priority order; the rail's four dots follow it. */
export const RAIL_CHAIN: readonly RailPanel[] = ['compare', 'inferred', 'cluster', 'entity'];

/** Main panels are all this wide (frozen geometry, 14 D). */
export const MAIN_PANEL_WIDTH = 320;

export type SecondaryPanel = 'analysis' | 'paragraphs';

/** Secondary panels stack to the LEFT of the main one (which stays pinned right), one at a time. */
export const SECONDARY_PANEL_WIDTH: Record<SecondaryPanel, number> = {
  analysis: 360,
  paragraphs: 400,
};

export interface RailInput {
  /** Two nodes are selected (multi-select compare). */
  compareReady: boolean;
  /** The inferred-review panel was opened or an inferred edge was tapped. */
  inferredReviewOpen: boolean;
  /** Aggregate lens (type / community). */
  aggregateLens: boolean;
  /** A single node is selected. */
  hasSelectedNode: boolean;
}

export function resolveRailPanel(input: RailInput): RailPanel | null {
  if (input.compareReady) return 'compare';
  if (input.inferredReviewOpen) return 'inferred';
  if (input.aggregateLens && !input.hasSelectedNode) return 'cluster';
  if (input.hasSelectedNode) return 'entity';
  return null;
}

/**
 * Secondary panels belong to the entity / event detail panel: they only exist
 * while that panel is the main one. (They used to render whenever a node was
 * selected, so opening the review panel left a 360/400 panel stacked on it.)
 */
export function activeSecondaryPanel(
  main: RailPanel | null,
  requested: SecondaryPanel | null,
): SecondaryPanel | null {
  return main === 'entity' ? requested : null;
}

/** Total width the right rail occupies — the bottom-right stack anchors to it. */
export function railWidth(main: RailPanel | null, secondary: SecondaryPanel | null): number {
  if (main === null) return 0;
  return MAIN_PANEL_WIDTH + (secondary ? SECONDARY_PANEL_WIDTH[secondary] : 0);
}

/**
 * Narrow stages (UI_SPEC §3.6, 720px minimum): the frozen panel widths can eat
 * the whole canvas, so the layout yields instead of clipping.
 *
 * - The secondary panel stacks left of the main one only while at least
 *   MIN_CANVAS_WIDTH of canvas survives; otherwise it covers the main panel
 *   (pinned right) — closing it brings the main panel back.
 */
export const MIN_CANVAS_WIDTH = 280;
/** `.kg-lens` (bottom-left) and `.kg-br` (bottom-right) widths, plus the --space-5 gutter. */
const LENS_CARD_WIDTH = 272;
export const CORNER_STACK_WIDTH = 182;
const GUTTER = 12;

export interface RailLayout {
  /** The secondary panel sits over the main one instead of beside it. */
  secondaryOverlay: boolean;
  /** Width the rail takes from the right of the stage. */
  occupied: number;
}

export function railLayout(
  stageWidth: number,
  main: RailPanel | null,
  secondary: SecondaryPanel | null,
): RailLayout {
  if (main === null) return { secondaryOverlay: false, occupied: 0 };
  if (secondary === null) return { secondaryOverlay: false, occupied: MAIN_PANEL_WIDTH };
  const stacked = MAIN_PANEL_WIDTH + SECONDARY_PANEL_WIDTH[secondary];
  if (stageWidth - stacked >= MIN_CANVAS_WIDTH) return { secondaryOverlay: false, occupied: stacked };
  return { secondaryOverlay: true, occupied: SECONDARY_PANEL_WIDTH[secondary] };
}

/**
 * When the canvas left of the rail can't hold the lens card and the
 * stats／mini-map／zoom stack side by side, the stack goes compact: mini-map
 * dropped, stats + zoom moved to the canvas's top-right corner.
 */
export function cornerStackCompact(stageWidth: number, occupied: number): boolean {
  return stageWidth - occupied < GUTTER + LENS_CARD_WIDTH + GUTTER + CORNER_STACK_WIDTH + GUTTER;
}
