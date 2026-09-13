import { useState } from 'react';
import { Info, X } from 'lucide-react';
import { useTranslation } from 'react-i18next';
import type { ReactNode } from 'react';

import '@/styles/guidance.css';

/**
 * Page-level guidance: what this page can answer (B-065, layer 1 of 3).
 *
 * **This is the only page-level carrier.** Before it there were two — the
 * character page's `CharacterTipRibbon` and the event page's
 * `EventGuideRibbon` — which differed in their dismiss-key shape, their class
 * prefix, and whether they drew a decorative circled "i". Nothing about the
 * two pages justified the divergence; they were written weeks apart and each
 * grew its own habits. Seven other feature pages had no page-level guidance at
 * all, and the reason was not that they needed none: there was no component to
 * reach for, and no rule saying where such a thing goes.
 *
 * **The other two layers are deliberately not this component.** Block notes
 * ("how do I read this chart") sit with the block and must not be dismissible,
 * because a reader who dismissed one last month still needs it today. Field
 * provenance ("where did this number come from, what changes it") is inline
 * next to the value it explains. Folding all three into one component with a
 * `level` prop would put three different dismissal rules and three different
 * placements behind one name — see `docs/UI_SPEC.md` for the placement rules.
 *
 * Content is passed as children rather than an i18n key: guidance lives in
 * whichever namespace its page already uses, and a component that took a key
 * would have to take a namespace with it.
 *
 * @param surface Identifies what is being dismissed, not which page shows it.
 *   The event page has two (`event-overview`, `event-detail`) because they
 *   explain different things and closing one must not hide the other.
 */
export function GuidanceRibbon({
  surface,
  children,
}: Readonly<{ surface: string; children: ReactNode }>) {
  const { t } = useTranslation('common');
  const key = `storysphere:guidance-dismissed:${surface}`;
  const [dismissed, setDismissed] = useState(
    () => typeof window !== 'undefined' && localStorage.getItem(key) === '1',
  );

  if (dismissed) return null;

  const handleDismiss = () => {
    // Safari private browsing reports a zero quota, so setItem throws. The
    // dismissal is a nicety; losing it must not take the component down.
    try {
      localStorage.setItem(key, '1');
    } catch {
      /* ignore quota / disabled storage */
    }
    setDismissed(true);
  };

  return (
    <div className="sg-ribbon">
      {/* The glyph, not the accent edge, is what marks this as guidance. The
          ink theme flattens every semantic colour to the same near-black —
          `tokens.css` states the rule outright: 狀態由 icon 字形承載 — so an
          edge-only design (which `EventGuideRibbon` was) reads there as
          nothing more than a slightly thicker border. Checked in both themes. */}
      <Info className="sg-ribbon-icon" size={15} aria-hidden="true" />
      <div className="sg-ribbon-body">{children}</div>
      <button
        type="button"
        className="sg-ribbon-close"
        onClick={handleDismiss}
        aria-label={t('guidance.dismiss')}
      >
        <X size={14} />
      </button>
    </div>
  );
}
