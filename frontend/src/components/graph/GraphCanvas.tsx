import { useEffect, useRef } from 'react';
import cytoscape from 'cytoscape';
import { cytoscapeStylesheet, layoutOptions } from '@/lib/cytoscapeConfig';

interface GraphCanvasProps {
  elements: cytoscape.ElementDefinition[];
  onNodeTap?: (nodeId: string) => void;
}

export function GraphCanvas({ elements, onNodeTap }: GraphCanvasProps) {
  const containerRef = useRef<HTMLDivElement>(null);
  const cyRef = useRef<cytoscape.Core | null>(null);
  const onNodeTapRef = useRef(onNodeTap);
  onNodeTapRef.current = onNodeTap;

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

    const applyHighlight = (nodeId: string) => {
      const node = cy.getElementById(nodeId);
      const neighborhood = node.closedNeighborhood();
      cy.elements().addClass('dimmed').removeClass('highlighted');
      neighborhood.removeClass('dimmed').addClass('highlighted');
    };

    const clearHighlight = () => {
      cy.elements().removeClass('dimmed').removeClass('highlighted');
    };

    cy.on('tap', 'node', (evt) => {
      applyHighlight(evt.target.id());
      onNodeTapRef.current?.(evt.target.id());
    });

    cy.on('tap', (evt) => {
      if (evt.target === cy) {
        clearHighlight();
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

  return (
    <div
      ref={containerRef}
      className="absolute inset-0"
      style={{ backgroundColor: 'var(--bg-primary)' }}
    />
  );
}
