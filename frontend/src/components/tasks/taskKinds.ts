import {
  FileText,
  Users,
  Activity,
  Sparkles,
  GitBranch,
  CalendarClock,
  Hourglass,
  type LucideIcon,
} from 'lucide-react';

export interface KindMeta {
  Icon: LucideIcon;
  /** chip background colour (CSS var). */
  bg: string;
  /** icon / dot / progress-bar accent colour (CSS var). */
  fg: string;
  /** label shown in the kind pill — the raw kind string, per the canvas. */
  label: string;
}

const k = (entity: string, label: string, Icon: LucideIcon): KindMeta => ({
  Icon,
  bg: `var(--entity-${entity}-bg)`,
  fg: `var(--entity-${entity}-dot)`,
  label,
});

/**
 * kind → icon / entity colour / label. Colours reuse the entity palette,
 * which auto-degrades to grayscale under the B&W themes (tokens.css). The
 * label is the raw kind string, matching the Claude Design canvas.
 */
export const TASK_KINDS: Record<string, KindMeta> = {
  ingestion: k('org', 'ingestion', FileText),
  character: k('char', 'character', Users),
  tension: k('con', 'tension', Activity),
  symbol: k('obj', 'symbol', Sparkles),
  narrative: k('loc', 'narrative', GitBranch),
  event: k('evt', 'event', CalendarClock),
};

/** Unknown / absent kind: neutral slate chip, generic label, not navigable. */
export const FALLBACK_KIND: KindMeta = {
  Icon: Hourglass,
  bg: 'var(--entity-other-bg)',
  fg: 'var(--entity-other-fg)',
  label: '任務',
};

export function kindMeta(kind: string | null | undefined): KindMeta {
  return (kind && TASK_KINDS[kind]) || FALLBACK_KIND;
}
