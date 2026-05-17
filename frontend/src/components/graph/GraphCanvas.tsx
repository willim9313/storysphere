import { forwardRef, useEffect, useImperativeHandle, useRef } from 'react';
import cytoscape from 'cytoscape';
import fcose from 'cytoscape-fcose';
import { getCytoscapeStylesheet, layoutOptions } from '@/lib/cytoscapeConfig';
import { useTheme } from '@/contexts/ThemeContext';
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

function animateIn(collection: cytoscape.Collection, mode: AnimationMode, delayMs = 0) {
  if (mode === 'stagger') {
    const nodes = collection.nodes().toArray();
    const STEP = 80;

    const nodeRevealAt = new Map<string, number>();
    nodes.forEach((node, i) => {
      const t = delayMs + i * STEP;
      nodeRevealAt.set(node.id(), t);
      node.style({ opacity: 0 });
      setTimeout(
        () => node.animate({ style: { opacity: 1 }, duration: 300, easing: 'ease-in-out' }),
        t,
      );
    });

    collection.edges().forEach((edge) => {
      const srcT = nodeRevealAt.get(edge.source().id()) ?? delayMs;
      const tgtT = nodeRevealAt.get(edge.target().id()) ?? delayMs;
      const edgeT = Math.max(srcT, tgtT) + 80;
      edge.style({ opacity: 0 });
      setTimeout(
        () => edge.animate({ style: { opacity: 1 }, duration: 400 }),
        edgeT,
      );
    });
  } else {
    collection.style({ opacity: 0 });
    setTimeout(
      () => collection.animate({ style: { opacity: 1 }, duration: 450, easing: 'ease-in-out' }),
      delayMs,
    );
  }
}

const applyHighlight = (cy: cytoscape.Core, nodeIds: string[]) => {
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
};

const clearHighlight = (cy: cytoscape.Core) => {
  cy.elements().removeClass('dimmed').removeClass('highlighted');
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
      style: getCytoscapeStylesheet(),
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

    cy.on('viewport render', emitViewport);

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
    };
  }, []);

  // Incremental element updates
  useEffect(() => {
    const cy = cyRef.current;
    if (!cy) return;

    const prevIds = prevIdsRef.current;
    const nextIds = new Set(elements.map((e) => e.data.id as string));
    const isInitialLoad = prevIds.size === 0 && elements.length > 0;

    const toRemoveIds = [...prevIds].filter((id) => !nextIds.has(id));
    if (toRemoveIds.length > 0) {
      toRemoveIds.forEach((id) => {
        const el = cy.getElementById(id);
        if (el.length) el.remove();
      });
    }

    const toAdd = elements.filter((e) => !prevIds.has(e.data.id as string));

    if (toAdd.length > 0) {
      const added = cy.add(toAdd);

      if (isInitialLoad) {
        layout(cy, { randomize: true, animationDuration: 400 });
        animateIn(added, animModeRef.current, 450);
      } else {
        const newNodeIds = new Set(
          toAdd.filter((e) => e.data.source == null).map((e) => e.data.id as string),
        );
        added.nodes().forEach((node) => {
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
    applyHighlight(cy, [selectedNodeId]);
    cy.animate({ center: { eles: node }, zoom: 1.4 }, { duration: 400 });
  }, [selectedNodeId]);

  // Multi-select highlight (Scenario E)
  useEffect(() => {
    const cy = cyRef.current;
    if (!cy) return;
    if (selectedNodeIds && selectedNodeIds.length > 0) {
      applyHighlight(cy, selectedNodeIds);
    } else if (!selectedNodeId) {
      clearHighlight(cy);
    }
  }, [selectedNodeIds, selectedNodeId]);

  // Re-apply stylesheet on theme / overlay change
  useEffect(() => {
    const cy = cyRef.current;
    if (!cy) return;
    cy.style([...getCytoscapeStylesheet(), ...extraStylesheet] as cytoscape.StylesheetStyle[]);
  }, [theme, extraStylesheet]);

  return (
    <div
      ref={containerRef}
      className="absolute inset-0"
      style={{ backgroundColor: 'var(--bg-primary)' }}
    />
  );
});
