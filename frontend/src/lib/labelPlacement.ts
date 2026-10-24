/**
 * Greedy label placement for the knowledge-graph canvas (UI_SPEC §3.6).
 *
 * Labels are offered in priority order; one is kept only when its box clears
 * every label already kept, every other node's body, and every screen
 * obstacle (floating overlays such as the guidance ribbon or lens card). So
 * the canvas shows as many names as fit without any two touching, instead of
 * a fixed size / zoom threshold that hid most names on a sparse graph and
 * still crowded a dense one.
 *
 * All coordinates are rendered (screen) pixels relative to the canvas.
 */

export interface Box {
  x1: number;
  x2: number;
  y1: number;
  y2: number;
}

export interface LabelCandidate {
  id: string;
  /** Node centre. */
  x: number;
  y: number;
  /** Rendered node half-size; the label hangs below the node. */
  halfWidth: number;
  halfHeight: number;
  /** Estimated rendered label width. */
  labelWidth: number;
  /** Higher is placed first. */
  priority: number;
}

/** Below this rendered font size a name is noise, not text — nothing is labelled. */
export const MIN_LABEL_PX = 8;

const overlaps = (a: Box, b: Box) => a.x1 < b.x2 && b.x1 < a.x2 && a.y1 < b.y2 && b.y1 < a.y2;

export function labelBox(c: LabelCandidate, fontPx: number, gap: number): Box {
  const top = c.y + c.halfHeight + gap;
  return { x1: c.x - c.labelWidth / 2, x2: c.x + c.labelWidth / 2, y1: top, y2: top + fontPx * 1.25 };
}

export function placeLabels(
  candidates: readonly LabelCandidate[],
  fontPx: number,
  obstacles: readonly Box[] = [],
  gap = 0,
): Set<string> {
  const shown = new Set<string>();
  if (fontPx < MIN_LABEL_PX) return shown;

  const bodies = candidates.map((c) => ({
    id: c.id,
    box: { x1: c.x - c.halfWidth, x2: c.x + c.halfWidth, y1: c.y - c.halfHeight, y2: c.y + c.halfHeight },
  }));
  const placed: Box[] = [];
  const order = [...candidates].sort((a, b) => b.priority - a.priority || a.id.localeCompare(b.id));
  for (const c of order) {
    const box = labelBox(c, fontPx, gap);
    if (placed.some((p) => overlaps(p, box))) continue;
    if (obstacles.some((o) => overlaps(o, box))) continue;
    if (bodies.some((b) => b.id !== c.id && overlaps(b.box, box))) continue;
    placed.push(box);
    shown.add(c.id);
  }
  return shown;
}
