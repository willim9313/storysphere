export type IntensityBucket = 'low' | 'mid' | 'high';

export function intensityBucket(v: number): IntensityBucket {
  if (v < 0.4) return 'low';
  if (v < 0.75) return 'mid';
  return 'high';
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
