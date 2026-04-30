import type cytoscape from 'cytoscape';

const v = (name: string) =>
  getComputedStyle(document.documentElement).getPropertyValue(name).trim();

export function getCytoscapeStylesheet(): cytoscape.StylesheetStyle[] {
  const fills: Record<string, string> = {
    character: v('--graph-char-fill') || '#dbeafe',
    location:  v('--graph-loc-fill')  || '#dcfce7',
    concept:   v('--graph-con-fill')  || '#ede9fe',
    event:     v('--graph-evt-fill')  || '#fee2e2',
  };
  const strokes: Record<string, string> = {
    character: v('--graph-char-stroke') || '#3b82f6',
    location:  v('--graph-loc-stroke')  || '#22c55e',
    concept:   v('--graph-con-stroke')  || '#8b5cf6',
    event:     v('--graph-evt-stroke')  || '#ef4444',
  };
  const labels: Record<string, string> = {
    character: v('--graph-char-label') || '#1e3a8a',
    location:  v('--graph-loc-label')  || '#064e3b',
    concept:   v('--graph-con-label')  || '#4c1d95',
    event:     v('--graph-evt-label')  || '#991b1b',
  };
  const accent    = v('--accent')       || '#8b5e3c';
  const border    = v('--border')       || '#e0d4c4';
  const fgPrimary = v('--fg-primary')   || '#1c1814';
  const fgMuted   = v('--fg-muted')     || '#8a7a68';
  const fgSecondary = v('--fg-secondary') || '#5a4f42';
  const fontSans  = v('--font-sans')    || 'DM Sans, system-ui, sans-serif';

  return [
    {
      selector: 'node',
      style: {
        label: 'data(label)',
        'text-valign': 'bottom',
        'text-halign': 'center',
        'font-size': '10px',
        'font-family': fontSans,
        color: (ele: cytoscape.NodeSingular) =>
          labels[ele.data('entityType') as string] ?? fgPrimary,
        'text-margin-y': 4,
        'background-color': (ele: cytoscape.NodeSingular) =>
          fills[ele.data('entityType') as string] ?? '#e5e7eb',
        width: 'data(size)',
        height: 'data(size)',
        'border-width': 2,
        'border-color': (ele: cytoscape.NodeSingular) =>
          strokes[ele.data('entityType') as string] ?? border,
        shape: ((ele: cytoscape.NodeSingular) => {
          const shapes: Record<string, cytoscape.Css.NodeShape> = {
            character: 'ellipse',
            location:  'round-rectangle',
            concept:   'diamond',
            event:     'pentagon',
          };
          return shapes[ele.data('entityType') as string] ?? 'ellipse';
        }) as cytoscape.Css.PropertyValueNode<cytoscape.Css.NodeShape>,
      },
    },
    {
      selector: 'node:selected',
      style: { 'border-width': 3, 'border-color': accent },
    },
    {
      selector: '.dimmed',
      style: { opacity: 0.15 },
    },
    {
      selector: '.highlighted',
      style: { 'border-width': 3, 'border-color': accent },
    },
    {
      selector: 'edge.highlighted',
      style: {
        width: 2.5,
        'line-color': accent,
        'target-arrow-color': accent,
        opacity: 1,
      },
    },
    {
      selector: 'edge',
      style: {
        width: 1,
        'line-color': border,
        'curve-style': 'bezier',
        'target-arrow-shape': 'triangle',
        'target-arrow-color': border,
        'arrow-scale': 0.8,
        label: 'data(label)',
        'font-size': '8px',
        'text-rotation': 'autorotate',
        color: fgMuted,
      },
    },
    {
      selector: 'edge[?inferred]',
      style: {
        'line-style': 'dashed',
        'line-dash-pattern': [6, 3],
        'line-color': accent,
        'target-arrow-color': accent,
        width: 1.5,
        opacity: 0.7,
        color: fgSecondary,
      },
    },
    {
      selector: 'edge[?inferred].highlighted',
      style: {
        'line-color': accent,
        'target-arrow-color': accent,
        opacity: 1,
        width: 2,
      },
    },
  ];
}

export const layoutOptions = {
  name: 'fcose',
  animate: true,
  animationDuration: 500,
  quality: 'default',
  nodeSeparation: 60,
  idealEdgeLength: (edge: cytoscape.EdgeSingular) =>
    edge.data('edgeLength') ?? 140,
  nodeRepulsion: () => 45000,
  gravity: 0.12,
  padding: 40,
} as cytoscape.LayoutOptions;
