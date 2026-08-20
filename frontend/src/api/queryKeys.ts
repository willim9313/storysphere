import type { TimelineOrder } from './types';

/** Ids arrive from route params, selection state and props, so every flavour of
 *  "not yet" shows up. The key just carries whatever it is given. */
type Id = string | null | undefined;

/**
 * Query keys for the `books` and `tasks` families, in one place.
 *
 * Written after a bug that cost nothing to make and gave no feedback at all:
 * `useBook` registers `['books', bookId]`, but two invalidation sites had
 * `['book', bookId]` — singular. react-query does not warn about a key that
 * matches nothing, so those two lines were simply no-ops, and the book detail
 * never refreshed after a pipeline rerun. With 87 key literals spelled out
 * across 40 files, that was a matter of time.
 *
 * Invalidation here is prefix-based, so the array shapes matter as much as the
 * strings: `invalidate(qk.book(id))` sweeps every key below it, and
 * `qk.graph.view(...)` deliberately extends `qk.graph.all(...)` so that
 * invalidating the latter catches every rendered view of the graph.
 * `queryKeys.test.ts` pins each shape to its literal — a factory that quietly
 * changed shape would reintroduce exactly the silent-miss bug it exists to
 * prevent, only across many call sites at once instead of two.
 *
 * Not covered yet: the `narrative`, `buildOverview` and `symbols` roots sit
 * outside the books tree, so `invalidate(qk.book(id))` does not reach them.
 * That is pre-existing and left alone here; moving them would change what a
 * book-level invalidation refetches.
 */
export const qk = {
  books: ['books'] as const,
  book: (bookId: Id) => ['books', bookId] as const,

  chapters: (bookId: Id) => ['books', bookId, 'chapters'] as const,
  chunks: (bookId: Id, chapterId: Id) =>
    ['books', bookId, 'chapters', chapterId, 'chunks'] as const,

  analysis: {
    characters: (bookId: Id) =>
      ['books', bookId, 'analysis', 'characters'] as const,
    events: (bookId: Id) => ['books', bookId, 'analysis', 'events'] as const,
    factions: (bookId: Id) => ['books', bookId, 'analysis', 'factions'] as const,
    characterMetrics: (bookId: Id) =>
      ['books', bookId, 'analysis', 'character-metrics'] as const,
  },

  entity: {
    analysis: (bookId: Id, entityId: Id) =>
      ['books', bookId, 'entities', entityId, 'analysis'] as const,
    chunks: (bookId: Id, entityId: Id) =>
      ['books', bookId, 'entities', entityId, 'chunks'] as const,
    voice: (bookId: Id, entityId: Id) =>
      ['books', bookId, 'entities', entityId, 'voice'] as const,
  },

  event: {
    detail: (bookId: Id, eventId: Id) =>
      ['books', bookId, 'events', eventId] as const,
    analysis: (bookId: Id, eventId: Id) =>
      ['books', bookId, 'events', eventId, 'analysis'] as const,
    source: (bookId: Id, eventId: Id) =>
      ['books', bookId, 'events', eventId, 'source'] as const,
  },

  epistemic: {
    all: (bookId: Id) => ['books', bookId, 'epistemic-state'] as const,
    at: (
      bookId: Id,
      entityId: Id,
      upToChapter: number | null | undefined,
    ) => ['books', bookId, 'epistemic-state', entityId, upToChapter] as const,
  },

  factionsPanel: (bookId: Id) => ['books', bookId, 'factions', 'panel'] as const,

  graph: {
    all: (bookId: Id) => ['books', bookId, 'graph'] as const,
    /** One rendered view. Extends `all`, so invalidating `all` sweeps every view. */
    view: (
      bookId: Id,
      mode: string | null,
      position: number | null,
      includeInferred: boolean,
    ) => ['books', bookId, 'graph', mode, position, includeInferred] as const,
  },

  inferred: {
    all: (bookId: Id) => ['books', bookId, 'inferred-relations'] as const,
    list: (bookId: Id) => ['books', bookId, 'inferred-relations', 'all'] as const,
    pending: (bookId: Id) =>
      ['books', bookId, 'inferred-relations', 'pending'] as const,
  },

  symbols: {
    list: (bookId: Id) => ['books', bookId, 'symbols'] as const,
    timeline: (bookId: Id, imageryId: Id) =>
      ['books', bookId, 'symbols', imageryId, 'timeline'] as const,
    interpretation: (bookId: Id, imageryId: Id) =>
      ['books', bookId, 'symbols', imageryId, 'interpretation'] as const,
    /** Pre-existing outlier: rooted at `symbols`, not under `books`. */
    overview: (bookId: Id) => ['symbols', bookId, 'overview'] as const,
  },

  tension: {
    lines: (bookId: Id) => ['books', bookId, 'tension', 'lines'] as const,
    teus: (bookId: Id) => ['books', bookId, 'tension', 'teus'] as const,
    theme: (bookId: Id) => ['books', bookId, 'tension', 'theme'] as const,
  },

  timeline: {
    all: (bookId: Id) => ['books', bookId, 'timeline'] as const,
    /** `fetchTimeline` defaults to 'narrative', so the narrative page and
     *  useTimeline(id, 'narrative') share this entry on purpose. */
    order: (bookId: Id, order: TimelineOrder) =>
      ['books', bookId, 'timeline', order] as const,
    config: (bookId: Id) => ['books', bookId, 'timeline-config'] as const,
  },

  tasks: {
    all: ['tasks'] as const,
    list: () => ['tasks', 'list'] as const,
    one: (taskId: Id) => ['tasks', taskId] as const,
  },
} as const;
