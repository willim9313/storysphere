import { useEffect } from 'react';
import { X } from 'lucide-react';
import { useTranslation } from 'react-i18next';
import type { ReactNode } from 'react';

import { dismissGuidance, registerSurface, useGuidanceDismissed } from './guidanceStore';

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
 * Looks come from the kit's `.ss-guidance` (the info glyph is its `::before`
 * mask, so no icon markup here). Dismiss state lives in `guidanceStore.ts`; the
 * ribbon registers its surface while mounted so the book title bar can offer a
 * reopen button once it has been dismissed (DS v3 batch 5, 5-1).
 *
 * @param float For canvas pages with no document flow to sit in — the
 *   knowledge graph is a full-bleed viewport whose overlays are absolutely
 *   positioned. Anchors the ribbon in the one free corner instead.
 */
export function GuidanceRibbon({
  surface,
  children,
  float = false,
}: Readonly<{ surface: string; children: ReactNode; float?: boolean }>) {
  const { t } = useTranslation('common');
  const dismissed = useGuidanceDismissed(surface);

  // Registered whether shown or dismissed: the title bar needs to know which
  // surface is on screen precisely when the ribbon has gone.
  useEffect(() => registerSurface(surface), [surface]);

  if (dismissed) return null;

  return (
    <div className={float ? 'ss-guidance is-float' : 'ss-guidance'}>
      <p>{children}</p>
      <button
        type="button"
        className="gd-close"
        onClick={() => dismissGuidance(surface)}
        aria-label={t('guidance.dismiss')}
      >
        <X size={14} />
      </button>
    </div>
  );
}
