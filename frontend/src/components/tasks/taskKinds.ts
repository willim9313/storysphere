import type { CSSProperties } from 'react';
import {
  FileText,
  Users,
  Activity,
  Sparkles,
  GitBranch,
  Calendar,
  Hourglass,
  type LucideIcon,
} from 'lucide-react';

export interface KindMeta {
  Icon: LucideIcon;
  /** entity palette key (`--entity-<entity>-{bg,border,fg,dot}`). */
  entity: string;
  /** label shown in the kind pill — the raw kind string, per the canvas. */
  label: string;
}

const k = (entity: string, label: string, Icon: LucideIcon): KindMeta => ({
  Icon,
  entity,
  label,
});

/**
 * kind → icon / entity colour / label, verbatim from the KINDS table in the
 * DS v3 17 決議紀錄 canvas (C 區): ingestion and tension share concept, event
 * shares character. The label is the raw kind string, per the canvas. Warm vs Ink chip treatment (filled vs
 * outlined) lives in ss-kit.css `.ss-task-*`; this only supplies the palette.
 */
export const TASK_KINDS: Record<string, KindMeta> = {
  ingestion: k('con', 'ingestion', FileText),
  character: k('char', 'character', Users),
  tension: k('con', 'tension', Activity),
  symbol: k('obj', 'symbol', Sparkles),
  narrative: k('loc', 'narrative', GitBranch),
  event: k('char', 'event', Calendar),
};

/** Unknown / absent kind: neutral slate chip, generic label, not navigable. */
export const FALLBACK_KIND: KindMeta = {
  Icon: Hourglass,
  entity: 'other',
  label: '任務',
};

/** Hands the entity palette to `.ss-task-*` as custom properties. */
export function kindVars(meta: KindMeta): CSSProperties {
  const e = `--entity-${meta.entity}`;
  // 缺 kind 時 Ink 描邊走 --border／--fg-secondary（17 決議紀錄 taskRow()），不套 other 的彩色
  const neutral = meta === FALLBACK_KIND;
  return {
    '--tk-bg': `var(${e}-bg)`,
    '--tk-border': neutral ? 'var(--border)' : `var(${e}-border)`,
    '--tk-fg': neutral ? 'var(--fg-secondary)' : `var(${e}-fg)`,
    '--tk-dot': `var(${e}-dot)`,
  } as CSSProperties;
}

export function kindMeta(kind: string | null | undefined): KindMeta {
  return (kind && TASK_KINDS[kind]) || FALLBACK_KIND;
}
