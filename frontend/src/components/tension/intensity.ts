export type IntensityBucket = 'low' | 'mid' | 'high';

/**
 * Absolute thresholds. Real LLM output clusters in 0.6–0.9, so every line in a
 * book tends to land in one band and the three-colour legend reads as one
 * colour — see `relativeIntensity` for what the redesigned views use instead.
 * Still in use by TensionTrajectoryDashboard until the chapter grid replaces it.
 */
export function intensityBucket(v: number): IntensityBucket {
  if (v < 0.4) return 'low';
  if (v < 0.75) return 'mid';
  return 'high';
}

export interface RelativeIntensity {
  /** Normalised position within this book, 0–1. */
  t: number;
  bucket: IntensityBucket;
  /** Bar width as a percentage, floored so the weakest line stays visible. */
  widthPct: number;
  /** The raw average, two decimals with the leading zero dropped ('.82'). */
  label: string;
}

/**
 * Rank each value against the book's own spread rather than a fixed scale.
 *
 * The bands only mean "strong/weak *for this book*", which is the comparison a
 * reviewer is actually making while working down the list. When every line has
 * the same average there is no spread to speak of, so they all read as the
 * book's maximum rather than collapsing to an arbitrary zero.
 */
export function relativeIntensity(values: number[]): (v: number) => RelativeIntensity {
  const min = Math.min(...values);
  const max = Math.max(...values);
  const span = max - min;

  return (v: number) => {
    const t = span > 0 ? (v - min) / span : 1;
    let bucket: IntensityBucket = 'low';
    if (t > 0.66) bucket = 'high';
    else if (t > 0.33) bucket = 'mid';
    return {
      t,
      bucket,
      widthPct: 8 + t * 92,
      label: formatIntensity(v),
    };
  };
}

/** '.82' — two decimals, no leading zero, matching the design's number style. */
export function formatIntensity(v: number): string {
  return v.toFixed(2).replace(/^0/, '');
}

export function intensityBarFill(bucket: IntensityBucket): string {
  return `var(--tension-intensity-${bucket}-bg)`;
}

export function intensityBarEdge(bucket: IntensityBucket): string {
  return `var(--tension-intensity-${bucket}-edge)`;
}

export function intensityBarFg(bucket: IntensityBucket): string {
  return `var(--tension-intensity-${bucket}-fg)`;
}
