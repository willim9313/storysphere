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
      onNodeTap?.(evt.target.id());
    });

    cyRef.current = cy;

    return () => {
      cy.destroy();
      cyRef.current = null;
    };
  }, [elements, onNodeTap]);

  return (
    <div
      ref={containerRef}
      className="w-full h-full min-h-[500px] rounded-lg"
      style={{
        backgroundColor: 'var(--color-surface)',
        border: '1px solid var(--color-border)',
      }}
    />
  );
}
