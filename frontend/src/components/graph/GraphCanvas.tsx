import { useEffect, useRef } from 'react';
import cytoscape from 'cytoscape';
import fcose from 'cytoscape-fcose';
import { cytoscapeStylesheet, layoutOptions } from '@/lib/cytoscapeConfig';
import type { AnimationMode } from './GraphToolbar';

cytoscape.use(fcose);

interface GraphCanvasProps {
  readonly elements: cytoscape.ElementDefinition[];
  readonly onNodeTap?: (nodeId: string) => void;
  readonly selectedNodeId?: string | null;
  readonly animationMode?: AnimationMode;
  readonly extraStylesheet?: cytoscape.StylesheetStyle[];
}

// eslint-disable-next-line @typescript-eslint/no-explicit-any
const layout = (cy: cytoscape.Core, opts: Record<string, any>) =>
  cy.layout({ ...layoutOptions, ...opts } as cytoscape.LayoutOptions).run();

function animateIn(collection: cytoscape.Collection, mode: AnimationMode, delayMs = 0) {
  if (mode === 'stagger') {
    const nodes = collection.nodes().toArray();
    const STEP = 80;

    // Build a map: nodeId → the ms at which it becomes visible
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

    // Each edge appears 80ms after both its endpoints are visible
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

const applyHighlight = (cy: cytoscape.Core, nodeId: string) => {
  const node = cy.getElementById(nodeId);
  const neighborhood = node.closedNeighborhood();
  cy.elements().addClass('dimmed').removeClass('highlighted');
  neighborhood.removeClass('dimmed').addClass('highlighted');
};

const clearHighlight = (cy: cytoscape.Core) => {
  cy.elements().removeClass('dimmed').removeClass('highlighted');
};

export function GraphCanvas({
  elements,
  onNodeTap,
  selectedNodeId,
  animationMode = 'fade',
  extraStylesheet = [],
}: GraphCanvasProps) {
  const containerRef = useRef<HTMLDivElement>(null);
  const cyRef = useRef<cytoscape.Core | null>(null);
  const onNodeTapRef = useRef(onNodeTap);
  onNodeTapRef.current = onNodeTap;
  const prevIdsRef = useRef<Set<string>>(new Set());
  const animModeRef = useRef(animationMode);
  animModeRef.current = animationMode;

  // Mount / unmount — create cy once
  useEffect(() => {
    if (!containerRef.current) return;

    const cy = cytoscape({
      container: containerRef.current,
      elements: [],
      style: cytoscapeStylesheet,
      minZoom: 0.2,
      maxZoom: 3,
    });

    cy.on('tap', 'node', (evt) => {
      applyHighlight(cy, evt.target.id());
      onNodeTapRef.current?.(evt.target.id());
    });

    cy.on('tap', (evt) => {
      if (evt.target === cy) clearHighlight(cy);
    });

    cyRef.current = cy;

    const ro = new ResizeObserver(() => cy.resize());
    ro.observe(containerRef.current);

    return () => {
      ro.disconnect();
      cy.destroy();
      cyRef.current = null;
      prevIdsRef.current = new Set();
    };
  }, []);

  // Incremental element updates with entrance animation
  useEffect(() => {
    const cy = cyRef.current;
    if (!cy) return;

    const prevIds = prevIdsRef.current;
    const nextIds = new Set(elements.map((e) => e.data.id as string));
    const isInitialLoad = prevIds.size === 0 && elements.length > 0;

    // Remove elements no longer present
    const toRemoveIds = [...prevIds].filter((id) => !nextIds.has(id));
    if (toRemoveIds.length > 0) {
      toRemoveIds.forEach((id) => {
        const el = cy.getElementById(id);
        if (el.length) el.remove();
      });
    }

    // Add new elements
    const toAdd = elements.filter((e) => !prevIds.has(e.data.id as string));

    if (toAdd.length > 0) {
      const added = cy.add(toAdd);

      if (isInitialLoad) {
        layout(cy, { randomize: true, animationDuration: 400 });
        animateIn(added, animModeRef.current, 450);
      } else {
        // Position new nodes near the centroid of their existing neighbours
        const newNodeIds = new Set(
          toAdd.filter((e) => e.data.source == null).map((e) => e.data.id as string),
        );
        added.nodes().forEach((node) => {
          const existing = node
            .neighborhood()
            .nodes()
            .filter((n) => !newNodeIds.has(n.id()));
          if (existing.length > 0) {
            const cx = existing.reduce((s, n) => s + (n as cytoscape.NodeSingular).position('x'), 0) / existing.length;
            const cy_pos = existing.reduce((s, n) => s + (n as cytoscape.NodeSingular).position('y'), 0) / existing.length;
            node.position({ x: cx + (Math.random() - 0.5) * 80, y: cy_pos + (Math.random() - 0.5) * 80 });
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

  // Highlight and centre on externally selected node
  useEffect(() => {
    const cy = cyRef.current;
    if (!cy || !selectedNodeId) return;
    const node = cy.getElementById(selectedNodeId);
    if (!node.length) return;
    applyHighlight(cy, selectedNodeId);
    cy.animate({ center: { eles: node }, zoom: 1.4 }, { duration: 400 });
  }, [selectedNodeId]);

  // Apply epistemic dim stylesheet on top of base styles
  useEffect(() => {
    const cy = cyRef.current;
    if (!cy) return;
    const combined = [...cytoscapeStylesheet, ...extraStylesheet];
    cy.style(combined as cytoscape.StylesheetStyle[]);
  }, [extraStylesheet]);

  return (
    <div
      ref={containerRef}
      className="absolute inset-0"
      style={{ backgroundColor: 'var(--bg-primary)' }}
    />
  );
}
