import type { ReactNode } from 'react';

/**
 * Three weights of empty (框架 §6 · 書庫 D frame) — heaviest when nothing
 * exists yet, lightest when a filter just matched nothing:
 *
 * - `ready`        whole stage: 28px icon, serif 2xl title. The only place a
 *                  `hand` (--font-hand) subtitle is allowed.
 * - `prerequisite` half page: 26px icon, serif lg title, one explaining line.
 * - `filtered`     a small tinted box, no icon, no stage — the filter row is
 *                  still there and clearing it brings the content back.
 */
export type EmptyWeight = 'ready' | 'prerequisite' | 'filtered';

interface EmptyStateProps {
  weight: EmptyWeight;
  title: string;
  description?: string;
  /** Render `description` in the hand face (library-empty only). */
  hand?: boolean;
  icon?: ReactNode;
  action?: ReactNode;
}

export function EmptyState({ weight, title, description, hand, icon, action }: Readonly<EmptyStateProps>) {
  if (weight === 'filtered') {
    return (
      <div className="ss-state ss-state-filtered">
        <span className="ss-state-title">{title}</span>
        {action}
      </div>
    );
  }
  const stage = weight === 'ready';
  return (
    <div className={stage ? 'ss-state ss-state-stage ss-state-ready' : 'ss-state ss-state-stage ss-state-prereq'}>
      {icon && <span className="ss-state-icon">{icon}</span>}
      {stage ? <h3 className="ss-state-title">{title}</h3> : <h4 className="ss-state-title">{title}</h4>}
      {description && <p className={hand ? 'ss-state-hand' : 'ss-state-text'}>{description}</p>}
      {action}
    </div>
  );
}
