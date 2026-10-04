import type { ReactNode } from 'react';
import { useTranslation } from 'react-i18next';
import { MAIN_PANEL_WIDTH, RAIL_CHAIN, type RailPanel } from './graphPanelModel';

interface GraphRightRailProps {
  /** Which main panel this rail is showing (decides the chain's lit dot). */
  readonly panel: RailPanel;
  /** The panel's name for the 「目前顯示 · {name}」 line. */
  readonly name: string;
  /** Width already taken to the right by a secondary panel (analysis / paragraphs). */
  readonly rightOffset?: number;
  readonly children: ReactNode;
}

/**
 * Shared container for the four main right-hand panels. They all share one
 * anchor, so swapping one for another gave no cue about who replaced whom —
 * most visibly when the second node selection turned the entity panel into the
 * compare panel. The top line names the current panel and the four dots show
 * where it sits in the priority chain.
 *
 * Read-out only: clicking it switches nothing (the priority is decided by
 * selection state, see `resolveRailPanel`).
 */
export function GraphRightRail({ panel, name, rightOffset = 0, children }: GraphRightRailProps) {
  const { t } = useTranslation('graph');
  return (
    <aside className="kg-rail" style={{ width: MAIN_PANEL_WIDTH, right: rightOffset }}>
      <div className="kg-rail-chain">
        <span className="kg-rail-chain-text">{t('panel.current', { name })}</span>
        <span className="kg-rail-dots" aria-hidden="true">
          {RAIL_CHAIN.map((p) => (
            <span key={p} className={p === panel ? 'kg-rail-dot is-on' : 'kg-rail-dot'} />
          ))}
        </span>
      </div>
      {children}
    </aside>
  );
}
