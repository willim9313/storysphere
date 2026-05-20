import type { NarrativeMode } from '@/api/types';

interface NarrativeIconProps {
  mode: NarrativeMode;
  size?: number;
  stroke?: number;
}

// Self-drawn lucide-style icons for narrative-time displacement.
// The original implementation borrowed media-player transport glyphs
// (⏪ ⏩ ⏸) for flashback/flashforward/parallel, which read as "video
// controls" rather than as narrative-time relationships. Each icon
// below pictures the temporal relationship the mode names.
export function NarrativeIcon({ mode, size = 14, stroke = 1.75 }: NarrativeIconProps) {
  const common = {
    width: size,
    height: size,
    viewBox: '0 0 20 20',
    fill: 'none' as const,
    stroke: 'currentColor',
    strokeWidth: stroke,
    strokeLinecap: 'round' as const,
    strokeLinejoin: 'round' as const,
    'aria-hidden': true,
  };

  switch (mode) {
    case 'present':
      // Timeline → current position dot → forward arrow.
      return (
        <svg {...common}>
          <line x1="2.5" y1="10" x2="17.5" y2="10" />
          <path d="M14.5 7 L17.5 10 L14.5 13" />
          <circle cx="8.5" cy="10" r="2.2" fill="currentColor" stroke="none" />
        </svg>
      );
    case 'flashback':
      // Timeline (bottom) with arc curving back from now → earlier.
      return (
        <svg {...common}>
          <line x1="2.5" y1="14" x2="17.5" y2="14" />
          <path d="M14 14 C 14 5, 6 5, 6 14" />
          <path d="M3.8 12 L6 14 L8.2 12" />
        </svg>
      );
    case 'flashforward':
      // Mirror of flashback — arc projecting forward.
      return (
        <svg {...common}>
          <line x1="2.5" y1="14" x2="17.5" y2="14" />
          <path d="M6 14 C 6 5, 14 5, 14 14" />
          <path d="M11.8 12 L14 14 L16.2 12" />
        </svg>
      );
    case 'parallel':
      // Two offset horizontal tracks running side-by-side.
      return (
        <svg {...common}>
          <line x1="2.5" y1="7" x2="14" y2="7" />
          <line x1="6" y1="13" x2="17.5" y2="13" />
        </svg>
      );
    case 'unknown':
    default:
      return (
        <svg {...common}>
          <circle cx="10" cy="10" r="6.5" strokeDasharray="2 2" />
          <path d="M8.4 8.4 a1.6 1.6 0 1 1 2.4 1.4 c-0.6 0.35 -0.8 0.7 -0.8 1.4" />
          <circle cx="10" cy="13.8" r="0.5" fill="currentColor" stroke="none" />
        </svg>
      );
  }
}
