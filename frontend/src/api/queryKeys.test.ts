import { describe, expect, it } from 'vitest';
import { qk } from './queryKeys';

/**
 * Every key pinned to the literal it replaced.
 *
 * These look tautological, and that is the point. Collapsing 87 hand-written
 * key literals into one factory concentrates the risk: a wrong shape here no
 * longer breaks two call sites, it breaks every caller of that key at once,
 * and react-query reports a key that matches nothing as success. So the shapes
 * are asserted rather than trusted.
 */
describe('query keys', () => {
  it('keeps the books family shapes', () => {
    expect(qk.books).toEqual(['books']);
    expect(qk.book('b1')).toEqual(['books', 'b1']);
    expect(qk.chapters('b1')).toEqual(['books', 'b1', 'chapters']);
    expect(qk.chunks('b1', 'c1')).toEqual(['books', 'b1', 'chapters', 'c1', 'chunks']);

    expect(qk.analysis.characters('b1')).toEqual(['books', 'b1', 'analysis', 'characters']);
    expect(qk.analysis.events('b1')).toEqual(['books', 'b1', 'analysis', 'events']);
    expect(qk.analysis.factions('b1')).toEqual(['books', 'b1', 'analysis', 'factions']);
    expect(qk.analysis.characterMetrics('b1')).toEqual([
      'books', 'b1', 'analysis', 'character-metrics',
    ]);

    expect(qk.entity.analysis('b1', 'e1')).toEqual(['books', 'b1', 'entities', 'e1', 'analysis']);
    expect(qk.entity.chunks('b1', 'e1')).toEqual(['books', 'b1', 'entities', 'e1', 'chunks']);
    expect(qk.entity.voice('b1', 'e1')).toEqual(['books', 'b1', 'entities', 'e1', 'voice']);

    expect(qk.event.detail('b1', 'v1')).toEqual(['books', 'b1', 'events', 'v1']);
    expect(qk.event.analysis('b1', 'v1')).toEqual(['books', 'b1', 'events', 'v1', 'analysis']);
    expect(qk.event.source('b1', 'v1')).toEqual(['books', 'b1', 'events', 'v1', 'source']);

    expect(qk.epistemic.all('b1')).toEqual(['books', 'b1', 'epistemic-state']);
    expect(qk.epistemic.at('b1', 'e1', 3)).toEqual(['books', 'b1', 'epistemic-state', 'e1', 3]);

    expect(qk.factionsPanel('b1')).toEqual(['books', 'b1', 'factions', 'panel']);

    expect(qk.graph.all('b1')).toEqual(['books', 'b1', 'graph']);
    expect(qk.graph.view('b1', 'chapter', 4, false)).toEqual([
      'books', 'b1', 'graph', 'chapter', 4, false,
    ]);

    expect(qk.inferred.all('b1')).toEqual(['books', 'b1', 'inferred-relations']);
    expect(qk.inferred.list('b1')).toEqual(['books', 'b1', 'inferred-relations', 'all']);
    expect(qk.inferred.pending('b1')).toEqual(['books', 'b1', 'inferred-relations', 'pending']);

    expect(qk.symbols.list('b1')).toEqual(['books', 'b1', 'symbols']);
    expect(qk.symbols.timeline('b1', 'i1')).toEqual(['books', 'b1', 'symbols', 'i1', 'timeline']);
    expect(qk.symbols.interpretation('b1', 'i1')).toEqual([
      'books', 'b1', 'symbols', 'i1', 'interpretation',
    ]);
    expect(qk.symbols.overview('b1')).toEqual(['symbols', 'b1', 'overview']);

    expect(qk.tension.lines('b1')).toEqual(['books', 'b1', 'tension', 'lines']);
    expect(qk.tension.teus('b1')).toEqual(['books', 'b1', 'tension', 'teus']);
    expect(qk.tension.theme('b1')).toEqual(['books', 'b1', 'tension', 'theme']);

    expect(qk.timeline.all('b1')).toEqual(['books', 'b1', 'timeline']);
    expect(qk.timeline.order('b1', 'narrative')).toEqual(['books', 'b1', 'timeline', 'narrative']);
    expect(qk.timeline.config('b1')).toEqual(['books', 'b1', 'timeline-config']);
  });

  it('keeps the tasks family shapes', () => {
    expect(qk.tasks.all).toEqual(['tasks']);
    expect(qk.tasks.list()).toEqual(['tasks', 'list']);
    expect(qk.tasks.one('t1')).toEqual(['tasks', 't1']);
  });

  it('nests every books key under the book prefix, so invalidation reaches it', () => {
    const prefix = qk.book('b1');
    const nested = [
      qk.chapters('b1'),
      qk.chunks('b1', 'c1'),
      qk.analysis.characters('b1'),
      qk.analysis.events('b1'),
      qk.analysis.factions('b1'),
      qk.analysis.characterMetrics('b1'),
      qk.entity.analysis('b1', 'e1'),
      qk.entity.chunks('b1', 'e1'),
      qk.entity.voice('b1', 'e1'),
      qk.event.detail('b1', 'v1'),
      qk.event.analysis('b1', 'v1'),
      qk.event.source('b1', 'v1'),
      qk.epistemic.all('b1'),
      qk.epistemic.at('b1', 'e1', 1),
      qk.factionsPanel('b1'),
      qk.graph.all('b1'),
      qk.graph.view('b1', null, null, false),
      qk.inferred.all('b1'),
      qk.inferred.list('b1'),
      qk.inferred.pending('b1'),
      qk.symbols.list('b1'),
      qk.symbols.timeline('b1', 'i1'),
      qk.symbols.interpretation('b1', 'i1'),
      qk.tension.lines('b1'),
      qk.tension.teus('b1'),
      qk.tension.theme('b1'),
      qk.timeline.all('b1'),
      qk.timeline.order('b1', 'narrative'),
      qk.timeline.config('b1'),
    ];

    for (const key of nested) {
      expect(key.slice(0, prefix.length)).toEqual(prefix);
    }
  });

  it('nests the narrower graph and inferred views under their own prefix', () => {
    // These pairs are the ones the code actually relies on: GraphPage
    // invalidates `graph.all` and expects every rendered view to follow.
    expect(qk.graph.view('b1', 'chapter', 2, false).slice(0, 3)).toEqual(qk.graph.all('b1'));
    expect(qk.inferred.list('b1').slice(0, 3)).toEqual(qk.inferred.all('b1'));
    expect(qk.inferred.pending('b1').slice(0, 3)).toEqual(qk.inferred.all('b1'));
    expect(qk.timeline.order('b1', 'narrative').slice(0, 3)).toEqual(qk.timeline.all('b1'));
  });
});
