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
  const fontSerif = v('--font-serif')   || 'Source Serif Pro, Georgia, serif';
  const borderStyle: 'dashed' | 'solid' = v('--border-style') === 'dashed' ? 'dashed' : 'solid';
  const lineWeight  = Number.parseFloat(v('--line-weight')) || 1.2;
  const nodeBorderWidth = Math.max(1, lineWeight);

  // Per-cluster dot colors used to render the 6 mini-dot hint inside a
  // super-node (see design styles.css .gnode-fill + dots loop in
  // ClusterNode). Resolved here so the SVG data URI can embed a concrete
  // hex — CSS var() does not work inside inline SVG strings.
  const clusterDots: Record<string, string> = {
    character: v('--entity-char-dot') || '#2563eb',
    location:  v('--entity-loc-dot')  || '#059669',
    concept:   v('--entity-con-dot')  || '#7c3aed',
    event:     v('--entity-evt-dot')  || '#ef4444',
  };

  const clusterDotsBackground = (dotColor: string): string => {
    const dots = Array.from({ length: 6 }, (_, i) => {
      const angle = (i / 6) * Math.PI * 2;
      const cx = 50 + Math.cos(angle) * 22;
      const cy = 50 + Math.sin(angle) * 22 - 4;
      return `<circle cx="${cx.toFixed(2)}" cy="${cy.toFixed(2)}" r="2.4" fill="${dotColor}" opacity="0.7"/>`;
    }).join('');
    const svg = `<svg xmlns='http://www.w3.org/2000/svg' viewBox='0 0 100 100'>${dots}</svg>`;
    return `data:image/svg+xml;utf8,${encodeURIComponent(svg)}`;
  };

  return [
    {
      // V1 design: all entity types render as circles. Differentiation is
      // by fill/stroke color + dot, never by shape (see design styles.css
      // .gnode-fill — single <circle> renderer across all types).
      //
      // ⚠️ Known trade-off: an earlier iteration used per-type shapes
      // (ellipse / round-rectangle / diamond / pentagon) because the
      // manuscript / minimal-ink / pulp themes neutralize entity colors,
      // making types hard to tell apart by fill alone. The V1 handoff
      // committed to circle-only for visual consistency; the alternate-
      // theme differentiation gap is tracked in docs/BACKLOG.md (B-043).
      selector: 'node',
      style: {
        label: 'data(label)',
        'text-valign': 'bottom',
        'text-halign': 'center',
        'font-size': '11px',
        'font-family': fontSerif,
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
        shape: 'ellipse',
      },
    },
    {
      // Selected: thicker accent border + accent halo (matches design's
      // <circle r={r+8} className="gnode-ring"/> sibling element).
      selector: 'node:selected',
      style: {
        'border-width': 2.5,
        'border-color': accent,
        'underlay-color': accent,
        'underlay-padding': 8,
        'underlay-opacity': 0.35,
      },
    },
    {
      selector: '.dimmed',
      style: { opacity: 0.35 },
    },
    {
      selector: '.highlighted',
      style: {
        'border-width': 2.5,
        'border-color': accent,
        'underlay-color': accent,
        'underlay-padding': 8,
        'underlay-opacity': 0.35,
      },
    },
    {
      selector: 'edge.highlighted',
      style: {
        width: 2.5,
        'line-color': accent,
        opacity: 1,
      },
    },
    {
      // V1 design: edges are plain lines, no arrowheads. Labels render
      // above edge midpoint, auto-rotated.
      selector: 'edge',
      style: {
        width: Math.max(1.2, lineWeight),
        'line-color': fgMuted,
        'line-style': borderStyle,
        'line-cap': 'round',
        'curve-style': 'bezier',
        opacity: 0.7,
        label: 'data(label)',
        'font-size': '9px',
        'font-family': fontSans,
        'text-rotation': 'autorotate',
        'text-margin-y': -4,
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
        opacity: 1,
        width: 2,
      },
    },
    // Cluster super-nodes (cluster mode "類型" / "社群")
    // Dashed circle + 6 mini-dots (via background-image SVG) + 2-line
    // label (cluster name on top, "{count} 個節點" on bottom via \n +
    // text-wrap). Matches design's ClusterNode component.
    {
      selector: 'node[?cluster]',
      style: {
        shape: 'ellipse',
        'background-color': (ele: cytoscape.NodeSingular) =>
          fills[ele.data('clusterType') as string] ?? border,
        'background-opacity': 0.18,
        'background-image': ((ele: cytoscape.NodeSingular) =>
          clusterDotsBackground(
            clusterDots[ele.data('clusterType') as string] ?? accent,
          )) as cytoscape.Css.PropertyValueNode<string>,
        'background-fit': 'contain',
        'background-clip': 'node',
        'border-color': (ele: cytoscape.NodeSingular) =>
          strokes[ele.data('clusterType') as string] ?? accent,
        'border-style': 'dashed',
        'border-width': 2,
        width: 'data(size)',
        height: 'data(size)',
        label: 'data(label)',
        'text-valign': 'center',
        'text-halign': 'center',
        'text-wrap': 'wrap',
        'font-family': fontSerif,
        'font-size': '13px',
        'font-weight': 700,
        'line-height': 1.3,
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
