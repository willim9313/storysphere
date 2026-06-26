import {
  FileText,
  Users,
  Activity,
  Sparkles,
  GitBranch,
  CalendarClock,
  Loader,
  type LucideIcon,
} from 'lucide-react';

export interface KindMeta {
  Icon: LucideIcon;
  /** entity color token prefix, e.g. 'char' → var(--entity-char-*). */
  color: string;
  label: string;
}

/**
 * kind → icon / entity-color / label. Colors reuse the existing entity
 * six-colour palette, which auto-degrades to grayscale under the B&W
 * themes (see tokens.css) — so the component needs no per-theme branching.
 */
export const TASK_KINDS: Record<string, KindMeta> = {
  ingestion: { Icon: FileText, color: 'org', label: '匯入' },
  character: { Icon: Users, color: 'char', label: '角色' },
  tension: { Icon: Activity, color: 'con', label: '張力' },
  symbol: { Icon: Sparkles, color: 'obj', label: '符號' },
  narrative: { Icon: GitBranch, color: 'loc', label: '敘事' },
  event: { Icon: CalendarClock, color: 'evt', label: '事件' },
};

/** Unknown / absent kind: neutral box, generic label, not navigable. */
export const FALLBACK_KIND: KindMeta = {
  Icon: Loader,
  color: '',
  label: '任務',
};

export function kindMeta(kind: string | null | undefined): KindMeta {
  return (kind && TASK_KINDS[kind]) || FALLBACK_KIND;
}
