import { useEffect, useRef } from 'react';
import cytoscape from 'cytoscape';
import { cytoscapeStylesheet, layoutOptions } from '@/lib/cytoscapeConfig';

interface GraphCanvasProps {
  readonly elements: cytoscape.ElementDefinition[];
  readonly onNodeTap?: (nodeId: string) => void;
  readonly selectedNodeId?: string | null;
}

export function GraphCanvas({ elements, onNodeTap, selectedNodeId }: GraphCanvasProps) {
  const containerRef = useRef<HTMLDivElement>(null);
  const cyRef = useRef<cytoscape.Core | null>(null);
  const onNodeTapRef = useRef(onNodeTap);
  onNodeTapRef.current = onNodeTap;

  const applyHighlight = (cy: cytoscape.Core, nodeId: string) => {
    const node = cy.getElementById(nodeId);
    const neighborhood = node.closedNeighborhood();
    cy.elements().addClass('dimmed').removeClass('highlighted');
    neighborhood.removeClass('dimmed').addClass('highlighted');
  };

  const clearHighlight = (cy: cytoscape.Core) => {
    cy.elements().removeClass('dimmed').removeClass('highlighted');
  };

  useEffect(() => {
    if (!containerRef.current || !elements.length) return;

    const cy = cytoscape({
      container: containerRef.current,
      elements,
      style: cytoscapeStylesheet,
      layout: layoutOptions,
      minZoom: 0.2,
      maxZoom: 3,
    });

    cy.on('tap', 'node', (evt) => {
      applyHighlight(cy, evt.target.id());
      onNodeTapRef.current?.(evt.target.id());
    });

    cy.on('tap', (evt) => {
      if (evt.target === cy) {
        clearHighlight(cy);
      }
    });

    cyRef.current = cy;

    const ro = new ResizeObserver(() => {
      cy.resize();
    });
    ro.observe(containerRef.current);

    return () => {
      ro.disconnect();
      cy.destroy();
      cyRef.current = null;
    };
  }, [elements]);

  // Highlight and center on selectedNodeId when set externally
  useEffect(() => {
    const cy = cyRef.current;
    if (!cy || !selectedNodeId) return;
    const node = cy.getElementById(selectedNodeId);
    if (!node.length) return;
    applyHighlight(cy, selectedNodeId);
    cy.animate({ center: { eles: node }, zoom: 1.4 }, { duration: 400 });
  }, [selectedNodeId]);

  return (
    <div
      ref={containerRef}
      className="absolute inset-0"
      style={{ backgroundColor: 'var(--bg-primary)' }}
    />
  );
}
