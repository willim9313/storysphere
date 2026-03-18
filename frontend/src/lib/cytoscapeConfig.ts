import type cytoscape from 'cytoscape';

const nodeColors: Record<string, { fill: string; stroke: string }> = {
  character: { fill: '#dbeafe', stroke: '#3b82f6' },
  location: { fill: '#dcfce7', stroke: '#22c55e' },
  concept: { fill: '#ede9fe', stroke: '#8b5cf6' },
  event: { fill: '#fee2e2', stroke: '#ef4444' },
};

function getNodeColor(type: string, field: 'fill' | 'stroke'): string {
  return nodeColors[type]?.[field] ?? '#e5e7eb';
}

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
      color: '#1c1814',
      'text-margin-y': 4,
      'background-color': (ele: cytoscape.NodeSingular) =>
        getNodeColor(ele.data('entityType'), 'fill'),
      width: 'data(size)',
      height: 'data(size)',
      'border-width': 2,
      'border-color': (ele: cytoscape.NodeSingular) =>
        getNodeColor(ele.data('entityType'), 'stroke'),
    },
  },
  {
    selector: 'node:selected',
    style: {
      'border-width': 3,
      'border-color': '#8b5e3c',
    },
  },
  {
    selector: '.dimmed',
    style: {
      opacity: 0.15,
    },
  },
  {
    selector: '.highlighted',
    style: {
      'border-width': 3,
      'border-color': '#8b5e3c',
    },
  },
  {
    selector: 'edge.highlighted',
    style: {
      width: 2.5,
      'line-color': '#8b5e3c',
      'target-arrow-color': '#8b5e3c',
      opacity: 1,
    },
  },
  {
    selector: 'edge',
    style: {
      width: 1,
      'line-color': '#e0d4c4',
      'curve-style': 'bezier',
      'target-arrow-shape': 'triangle',
      'target-arrow-color': '#e0d4c4',
      'arrow-scale': 0.8,
      label: 'data(label)',
      'font-size': '8px',
      'text-rotation': 'autorotate',
      color: '#8a7a68',
    },
  },
];

export const layoutOptions: cytoscape.LayoutOptions = {
  name: 'cose',
  animate: true,
  animationDuration: 500,
  nodeRepulsion: () => 8000,
  idealEdgeLength: () => 100,
  gravity: 0.25,
  padding: 40,
} as cytoscape.LayoutOptions;
