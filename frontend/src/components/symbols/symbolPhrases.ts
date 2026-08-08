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

/**
 * The same finding as `behaviourLine`, at the length the detail view can afford.
 *
 * Not a longer list of clauses: the row's version drops whatever does not fit,
 * and what it drops is the part a reader on the detail view came for — the base
 * rate behind the attachment, and whether the evidence can be trusted at all.
 * Both ends must still describe the same symbol, so both are built here.
 */
export function claimSentence(t: TFunction<'analysis'>, s: SymbolSignals): string {
  const parts = [t('symbol.claim.opening', { term: s.term, shape: shapeLabel(t, s) })];

  if (s.attachment) {
    parts.push(
      t('symbol.claim.attach', {
        name: s.attachment.entity.name,
        share: Math.round(s.attachment.share * 100),
        hit: s.attachment.entity.body_count,
        of: s.distribution.body,
        lift: s.attachment.lift.toFixed(1),
      }),
    );
  }
  if (s.eventCount > 0) parts.push(t('symbol.claim.events', { count: s.eventCount }));

  // The last clause is always about the evidence, because it governs how much of
  // the preceding sentence the reader should believe. Three cases, not two: a
  // symbol with no body occurrences at all is not "clean", and calling it that
  // produced 「僅出現在非正文；全部出現都在正文與後記」 — a sentence contradicting
  // itself across a semicolon.
  if (s.distribution.front > 0) {
    parts.push(
      t('symbol.claim.polluted', {
        count: s.distribution.front,
        total: s.frequency,
      }),
    );
  } else if (s.distribution.body > 0) {
    parts.push(t('symbol.claim.clean'));
  } else {
    parts.push(t('symbol.claim.noBody'));
  }
  return parts.join('') + t('symbol.claim.fullStop');
}
