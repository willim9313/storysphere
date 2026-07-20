import { forwardRef, useEffect, useImperativeHandle, useRef } from 'react';
import cytoscape from 'cytoscape';
import fcose from 'cytoscape-fcose';
import { getCytoscapeStylesheet, layoutOptions } from '@/lib/cytoscapeConfig';
import { useTheme } from '@/contexts/ThemeContext';
import {
  computeDegrees,
  selectFocusLabelIds,
  FOCUS_DEGREE_THRESHOLD,
  type CytoscapeElement,
} from '@/lib/graphTransform';
import type { AnimationMode } from './GraphToolbar';

cytoscape.use(fcose);

export interface ViewportSnapshot {
  viewport: { x1: number; y1: number; x2: number; y2: number };
  nodes: { id: string; x: number; y: number; type: string }[];
  edges: { source: string; target: string }[];
}

export interface GraphCanvasHandle {
  centerOn: (graphX: number, graphY: number) => void;
  panByGraph: (dxGraph: number, dyGraph: number) => void;
  fitView: () => void;
}

interface GraphCanvasProps {
  readonly elements: cytoscape.ElementDefinition[];
  readonly onNodeTap?: (nodeId: string, modifiers: { shift: boolean }) => void;
  readonly onEdgeTap?: (edgeId: string, inferredId: string | null) => void;
  readonly selectedNodeId?: string | null;
  readonly selectedNodeIds?: string[];
  readonly animationMode?: AnimationMode;
  readonly extraStylesheet?: cytoscape.StylesheetStyle[];
  readonly onViewportChange?: (snap: ViewportSnapshot) => void;
}

// eslint-disable-next-line @typescript-eslint/no-explicit-any
const layout = (cy: cytoscape.Core, opts: Record<string, any>) =>
  cy.layout({ ...layoutOptions, ...opts } as cytoscape.LayoutOptions).run();

// ── Focus dim (KG redesign Phase 1) ─────────────────────────────────────
// Stronger than the generic `.dimmed` class (opacity 0.35, defined in
// cytoscapeConfig.ts and still used for e.g. multi-select compare mode) —
// only kicks in for a single selected node whose degree clears
// FOCUS_DEGREE_THRESHOLD (see brief §3-1: high-degree selections make the
// generic dim unreadable). Applied as inline style (not a stylesheet class)
// so it composes with, rather than replaces, the existing highlight
// mechanism.
// Recalibrated 2026-07-20: edge base width is only ~1.2px, so the old edge
// dim (0.07) made focused-out relations vanish; raised so dimmed edges stay
// faintly legible without competing with the highlighted neighbourhood.
const FOCUS_NODE_DIM_OPACITY = 0.13;
const FOCUS_EDGE_DIM_OPACITY = 0.14;
const FOCUS_DIM_TRANSITION_MS = 220;

// ── Label density (KG redesign Phase 1) ─────────────────────────────────
// Non-focus label visibility: shown once EITHER the view is zoomed in past
// this threshold OR the node itself is large (high mention frequency).
// The canvas reference used zoom >= 1.2, but that was demoed on a 36-node
// mock — against the real 264-node book, 1.2 still fits ~100 labels in the
// viewport (label soup). Recalibrated 2026-07-20 to show more by default:
// size 20 ≈ chunkCount ≥ ~11 (was 24 ≈ ≥27); zoom lowered to 1.6 but kept
// above the 1.4 select-zoom so selecting a node still won't flip all labels on.
const ZOOM_LABEL_THRESHOLD = 1.6;
const NODE_SIZE_LABEL_THRESHOLD = 20;

// Event nodes carry full sentence titles ("寇仲夜探塔頂密室與宋玉致相遇") that
// would otherwise wrap or overflow — truncate to a single line (brief §9-1).
const EVENT_LABEL_MAX_WIDTH = '120px';
const staticGraphStylesheet: cytoscape.StylesheetStyle[] = [
  {
    selector: 'node[entityType = "event"]',
    style: {
      'text-wrap': 'ellipsis',
      'text-max-width': EVENT_LABEL_MAX_WIDTH,
    },
  },
  // Focus-mode dim — appended after the base stylesheet so it overrides the
  // generic `.dimmed` (0.35) at equal specificity. Transition declared here
  // so class add/remove fades instead of snapping.
  {
    selector: '.focus-dimmed',
    style: {
      opacity: FOCUS_NODE_DIM_OPACITY,
      'transition-property': 'opacity',
      // cytoscape 型別要 number（單位 ms）
      'transition-duration': FOCUS_DIM_TRANSITION_MS,
    },
  },
  {
    selector: 'edge.focus-dimmed',
    style: {
      opacity: FOCUS_EDGE_DIM_OPACITY,
    },
  },
];

function toDegreeElements(elements: cytoscape.ElementDefinition[]): CytoscapeElement[] {
  return elements.map((el) => ({
    group: el.data.source != null ? 'edges' : 'nodes',
    data: el.data as Record<string, unknown>,
  }));
}

/**
 * Recomputes which nodes should show their label given the current focus
 * state and zoom level. `focusLabelIds === null` means "not focused" (use
 * the zoom/size threshold); a non-null set is the focus-mode allowlist
 * (focused node + top-N neighbors by degree).
 */
function applyLabelVisibility(cy: cytoscape.Core, focusLabelIds: Set<string> | null) {
  const zoom = cy.zoom();
  cy.nodes().forEach((node) => {
    if (node.data('cluster')) return; // cluster super-node labels are always shown
    let show: boolean;
    if (focusLabelIds) {
      show = focusLabelIds.has(node.id());
    } else {
      const size = Number(node.data('size')) || 0;
      show = zoom >= ZOOM_LABEL_THRESHOLD || size >= NODE_SIZE_LABEL_THRESHOLD;
    }
    node.style('text-opacity', show ? 1 : 0);
  });
}

function animateIn(collection: cytoscape.Collection, mode: AnimationMode, delayMs = 0) {
  // Every animation MUST end by removing its opacity bypass — a leftover
  // inline `opacity: 1` permanently defeats stylesheet-level dims
  // (.dimmed / .focus-dimmed), which is exactly the latent bug that made
  // the old selection dim a no-op.
  if (mode === 'stagger') {
    const nodes = collection.nodes().toArray();
    const STEP = 80;

    const nodeRevealAt = new Map<string, number>();
    nodes.forEach((node, i) => {
      const t = delayMs + i * STEP;
      nodeRevealAt.set(node.id(), t);
      node.style({ opacity: 0 });
      setTimeout(
        () =>
          node.animate({
            style: { opacity: 1 },
            duration: 300,
            easing: 'ease-in-out',
            complete: () => node.removeStyle('opacity'),
          }),
        t,
      );
    });

    collection.edges().forEach((edge) => {
      const srcT = nodeRevealAt.get(edge.source().id()) ?? delayMs;
      const tgtT = nodeRevealAt.get(edge.target().id()) ?? delayMs;
      const edgeT = Math.max(srcT, tgtT) + 80;
      edge.style({ opacity: 0 });
      setTimeout(
        () =>
          edge.animate({
            style: { opacity: 1 },
            duration: 400,
            complete: () => edge.removeStyle('opacity'),
          }),
        edgeT,
      );
    });
  } else {
    collection.style({ opacity: 0 });
    setTimeout(
      () =>
        collection.animate({
          style: { opacity: 1 },
          duration: 450,
          easing: 'ease-in-out',
          complete: () => collection.removeStyle('opacity'),
        }),
      delayMs,
    );
  }
}

const applyHighlight = (cy: cytoscape.Core, nodeIds: string[], degrees: Map<string, number>) => {
  cy.elements().removeClass('focus-dimmed');
  if (nodeIds.length === 0) {
    cy.elements().removeClass('dimmed').removeClass('highlighted');
    return;
  }
  let neighborhood = cy.collection();
  for (const id of nodeIds) {
    const n = cy.getElementById(id);
    if (n.length) neighborhood = neighborhood.union(n.closedNeighborhood());
  }
  cy.elements().addClass('dimmed').removeClass('highlighted');
  neighborhood.removeClass('dimmed').addClass('highlighted');

  // Focus mode: a single selected node with degree >= threshold gets a
  // stronger dim than the default `.dimmed` class (0.35) — via the
  // `.focus-dimmed` class (see staticGraphStylesheet), NOT an inline style
  // bypass: bypasses fight with animateIn's opacity animation and whichever
  // writes last wins, whereas class-based styles always resolve
  // deterministically once animateIn cleans up its bypass on completion.
  // Multi-select (compare mode) keeps the standard dim only.
  if (nodeIds.length === 1 && (degrees.get(nodeIds[0]) ?? 0) >= FOCUS_DEGREE_THRESHOLD) {
    cy.elements().difference(neighborhood).addClass('focus-dimmed');
  }
};

const clearHighlight = (cy: cytoscape.Core) => {
  cy.elements().removeClass('dimmed').removeClass('highlighted').removeClass('focus-dimmed');
};

export const GraphCanvas = forwardRef<GraphCanvasHandle, GraphCanvasProps>(function GraphCanvas(
  {
    elements,
    onNodeTap,
    onEdgeTap,
    selectedNodeId,
    selectedNodeIds,
    animationMode = 'fade',
    extraStylesheet = [],
    onViewportChange,
  },
  ref,
) {
  const { theme } = useTheme();
  const containerRef = useRef<HTMLDivElement>(null);
  const cyRef = useRef<cytoscape.Core | null>(null);
  const onNodeTapRef = useRef(onNodeTap);
  const onEdgeTapRef = useRef(onEdgeTap);
  const onViewportChangeRef = useRef(onViewportChange);
  const prevIdsRef = useRef<Set<string>>(new Set());
  const animModeRef = useRef(animationMode);
  const viewportRafRef = useRef<number | null>(null);
  // Per-node position cache, keyed by node id. Snapshotted on removal and
  // restored on re-add so switching cluster modes (or toggling filters) keeps
  // layouts stable instead of re-randomizing each time.
  const positionCacheRef = useRef<Map<string, { x: number; y: number }>>(new Map());
  // Degree per node id, recomputed whenever `elements` changes — shared by
  // focus-dim (applyHighlight) and label visibility so both use one source
  // of truth for "how connected is this node".
  const degreesRef = useRef<Map<string, number>>(new Map());
  // Current focus-mode label allowlist (null when not focused); read by the
  // cy 'zoom' handler above, which fires outside React's render cycle.
  const focusLabelIdsRef = useRef<Set<string> | null>(null);

  useEffect(() => {
    onNodeTapRef.current = onNodeTap;
    onEdgeTapRef.current = onEdgeTap;
    onViewportChangeRef.current = onViewportChange;
    animModeRef.current = animationMode;
  });

  useImperativeHandle(
    ref,
    () => ({
      centerOn(graphX, graphY) {
        const cy = cyRef.current;
        if (!cy) return;
        const z = cy.zoom();
        const w = cy.width();
        const h = cy.height();
        cy.animate(
          { pan: { x: w / 2 - graphX * z, y: h / 2 - graphY * z } },
          { duration: 250, easing: 'ease' },
        );
      },
      panByGraph(dxGraph, dyGraph) {
        const cy = cyRef.current;
        if (!cy) return;
        const z = cy.zoom();
        cy.panBy({ x: -dxGraph * z, y: -dyGraph * z });
      },
      fitView() {
        const cy = cyRef.current;
        if (!cy) return;
        cy.animate({ fit: { eles: cy.elements(), padding: 48 } }, { duration: 300, easing: 'ease' });
      },
    }),
    [],
  );

  const emitViewport = () => {
    const cb = onViewportChangeRef.current;
    const cy = cyRef.current;
    if (!cb || !cy) return;
    if (viewportRafRef.current != null) cancelAnimationFrame(viewportRafRef.current);
    viewportRafRef.current = requestAnimationFrame(() => {
      viewportRafRef.current = null;
      const ext = cy.extent();
      const nodes = cy.nodes().map((n) => ({
        id: n.id(),
        x: n.position('x'),
        y: n.position('y'),
        type: (n.data('clusterType') as string) || (n.data('entityType') as string) || '',
      }));
      const edges = cy.edges().map((e) => ({
        source: e.source().id(),
        target: e.target().id(),
      }));
      cb({
        viewport: { x1: ext.x1, y1: ext.y1, x2: ext.x2, y2: ext.y2 },
        nodes,
        edges,
      });
    });
  };

  // Mount / unmount — create cy once
  useEffect(() => {
    if (!containerRef.current) return;

    const cy = cytoscape({
      container: containerRef.current,
      elements: [],
      style: [...getCytoscapeStylesheet(), ...staticGraphStylesheet],
      minZoom: 0.2,
      maxZoom: 3,
    });

    cy.on('tap', 'node', (evt) => {
      const shift = !!(evt.originalEvent as MouseEvent | undefined)?.shiftKey;
      onNodeTapRef.current?.(evt.target.id(), { shift });
    });

    cy.on('tap', 'edge', (evt) => {
      const data = evt.target.data();
      if (data.inferred) {
        onEdgeTapRef.current?.(evt.target.id(), data.inferredId ?? null);
      }
    });

    cy.on('tap', (evt) => {
      if (evt.target === cy) clearHighlight(cy);
    });

    // Relationship labels are hidden by default (see cytoscapeConfig edge
    // style); reveal them on hover for the hovered node's connections or a
    // directly-hovered edge, then hide again on mouseout.
    cy.on('mouseover', 'node', (evt) => evt.target.connectedEdges().addClass('label-visible'));
    cy.on('mouseout', 'node', (evt) => evt.target.connectedEdges().removeClass('label-visible'));
    cy.on('mouseover', 'edge', (evt) => evt.target.addClass('label-visible'));
    cy.on('mouseout', 'edge', (evt) => evt.target.removeClass('label-visible'));

    cy.on('viewport render', emitViewport);

    // Zoom changes the non-focus label visibility threshold (size/zoom
    // combo) — recompute on every zoom tick using the last-computed focus
    // allowlist (null outside focus mode).
    cy.on('zoom', () => applyLabelVisibility(cy, focusLabelIdsRef.current));

    cyRef.current = cy;

    const ro = new ResizeObserver(() => {
      cy.resize();
      emitViewport();
    });
    ro.observe(containerRef.current);

    return () => {
      ro.disconnect();
      if (viewportRafRef.current != null) cancelAnimationFrame(viewportRafRef.current);
      cy.destroy();
      cyRef.current = null;
      prevIdsRef.current = new Set();
      positionCacheRef.current = new Map();
    };
  }, []);

  // Incremental element updates
  useEffect(() => {
    const cy = cyRef.current;
    if (!cy) return;

    degreesRef.current = computeDegrees(toDegreeElements(elements));

    const prevIds = prevIdsRef.current;
    const nextIds = new Set(elements.map((e) => e.data.id as string));
    const isInitialLoad = prevIds.size === 0 && elements.length > 0;
    const overlapCount = [...prevIds].reduce((n, id) => n + (nextIds.has(id) ? 1 : 0), 0);
    // When prev and next sets don't overlap (e.g. switching cluster mode),
    // there are no anchor nodes to seed new positions from — fall back to a
    // fresh randomized layout instead of starting fcose from stacked (0,0).
    const needsFreshLayout = prevIds.size > 0 && overlapCount === 0 && elements.length > 0;

    const toRemoveIds = [...prevIds].filter((id) => !nextIds.has(id));
    if (toRemoveIds.length > 0) {
      toRemoveIds.forEach((id) => {
        const el = cy.getElementById(id);
        if (el.length) {
          if (el.isNode()) {
            const p = el.position();
            positionCacheRef.current.set(id, { x: p.x, y: p.y });
          }
          el.remove();
        }
      });
    }

    const toAdd = elements.filter((e) => !prevIds.has(e.data.id as string));

    if (toAdd.length > 0) {
      const added = cy.add(toAdd);
      const newNodeAdds = toAdd.filter((e) => e.data.source == null);
      const newNodeIds = new Set(newNodeAdds.map((e) => e.data.id as string));
      const allNewCached =
        newNodeAdds.length > 0 &&
        newNodeAdds.every((e) => positionCacheRef.current.has(e.data.id as string));
      // Deterministic cluster preset layout (Phase 4 ⑤): type-mode super-nodes
      // carry a baked `position` (see graphTransform's computeClusterPresetPositions)
      // — when every newly-added node has one, skip the randomized fcose layout
      // entirely and just fit the viewport to the preset ring.
      const allPreset =
        newNodeAdds.length > 0 && newNodeAdds.every((e) => e.position != null);

      if (allNewCached) {
        added.nodes().forEach((node) => {
          const p = positionCacheRef.current.get(node.id());
          if (p) node.position(p);
        });
        animateIn(added, animModeRef.current, 100);
      } else if (allPreset) {
        added.nodes().forEach((node) => {
          const el = newNodeAdds.find((e) => e.data.id === node.id());
          if (el?.position) node.position(el.position);
        });
        cy.fit(cy.elements(), 48);
        animateIn(added, animModeRef.current, 100);
      } else if (isInitialLoad || needsFreshLayout) {
        // Auto-fit once the fresh layout settles (brief §3-4: initial view
        // was off-center with the graph running off the right edge). Listener
        // goes on the core — layout events bubble up, and the local layout()
        // helper doesn't return the layout instance.
        cy.one('layoutstop', () => cy.fit(cy.elements(), 48));
        layout(cy, { randomize: true, animationDuration: 400 });
        animateIn(added, animModeRef.current, 450);
      } else {
        added.nodes().forEach((node) => {
          const cached = positionCacheRef.current.get(node.id());
          if (cached) {
            node.position(cached);
            return;
          }
          const existing = node
            .neighborhood()
            .nodes()
            .filter((n) => !newNodeIds.has(n.id()));
          if (existing.length > 0) {
            const cx =
              existing.reduce((s, n) => s + (n as cytoscape.NodeSingular).position('x'), 0) /
              existing.length;
            const cy_pos =
              existing.reduce((s, n) => s + (n as cytoscape.NodeSingular).position('y'), 0) /
              existing.length;
            node.position({
              x: cx + (Math.random() - 0.5) * 80,
              y: cy_pos + (Math.random() - 0.5) * 80,
            });
          }
        });
        layout(cy, { randomize: false, animationDuration: 700 });
        animateIn(added, animModeRef.current, 250);
      }
    } else if (toRemoveIds.length > 0) {
      layout(cy, { randomize: false, animationDuration: 500 });
    }

    prevIdsRef.current = nextIds;
  }, [elements]);

  // Highlight on single-select + centre
  useEffect(() => {
    const cy = cyRef.current;
    if (!cy || !selectedNodeId) return;
    const node = cy.getElementById(selectedNodeId);
    if (!node.length) return;
    applyHighlight(cy, [selectedNodeId], degreesRef.current);
    cy.animate({ center: { eles: node }, zoom: 1.4 }, { duration: 400 });
  }, [selectedNodeId]);

  // Multi-select highlight (Scenario E)
  useEffect(() => {
    const cy = cyRef.current;
    if (!cy) return;
    if (selectedNodeIds && selectedNodeIds.length > 0) {
      applyHighlight(cy, selectedNodeIds, degreesRef.current);
    } else if (!selectedNodeId) {
      clearHighlight(cy);
    }
  }, [selectedNodeIds, selectedNodeId]);

  // Focus-mode label allowlist: recompute whenever the graph or selection
  // changes, then re-apply visibility (also re-applied on zoom, see the cy
  // 'zoom' listener registered at mount).
  useEffect(() => {
    const cy = cyRef.current;
    if (!cy) return;
    let focusLabelIds: Set<string> | null = null;
    if (selectedNodeId && (degreesRef.current.get(selectedNodeId) ?? 0) >= FOCUS_DEGREE_THRESHOLD) {
      const neighborIds: string[] = [];
      for (const el of elements) {
        const source = el.data.source as string | undefined;
        const target = el.data.target as string | undefined;
        if (source == null || target == null) continue;
        if (source === selectedNodeId) neighborIds.push(target);
        else if (target === selectedNodeId) neighborIds.push(source);
      }
      focusLabelIds = selectFocusLabelIds(selectedNodeId, neighborIds, degreesRef.current);
    }
    focusLabelIdsRef.current = focusLabelIds;
    applyLabelVisibility(cy, focusLabelIds);
  }, [elements, selectedNodeId]);

  // Re-apply stylesheet on theme / overlay change
  useEffect(() => {
    const cy = cyRef.current;
    if (!cy) return;
    cy.style([
      ...getCytoscapeStylesheet(),
      ...staticGraphStylesheet,
      ...extraStylesheet,
    ] as cytoscape.StylesheetStyle[]);
  }, [theme, extraStylesheet]);

  return (
    <div
      ref={containerRef}
      className="absolute inset-0"
      style={{ backgroundColor: 'var(--bg-primary)' }}
    />
  );
});
