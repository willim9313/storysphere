import { useEffect, useRef, useCallback } from 'react';
import cytoscape from 'cytoscape';
import { cytoscapeStylesheet, layoutOptions } from '@/lib/cytoscapeConfig';

interface GraphCanvasProps {
  elements: cytoscape.ElementDefinition[];
  onNodeTap?: (nodeId: string) => void;
}

export function GraphCanvas({ elements, onNodeTap }: GraphCanvasProps) {
  const containerRef = useRef<HTMLDivElement>(null);
  const cyRef = useRef<cytoscape.Core | null>(null);

  const handleNodeTap = useCallback(
    (nodeId: string) => onNodeTap?.(nodeId),
    [onNodeTap],
  );

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
      handleNodeTap(evt.target.id());
    });

    cyRef.current = cy;

    return () => {
      cy.destroy();
      cyRef.current = null;
    };
  }, [elements, handleNodeTap]);

  return (
    <div
      ref={containerRef}
      className="w-full h-full min-h-[500px]"
      style={{ backgroundColor: 'var(--bg-primary)' }}
    />
  );
}

export function useGraphRef() {
  return useRef<cytoscape.Core | null>(null);
}
