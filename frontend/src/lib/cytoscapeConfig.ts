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
  const borderStyle: 'dashed' | 'solid' = v('--border-style') === 'dashed' ? 'dashed' : 'solid';
  const lineWeight  = Number.parseFloat(v('--line-weight')) || 1;
  const nodeBorderWidth = Math.max(1, lineWeight * 2);

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
          fills[ele.data('entityType') as string] ?? border,
        width: 'data(size)',
        height: 'data(size)',
        'border-width': nodeBorderWidth,
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
        width: Math.max(1.2, lineWeight),
        'line-color': fgMuted,
        'line-style': borderStyle,
        'curve-style': 'bezier',
        'target-arrow-shape': 'triangle',
        'target-arrow-color': fgMuted,
        'arrow-scale': 0.8,
        opacity: 0.7,
        label: 'data(label)',
        'font-size': '8px',
        'text-rotation': 'autorotate',
        color: fgMuted,
      },
    },
    // V1: inferred edges distinguish via color + opacity, NOT dashed.
    // width = 1 + confidence × 1.6, opacity = 0.42 + confidence × 0.25
    {
      selector: 'edge[?inferred]',
      style: {
        'line-style': 'solid',
        'line-color': accent,
        'target-arrow-color': accent,
        width: ((ele: cytoscape.EdgeSingular) =>
          1 + (Number(ele.data('confidence')) || 0) * 1.6) as cytoscape.Css.PropertyValueEdge<number>,
        opacity: ((ele: cytoscape.EdgeSingular) =>
          0.42 + (Number(ele.data('confidence')) || 0) * 0.25) as cytoscape.Css.PropertyValueEdge<number>,
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
    // Cluster super-nodes (cluster mode "類型" / "社群")
    {
      selector: 'node[?cluster]',
      style: {
        shape: 'ellipse',
        'background-color': (ele: cytoscape.NodeSingular) =>
          fills[ele.data('clusterType') as string] ?? border,
        'background-opacity': 0.18,
        'border-color': (ele: cytoscape.NodeSingular) =>
          strokes[ele.data('clusterType') as string] ?? accent,
        'border-style': 'dashed',
        'border-width': 2,
        width: 'data(size)',
        height: 'data(size)',
        label: 'data(label)',
        'text-valign': 'center',
        'text-halign': 'center',
        'font-size': '12px',
        'font-weight': 600,
        color: (ele: cytoscape.NodeSingular) =>
          labels[ele.data('clusterType') as string] ?? fgPrimary,
      } as cytoscape.Css.Node,
    },
    // Aggregated edges between cluster super-nodes
    {
      selector: 'edge[?aggregated]',
      style: {
        width: ((ele: cytoscape.EdgeSingular) => {
          const w = Number(ele.data('weight')) || 1;
          return Math.min(1 + w * 0.6, 6);
        }) as cytoscape.Css.PropertyValueEdge<number>,
        'line-color': fgMuted,
        'target-arrow-color': fgMuted,
        opacity: 0.55,
        label: 'data(label)',
        'font-size': '9px',
        color: fgMuted,
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
