import type cytoscape from 'cytoscape';

const v = (name: string) =>
  getComputedStyle(document.documentElement).getPropertyValue(name).trim();

export function getCytoscapeStylesheet(): cytoscape.StylesheetStyle[] {
  // "other" doubles as the fallback for any type outside the map — falling
  // back to --border painted org/object nodes near-black under Ink.
  const fills: Record<string, string> = {
    character:    v('--graph-char-fill')  || '#ffe8d9',
    location:     v('--graph-loc-fill')   || '#ebf0da',
    concept:      v('--graph-con-fill')   || '#f9e2ee',
    event:        v('--graph-evt-fill')   || '#ffe0de',
    organization: v('--graph-org-fill')   || '#faedd2',
    object:       v('--graph-obj-fill')   || '#ffe3dc',
    other:        v('--graph-other-fill') || '#eee9e1',
  };
  const strokes: Record<string, string> = {
    character:    v('--graph-char-stroke')  || '#b97249',
    location:     v('--graph-loc-stroke')   || '#74814d',
    concept:      v('--graph-con-stroke')   || '#9e6181',
    event:        v('--graph-evt-stroke')   || '#b35757',
    organization: v('--graph-org-stroke')   || '#aa863e',
    object:       v('--graph-obj-stroke')   || '#b56353',
    other:        v('--graph-other-stroke') || '#867867',
  };
  const labels: Record<string, string> = {
    character:    v('--graph-char-label')  || '#714229',
    location:     v('--graph-loc-label')   || '#4b552e',
    concept:      v('--graph-con-label')   || '#6c445b',
    event:        v('--graph-evt-label')   || '#803f40',
    organization: v('--graph-org-label')   || '#6a5124',
    object:       v('--graph-obj-label')   || '#794037',
    other:        v('--graph-other-label') || '#5f564c',
  };
  const accent    = v('--accent')       || '#b05a34';
  const fgPrimary = v('--fg-primary')   || '#2a2620';
  const fgMuted   = v('--fg-muted')     || '#938876';
  const fgSecondary = v('--fg-secondary') || '#5f5648';
  const warning   = v('--color-warning') || '#ad7519';
  const error     = v('--color-error')   || '#a8482c';
  // cytoscape's font-family regex (^([\w- "]+(?:\s*,\s*[\w- "]+)*)$) rejects
  // single quotes, so a token like `'Spectral', 'Noto Serif TC', …`
  // is flagged invalid and the label silently falls back to the default font.
  // Strip quotes here (spaces in family names are allowed) without touching
  // the shared --font-* tokens.
  const cyFont = (s: string) => s.replace(/['"]/g, '');
  const fontSans  = cyFont(v('--font-sans')  || 'DM Sans, system-ui, sans-serif');
  const fontSerif = cyFont(v('--font-serif') || 'Spectral, Georgia, serif');
  const borderStyle: 'dashed' | 'solid' = v('--border-style') === 'dashed' ? 'dashed' : 'solid';
  const lineWeight  = Number.parseFloat(v('--line-weight')) || 1.2;
  const nodeBorderWidth = Math.max(1, lineWeight);

  // Per-cluster dot colors used to render the 6 mini-dot hint inside a
  // super-node (see design styles.css .gnode-fill + dots loop in
  // ClusterNode). Resolved here so the SVG data URI can embed a concrete
  // hex — CSS var() does not work inside inline SVG strings.
  const clusterDots: Record<string, string> = {
    character: v('--entity-char-dot') || '#b97249',
    location:  v('--entity-loc-dot')  || '#74814d',
    concept:   v('--entity-con-dot')  || '#9e6181',
    event:     v('--entity-evt-dot')  || '#b35757',
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
      // Design-system v2 (ink-on-paper): both themes share the warm entity
      // hue arc — the --graph-* tokens are not overridden per theme — so
      // node types stay color-distinguishable in Warm and Ink alike
      // (formerly B-047; the old B&W themes that neutralized entity colors
      // are gone).
      selector: 'node',
      style: {
        label: 'data(label)',
        'text-valign': 'bottom',
        'text-halign': 'center',
        'font-size': '11px',
        // Obsidian-style: hide node labels when zoomed out (effective font
        // < 8px) so the full graph reads as a clean star map, and fade them
        // in as the user zooms toward a region.
        'min-zoomed-font-size': 8,
        'font-family': fontSerif,
        color: (ele: cytoscape.NodeSingular) =>
          labels[ele.data('entityType') as string] ?? fgPrimary,
        'text-margin-y': 4,
        'background-color': (ele: cytoscape.NodeSingular) =>
          fills[ele.data('entityType') as string] ?? fills.other,
        width: 'data(size)',
        height: 'data(size)',
        'border-width': nodeBorderWidth,
        'border-color': (ele: cytoscape.NodeSingular) =>
          strokes[ele.data('entityType') as string] ?? strokes.other,
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
        'underlay-padding': 4,
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
        'underlay-padding': 4,
        'underlay-opacity': 0.35,
      },
    },
    {
      selector: 'edge.highlighted',
      style: {
        width: 2.5,
        'line-color': accent,
        opacity: 1,
        // Reveal the relationship label for a selected node's connections.
        'text-opacity': 1,
      },
    },
    {
      // Reveal relationship label on hover (see GraphCanvas mouseover/out).
      selector: 'edge.label-visible',
      style: { 'text-opacity': 1 },
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
        // Relationship labels are the densest source of the "hairball" look;
        // keep them hidden by default and reveal only on hover / selection
        // (see edge.label-visible and edge.highlighted).
        'text-opacity': 0,
      },
    },
    // Inferred edges: warning color + dashed line to read as "speculative,
    // not a confirmed relation" (KG redesign brief §4 / canvas legend).
    // width = 1 + confidence × 1.6, opacity = 0.42 + confidence × 0.25
    {
      selector: 'edge[?inferred]',
      style: {
        'line-style': 'dashed',
        'line-color': warning,
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
        'line-color': warning,
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
          fills[ele.data('clusterType') as string] ?? fills.other,
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
        // Cluster mode has only a handful of super-nodes, so keep the
        // aggregated relationship counts visible (overrides the base
        // edge's text-opacity: 0).
        'text-opacity': 1,
      },
    },
    // Faction rivalry edges (community mode) — red dashed line.
    // Cytoscape only accepts hex/rgb, not var() strings — read the token
    // via getComputedStyle like every other color in this stylesheet
    // (this raw var() string was the source of the console warning spam).
    {
      selector: 'edge[?isRivalry]',
      style: {
        'line-color': error,
        'target-arrow-color': error,
        'line-style': 'dashed',
        opacity: 0.7,
        color: error,
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
