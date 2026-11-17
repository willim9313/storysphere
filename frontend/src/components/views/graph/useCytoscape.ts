import { useEffect, useRef, type RefObject } from 'react';
import cytoscape, { type Core, type ElementDefinition, type LayoutOptions, type StylesheetJson } from 'cytoscape';
import { useThemeName } from './themeTokens';

interface Options {
  elements: ElementDefinition[];
  layout: LayoutOptions;
  /** 每次主題切換都重新呼叫，在裡面讀 token。 */
  buildStyle: () => StylesheetJson;
  onNodeTap: (nodeId: string) => void;
  onBackgroundTap: () => void;
}

/** 建立 cytoscape、主題切換時重套樣式、卸載時 destroy。 */
export function useCytoscape(containerRef: RefObject<HTMLDivElement | null>, options: Options) {
  const { elements, layout, buildStyle, onNodeTap, onBackgroundTap } = options;
  const cyRef = useRef<Core | null>(null);
  const handlers = useRef({ onNodeTap, onBackgroundTap });
  const theme = useThemeName();

  useEffect(() => {
    handlers.current = { onNodeTap, onBackgroundTap };
  });

  useEffect(() => {
    const container = containerRef.current;
    if (!container || elements.length === 0) return;
    const cy = cytoscape({
      container,
      elements,
      style: buildStyle(),
      layout,
      minZoom: 0.02,
      maxZoom: 3,
      wheelSensitivity: 0.3,
      boxSelectionEnabled: false,
    });
    cy.on('tap', 'node', (event) => {
      if (!event.target.hasClass('decor')) handlers.current.onNodeTap(event.target.id());
    });
    cy.on('tap', (event) => {
      if (event.target === cy) handlers.current.onBackgroundTap();
    });
    cyRef.current = cy;
    return () => {
      cy.destroy();
      cyRef.current = null;
    };
    // buildStyle 只在主題切換時重套（下一個 effect），不重建圖。
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [containerRef, elements, layout]);

  useEffect(() => {
    cyRef.current?.style(buildStyle());
  }, [theme, buildStyle]);

  return cyRef;
}
