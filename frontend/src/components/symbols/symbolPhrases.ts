/**
 * How a symbol's signals are put into words.
 *
 * Separate from `symbolSignals.ts` so that module stays free of i18n and remains
 * a pure function of the payload; separate from the components so the list and
 * the overview describe the same symbol the same way. A reader who sees
 * 「跨 7 章貫穿」 on a card and something different in the sidebar has to work out
 * whether they are looking at the same finding.
 */

import type { TFunction } from 'i18next';

import type { SymbolSignals } from './symbolSignals';

/** Where the symbol sits in the body, e.g. 「集中在後半段（6–10 章）」. */
export function shapeLabel(t: TFunction<'analysis'>, s: SymbolSignals): string {
  const { firstBodyChapter: first, lastBodyChapter: last, bodyChapters } = s.distribution;
  return t(`symbol.shape.${s.shape}`, {
    count: bodyChapters.length,
    first,
    last,
    chapter: first,
  });
}

/**
 * One sentence describing what a symbol does, from the strongest signals it has.
 *
 * Capped at three clauses: the row has one line, and a fourth clause would push
 * the shape — the part that answers "what does it do" — out of view.
 */
export function behaviourLine(t: TFunction<'analysis'>, s: SymbolSignals): string {
  const parts = [shapeLabel(t, s)];
  if (s.attachment) {
    // Both figures: the share is what a reader recognises, the lift is what makes
    // it mean anything. 100% with a character who is in 60% of the book is a
    // weaker finding than the bare percentage suggests.
    parts.push(
      t('symbol.behaviour.attach', {
        name: s.attachment.entity.name,
        share: Math.round(s.attachment.share * 100),
        lift: s.attachment.lift.toFixed(1),
      }),
    );
  }
  // Pollution outranks event linkage: a reader deciding what to trust needs to know
  // the evidence is partly front matter before anything else about it.
  if (s.distribution.front > 0) {
    parts.push(t('symbol.behaviour.front', { count: s.distribution.front }));
  } else if (s.eventCount > 0) {
    parts.push(t('symbol.behaviour.events', { count: s.eventCount }));
  }
  return parts.slice(0, 3).join(t('symbol.behaviour.separator'));
}
