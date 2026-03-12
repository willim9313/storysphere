import type cytoscape from 'cytoscape';

// eslint-disable-next-line @typescript-eslint/no-explicit-any
export const cytoscapeStylesheet: any[] = [
  {
    selector: 'node',
    style: {
      label: 'data(label)',
      'text-valign': 'bottom',
      'text-halign': 'center',
      'font-size': '10px',
      'font-family': 'DM Sans, system-ui, sans-serif',
      color: 'var(--color-text)',
      'text-margin-y': 4,
      'background-color': 'data(color)',
      width: 'data(size)',
      height: 'data(size)',
      'border-width': 2,
      'border-color': 'var(--color-border)',
    },
  },
  {
    selector: 'node:selected',
    style: {
      'border-width': 3,
      'border-color': 'var(--color-accent)',
    },
  },
  {
    selector: 'edge',
    style: {
      width: 'data(weight)',
      'line-color': 'var(--color-border)',
      'curve-style': 'bezier',
      'target-arrow-shape': 'triangle',
      'target-arrow-color': 'var(--color-border)',
      'arrow-scale': 0.8,
      label: 'data(label)',
      'font-size': '8px',
      'text-rotation': 'autorotate',
      color: 'var(--color-text-muted)',
    },
  },
  {
    selector: 'edge[?bidirectional]',
    style: {
      'source-arrow-shape': 'triangle',
      'source-arrow-color': 'var(--color-border)',
    },
  },
];

export const entityTypeColors: Record<string, string> = {
  character: 'var(--color-entity-character)',
  location: 'var(--color-entity-location)',
  object: 'var(--color-entity-object)',
  event: 'var(--color-entity-event)',
  concept: 'var(--color-entity-concept)',
  organization: 'var(--color-entity-organization)',
};

export const layoutOptions: cytoscape.LayoutOptions = {
  name: 'cose',
  animate: true,
  animationDuration: 500,
  nodeRepulsion: () => 8000,
  idealEdgeLength: () => 100,
  gravity: 0.25,
  padding: 40,
} as cytoscape.LayoutOptions;
