/**
 * Behavioural signals for symbolic imagery — the layer the page ranks on.
 *
 * The page used to order symbols by frequency, which on real books has almost no
 * discriminating power: of 名字的潮汐's 29 symbols, 18 occur exactly once and the
 * top one (海, 13) owes 5 of those to the colophon and title page. A reader facing
 * a frequency-sorted list has nothing to go on, so nobody clicks anything —
 * measured interpretation coverage was 1 of 29.
 *
 * So each symbol is described by what it *does*: who it clings to, where it
 * concentrates, which symbols it allies with, when it enters and leaves, and how
 * trustworthy its evidence is. All of it is computed from data already on hand —
 * no LLM, no tokens — which matters because zero interpretations is this page's
 * normal state, not its empty state.
 *
 * Everything here is pure. The weights are provisional and meant to be recalibrated
 * against real books, so they live in one exported constant rather than inline.
 */

import type {
  CoOccurringEntityRef,
  Polarity,
  SymbolOverview,
  SymbolOverviewItem,
  SymbolReviewStatus,
} from '@/api/symbols';

import type { ChapterAxis, SegmentedDistribution } from './chapterAxis';
import { buildChapterAxis, segmentDistribution } from './chapterAxis';

/**
 * Contribution of each signal to narrative load.
 *
 * Provisional. Collected here so recalibration against real books is a one-line
 * change; see the redesign's open item 06.
 */
export const SIGNAL_WEIGHTS = {
  attachment: 0.3,
  span: 0.24,
  events: 0.18,
  allies: 0.13,
  frequency: 0.15,
} as const;

/** Narrative load at or above which generating an interpretation is worth urging. */
export const LOAD_STRONG = 0.45;
/** Below this, an interpretation can only paraphrase the quotes. */
export const LOAD_WEAK = 0.2;

/** Fractions of the body used to classify where a symbol sits. */
const SHAPE_BOUNDS = {
  /** Gone by the first ~third. */
  earlyExit: 0.3,
  /** Arrives only in the last ~fifth. */
  lateEntry: 0.8,
  /** Which half it concentrates in. */
  half: 0.5,
  /** Span, plus a chapter count, that counts as running throughout. */
  throughSpan: 0.6,
  throughChapters: 4,
} as const;

export type DistributionShape =
  | 'through'
  | 'backHalf'
  | 'frontHalf'
  | 'earlyExit'
  | 'lateEntry'
  | 'scatter'
  | 'single'
  | 'none';

export type SortAxis = 'load' | 'attach' | 'span' | 'events' | 'freq' | 'first' | 'review';

/**
 * A character the symbol appears beside, and how surprising that is.
 *
 * `share` alone is not evidence of attachment. If a protagonist appears in 70% of
 * the book's paragraphs, a symbol sharing 71% of its occurrences with her is
 * exactly what chance predicts — the number looks strong and says nothing. `lift`
 * is the comparison that carries meaning, and it is what ranking uses; `share` is
 * kept because it is the figure worth showing a reader.
 */
export interface Attachment {
  entity: CoOccurringEntityRef;
  /** Fraction of the symbol's body occurrences sharing a paragraph with them. */
  share: number;
  /** Fraction of all body paragraphs mentioning them — the base rate to beat. */
  expected: number;
  /** `share / expected`. At 1 the pairing is unremarkable. */
  lift: number;
  /**
   * `bodyCount × ln(lift)`, floored at 0 — how much evidence there is, not just
   * how strong it looks.
   *
   * Lift alone cannot be ranked on. A symbol occurring once, beside a character
   * who appears in 10 of 400 paragraphs, has a lift of 40 — and one observation.
   * Scaling by the number of observations is what makes 4-of-6 beat 1-of-1, and
   * it happens to be the negative log-probability of the co-occurrences arising
   * by chance, so the ordering it produces is the ordering of statistical
   * surprise. Multiplying lift by a damping factor does not achieve this: at
   * one occurrence the share is always 1, so the lift explodes faster than any
   * bounded factor can pull it back.
   */
  score: number;
}

export interface SymbolSignals {
  readonly item: SymbolOverviewItem;
  readonly id: string;
  readonly term: string;
  readonly imageryType: string;
  readonly aliases: readonly string[];
  /** Total recorded occurrences, front and back matter included. */
  readonly frequency: number;
  readonly distribution: SegmentedDistribution;
  /** Body chapters covered end to end, as a fraction of the body. */
  readonly span: number;
  readonly shape: DistributionShape;
  /**
   * Share of occurrences that are usable evidence, 0–1.
   *
   * A multiplier on load rather than a term in it: when 5 of 13 occurrences come
   * from the colophon, no other signal should be able to compensate.
   */
  readonly trust: number;
  readonly attachment: Attachment | null;
  readonly eventCount: number;
  readonly allyCount: number;
  /** Composite ranking score, 0–1. */
  readonly load: number;
  readonly hasInterpretation: boolean;
  /** Null until an interpretation exists — the normal state for most symbols. */
  readonly reviewStatus: SymbolReviewStatus | null;
  readonly polarity: Polarity | null;
}

export interface SymbolAnalysis {
  readonly axis: ChapterAxis;
  readonly bodyParagraphCount: number;
  /** Every symbol, ranked by load. */
  readonly all: readonly SymbolSignals[];
  /** Symbols occurring more than once — what the list and batches operate on. */
  readonly main: readonly SymbolSignals[];
  /**
   * Single-occurrence symbols, unranked.
   *
   * They are not under-evidenced symbols, they are words that have not yet become
   * symbols: no distribution, no allies, no attachment, nothing to state. They are
   * also the majority, so ranking or batch-interpreting them would spend the whole
   * page and the whole budget on the part with nothing to say.
   */
  readonly tail: readonly SymbolSignals[];
}

/** Scale to 0–1 against a maximum, tolerating an all-zero field. */
function normalise(value: number, max: number): number {
  return max > 0 ? Math.min(1, value / max) : 0;
}

export function classifyShape(
  distribution: SegmentedDistribution,
  span: number,
  bodyChapterCount: number,
): DistributionShape {
  const hit = distribution.bodyChapters;
  const { firstBodyChapter: first, lastBodyChapter: last } = distribution;
  if (hit.length === 0 || first === null || last === null) return 'none';
  if (hit.length === 1) return 'single';

  if (hit.length >= SHAPE_BOUNDS.throughChapters && span >= SHAPE_BOUNDS.throughSpan) {
    return 'through';
  }
  // Leaving and arriving are different behaviours from merely sitting in a half,
  // so they are tested first.
  if (last <= bodyChapterCount * SHAPE_BOUNDS.earlyExit) return 'earlyExit';
  if (first >= bodyChapterCount * SHAPE_BOUNDS.lateEntry) return 'lateEntry';
  if (first >= bodyChapterCount * SHAPE_BOUNDS.half) return 'backHalf';
  if (last <= bodyChapterCount * SHAPE_BOUNDS.half) return 'frontHalf';
  return 'scatter';
}

/**
 * The character whose co-occurrence with this symbol is least explicable by chance.
 *
 * Picked by lift rather than by raw count, which changes the answer: a minor
 * character in six paragraphs, three of them with this symbol, is attached to it
 * far more tightly than a protagonist who is simply everywhere.
 */
export function strongestAttachment(
  item: SymbolOverviewItem,
  bodyOccurrences: number,
  bodyParagraphCount: number,
): Attachment | null {
  if (bodyOccurrences <= 0 || bodyParagraphCount <= 0) return null;

  let best: Attachment | null = null;
  for (const entity of item.co_occurring_entities ?? []) {
    if (entity.entity_type !== 'character' || entity.body_count <= 0) continue;
    // With no recorded body paragraphs there is no base rate, so the pairing is
    // unverifiable rather than infinitely surprising.
    if (entity.paragraph_count <= 0) continue;

    const share = entity.body_count / bodyOccurrences;
    const expected = entity.paragraph_count / bodyParagraphCount;
    const lift = share / expected;
    const score = Math.max(0, entity.body_count * Math.log(lift));
    if (best === null || score > best.score) {
      best = { entity, share, expected, lift, score };
    }
  }
  return best;
}

interface RawSignals {
  item: SymbolOverviewItem;
  distribution: SegmentedDistribution;
  span: number;
  shape: DistributionShape;
  trust: number;
  attachment: Attachment | null;
  eventCount: number;
  allyCount: number;
}

function rawSignalsFor(
  item: SymbolOverviewItem,
  axis: ChapterAxis,
  bodyParagraphCount: number,
): RawSignals {
  const distribution = segmentDistribution(item.chapter_distribution ?? {}, axis);
  const { firstBodyChapter: first, lastBodyChapter: last } = distribution;

  const span =
    first !== null && last !== null && axis.bodyChapterCount > 0
      ? (last - first + 1) / axis.bodyChapterCount
      : 0;

  // The afterword counts as evidence; front matter does not. A colophon's
  // 「臨海市」 is noise, but an afterword line can be the book's clearest symbolic
  // statement, and discarding both to be safe throws away the good half.
  const usable = distribution.body + distribution.back;
  const trust = item.frequency > 0 ? usable / item.frequency : 0;

  return {
    item,
    distribution,
    span,
    shape: classifyShape(distribution, span, axis.bodyChapterCount),
    trust,
    attachment: strongestAttachment(item, distribution.body, bodyParagraphCount),
    eventCount: item.co_occurring_event_count,
    allyCount: (item.co_occurring_imagery ?? []).length,
  };
}

/**
 * Compute every symbol's signals and rank them.
 *
 * Two passes, because three of the five terms are normalised against the strongest
 * value in this book rather than against a fixed ceiling. Hard-coding the ceilings
 * would silently rescale every book to the one they were read off.
 */
export function analyseSymbols(overview: SymbolOverview): SymbolAnalysis {
  const items = overview.items ?? [];
  const bodyParagraphCount = overview.body_paragraph_count;
  const axis = buildChapterAxis(
    items.map((item) => item.chapter_distribution ?? {}),
    {
      chapterRoles: overview.chapter_roles,
      bodyChapterCount: overview.body_chapter_count,
    },
  );

  const raw = items.map((item) => rawSignalsFor(item, axis, bodyParagraphCount));

  const maxAttachment = raw.reduce((m, r) => Math.max(m, r.attachment?.score ?? 0), 0);
  const maxEvents = raw.reduce((m, r) => Math.max(m, r.eventCount), 0);
  const maxAllies = raw.reduce((m, r) => Math.max(m, r.allyCount), 0);
  const maxBody = raw.reduce((m, r) => Math.max(m, r.distribution.body), 0);

  const all = raw.map((r): SymbolSignals => {
    const interpretation = r.item.interpretation ?? null;
    // Square-rooted so a symbol occurring twice as often does not read as twice as
    // loaded; frequency is the weakest of the five signals, not the loudest.
    const frequencyTerm =
      maxBody > 0 ? Math.sqrt(r.distribution.body) / Math.sqrt(maxBody) : 0;

    const load =
      r.trust *
      (SIGNAL_WEIGHTS.attachment * normalise(r.attachment?.score ?? 0, maxAttachment) +
        SIGNAL_WEIGHTS.span * Math.min(1, r.span) +
        SIGNAL_WEIGHTS.events * normalise(r.eventCount, maxEvents) +
        SIGNAL_WEIGHTS.allies * normalise(r.allyCount, maxAllies) +
        SIGNAL_WEIGHTS.frequency * frequencyTerm);

    return {
      item: r.item,
      id: r.item.id,
      term: r.item.term,
      imageryType: r.item.imagery_type,
      aliases: r.item.aliases ?? [],
      frequency: r.item.frequency,
      distribution: r.distribution,
      span: r.span,
      shape: r.shape,
      trust: r.trust,
      attachment: r.attachment,
      eventCount: r.eventCount,
      allyCount: r.allyCount,
      load,
      hasInterpretation: interpretation !== null,
      reviewStatus: interpretation?.review_status ?? null,
      polarity: interpretation?.polarity ?? null,
    };
  });

  const ranked = rankSymbols(all, 'load');
  return {
    axis,
    bodyParagraphCount,
    all: ranked,
    main: ranked.filter((s) => s.frequency > 1),
    tail: all.filter((s) => s.frequency === 1),
  };
}

const SORT_KEYS: Record<SortAxis, (s: SymbolSignals) => number> = {
  load: (s) => s.load,
  attach: (s) => s.attachment?.lift ?? 0,
  span: (s) => s.span,
  events: (s) => s.eventCount,
  // Frequency as a cross-check ranks on body occurrences, not the raw total: the
  // raw total is the number front matter inflates.
  freq: (s) => s.distribution.body,
  // Earliest first, so the axis reads left to right like the book.
  first: (s) => -(s.distribution.firstBodyChapter ?? Number.MAX_SAFE_INTEGER),
  review: (s) => (s.hasInterpretation ? 1 : 0),
};

/** Sort by one axis, breaking ties on load so the order is always total. */
export function rankSymbols(
  symbols: readonly SymbolSignals[],
  axis: SortAxis,
): SymbolSignals[] {
  const key = SORT_KEYS[axis];
  return [...symbols].sort(
    (a, b) => key(b) - key(a) || b.load - a.load || a.term.localeCompare(b.term),
  );
}

/** Whether a symbol's signals justify spending tokens on an interpretation. */
export function interpretationAdvice(
  signals: SymbolSignals,
): 'recommended' | 'available' | 'discouraged' {
  if (signals.load >= LOAD_STRONG) return 'recommended';
  if (signals.load < LOAD_WEAK) return 'discouraged';
  return 'available';
}
