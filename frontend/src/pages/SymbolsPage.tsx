import { useState, useEffect, useMemo } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import { useQuery, useQueries, useQueryClient, useMutation } from '@tanstack/react-query';
import { useTranslation } from 'react-i18next';
import { Telescope, BookOpen, GitBranch, RefreshCw } from 'lucide-react';

import { useChatContext } from '@/contexts/ChatContext';
import { useBook } from '@/hooks/useBook';
import { LoadingSpinner } from '@/components/ui/LoadingSpinner';
import { ApiError } from '@/api/client';
import {
  fetchSymbolTimeline,
  fetchCoOccurrences,
  fetchSymbolInterpretation,
  fetchSep,
  reviewSymbolInterpretation,
  type ImageryEntity,
  type InterpretationStatus,
  type Polarity,
  type SymbolOverviewItem,
} from '@/api/symbols';

import { fetchEntityById, fetchEventDetail } from '@/api/graph';
import { SymbolList } from '@/components/symbols/SymbolList';
import { TypePill } from '@/components/symbols/Badges';
import { InterpretationCta } from '@/components/symbols/InterpretationCta';
import { InterpretationGenerating } from '@/components/symbols/InterpretationGenerating';
import { InterpretationHero } from '@/components/symbols/InterpretationHero';
import { ChapterDistChart } from '@/components/symbols/ChapterDistChart';
import { CoOccurrencePanel } from '@/components/symbols/CoOccurrencePanel';
import { OccurrencesTimeline } from '@/components/symbols/OccurrencesTimeline';
import { useSymbolInterpretationTask } from '@/components/symbols/hooks/useSymbolInterpretationTask';
import {
  SYMBOL_OVERVIEW_KEY,
  useSymbolAnalysis,
} from '@/components/symbols/hooks/useSymbolAnalysis';
import { useSymbolBatch } from '@/components/symbols/hooks/useSymbolBatch';
import { useSymbolCheck } from '@/components/symbols/hooks/useSymbolCheck';
import { SymbolsDashboard } from '@/components/symbols/SymbolsDashboard';
import type { DistributionShape, SortAxis } from '@/components/symbols/symbolSignals';
import {
  bodyChapterMax,
  firstBodyChapter,
  outsideBodyCount,
  peakBodyChapters,
} from '@/components/symbols/chapterAxis';

import '@/styles/symbols.css';

const INTERPRETATION_KEY = (bookId: string | undefined, imageryId: string | null) =>
  ['books', bookId, 'symbols', imageryId, 'interpretation'] as const;

/**
 * Narrow an overview row to the list shape the charts still expect.
 *
 * The overview is a superset of the old list response, but its collection fields
 * are omitted when empty, so they need defaults rather than a cast.
 */
function toImageryEntity(item: SymbolOverviewItem): ImageryEntity {
  return {
    id: item.id,
    book_id: item.book_id,
    term: item.term,
    imagery_type: item.imagery_type,
    aliases: item.aliases ?? [],
    frequency: item.frequency,
    chapter_distribution: item.chapter_distribution ?? {},
    first_chapter: item.first_chapter ?? null,
  };
}

export default function SymbolsPage() {
  const { bookId } = useParams<{ bookId: string }>();
  const { setPageContext } = useChatContext();
  const { data: book } = useBook(bookId);
  const { t } = useTranslation('analysis');
  const queryClient = useQueryClient();

  useEffect(() => {
    if (book) setPageContext({ page: 'analysis', bookId: bookId!, bookTitle: book.title });
    return () => setPageContext({ page: 'other' });
  }, [book, bookId, setPageContext]);

  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [typeFilter, setTypeFilter] = useState<string | null>(null);
  // Narrative load, not frequency: on real books frequency ranks most of the
  // list identically, so it is offered as a cross-check rather than the default.
  const [sortAxis, setSortAxis] = useState<SortAxis>('load');
  const [search, setSearch] = useState('');
  // Screen-local: a behaviour group is a way of looking, not a place to link to
  // (redesign decision 05). Cleared whenever the map is returned to.
  const [shapeFilter, setShapeFilter] = useState<DistributionShape | null>(null);

  const { analysis, isLoading: listLoading } = useSymbolAnalysis(bookId);
  const batch = useSymbolBatch(bookId, t('symbol.overview.batch.failed'));
  const check = useSymbolCheck(analysis);

  const handleSelect = (id: string | null) => {
    setSelectedId(id);
    // Returning to the map drops the behaviour filter, which was set on the map.
    if (id === null) setShapeFilter(null);
    // Opening a symbol takes the batch controls off screen with the map, so picks
    // still held would be unspendable — and would come back on the reader's
    // return, minutes later, as a count they no longer recognise.
    else check.exit();
  };

  const entities: ImageryEntity[] = useMemo(
    () => (analysis?.all ?? []).map((s) => toImageryEntity(s.item)),
    [analysis],
  );

  // Review state now arrives with the list. It used to cost one request per
  // symbol — 29 of them on 名字的潮汐, 28 returning 404 — purely to decide whether
  // a sidebar badge should render.
  const interpretationStatuses = useMemo(() => {
    const map: Record<string, InterpretationStatus | undefined> = {};
    for (const s of analysis?.all ?? []) {
      if (s.item.interpretation) map[s.id] = s.item.interpretation;
    }
    return map;
  }, [analysis]);

  // The selected symbol still needs the full interpretation: the overview carries
  // review state, not the theme or the evidence synthesis.
  const { data: interpretation = null } = useQuery({
    queryKey: INTERPRETATION_KEY(bookId, selectedId),
    queryFn: async () => {
      try {
        return await fetchSymbolInterpretation(selectedId!, bookId!);
      } catch (err) {
        if (err instanceof ApiError && err.status === 404) return null;
        throw err;
      }
    },
    enabled: !!selectedId && !!bookId && !!interpretationStatuses[selectedId],
    retry: false,
  });

  const { data: timeline = [], isLoading: timelineLoading } = useQuery({
    queryKey: ['books', bookId, 'symbols', selectedId, 'timeline'],
    queryFn: () => fetchSymbolTimeline(selectedId!),
    enabled: !!selectedId,
  });

  const { data: coOccurrences = [], isLoading: coLoading } = useQuery({
    queryKey: ['books', bookId, 'symbols', selectedId, 'co-occurrences'],
    queryFn: () => fetchCoOccurrences(selectedId!, 12),
    enabled: !!selectedId,
  });

  // SEP carries per-entity co-occurrence counts (added 2026-05-26 via
  // co_occurring_entity_counts). We fetch lazily because SEP assembly is
  // medium-cost, and only need it once interpretation exists (linked_characters
  // are otherwise empty).
  const { data: sep } = useQuery({
    queryKey: ['books', bookId, 'symbols', selectedId, 'sep'],
    queryFn: () => fetchSep(selectedId!),
    enabled: !!selectedId && !!bookId,
    staleTime: 5 * 60_000,
  });
  const entityCounts = sep?.co_occurring_entity_counts ?? {};

  // ── Resolve linked character / event IDs → human-readable names ─────────────
  const charIds = interpretation?.linked_characters ?? [];
  const eventIds = interpretation?.linked_events ?? [];

  const characterQueries = useQueries({
    queries: charIds.map((id) => ({
      queryKey: ['entities', id],
      queryFn: () => fetchEntityById(id),
      staleTime: Infinity,
    })),
  });

  const eventQueries = useQueries({
    queries: eventIds.map((id) => ({
      queryKey: ['events', bookId, id],
      queryFn: () => fetchEventDetail(bookId!, id),
      staleTime: Infinity,
    })),
  });

  const resolvedCharacters = charIds.map((id, i) => {
    const count = entityCounts[id];
    return {
      id,
      name: characterQueries[i]?.data?.name ?? id,
      hint: count != null && count > 0
        ? t('symbol.interpretation.linkedCharHint', { count })
        : undefined,
    };
  });

  const resolvedEvents = eventIds.map((id, i) => {
    const ev = eventQueries[i]?.data;
    return {
      id,
      name: ev?.title ?? id,
      hint: ev?.chapter != null ? t('symbol.interpretation.linkedEventHint', { chapter: ev.chapter }) : undefined,
    };
  });

  // ── Generation task ──────────────────────────────────────────
  /**
   * Interpretation state lives in two caches now, and both must be dropped.
   *
   * The overview decides whether the interpretation query runs at all, so
   * refreshing only the interpretation leaves a symbol that was just interpreted
   * looking uninterpreted forever: the overview still reports null, the query
   * stays disabled, and nothing ever asks the server.
   */
  const refetchInterpretation = () => {
    if (!bookId) return;
    void queryClient.invalidateQueries({ queryKey: SYMBOL_OVERVIEW_KEY(bookId) });
    if (selectedId) {
      void queryClient.invalidateQueries({ queryKey: INTERPRETATION_KEY(bookId, selectedId) });
    }
  };

  const interpretationTask = useSymbolInterpretationTask(
    refetchInterpretation,
    t('symbol.error.generic'),
    t('symbol.error.triggerFailed'),
  );

  const handleGenerate = (force = false) => {
    if (!selectedId || !bookId) return;
    void interpretationTask.trigger(selectedId, { bookId, forceRefresh: force });
  };

  const handleRegenerate = () => {
    if (globalThis.window === undefined) {
      handleGenerate(true);
      return;
    }
    if (globalThis.window.confirm(t('symbol.interpretation.regenerateConfirm'))) {
      handleGenerate(true);
    }
  };

  // ── HITL review ──────────────────────────────────────────────
  const reviewMutation = useMutation({
    mutationFn: (vars: { status: 'approved' | 'modified' | 'rejected'; theme?: string; polarity?: Polarity }) =>
      reviewSymbolInterpretation(selectedId!, {
        bookId: bookId!,
        reviewStatus: vars.status,
        theme: vars.theme,
        polarity: vars.polarity,
      }),
    onSuccess: refetchInterpretation,
  });

  const reviewError = reviewMutation.isError ? t('symbol.error.reviewFailed') : null;

  const handleApprove = () => reviewMutation.mutate({ status: 'approved' });
  const handleReject = () => reviewMutation.mutate({ status: 'rejected' });
  const handleSubmitModify = (theme: string, polarity: Polarity) =>
    reviewMutation.mutate({ status: 'modified', theme, polarity });

  // ── Computed ─────────────────────────────────────────────────
  const selected = entities.find((e) => e.id === selectedId) ?? null;
  // Shared axis edge for every chart on the page. Taking book.chapterCount alone
  // hid occurrences recorded past it (名字的潮汐 has symbols in chapter 11 with a
  // chapterCount of 10); bodyChapterMax widens the axis to fit the data.
  const totalChapters = useMemo(
    () => bodyChapterMax(entities.map((e) => e.chapter_distribution), book?.chapterCount),
    [book, entities],
  );

  const isGenerating = interpretationTask.running && selectedId !== null;

  let interpretationBlock: React.ReactNode;
  if (isGenerating) {
    interpretationBlock = (
      <InterpretationGenerating
        task={interpretationTask.task}
        term={selected?.term ?? ''}
        occurrenceCount={selected?.frequency}
        onCancel={interpretationTask.cancel}
      />
    );
  } else if (interpretation) {
    interpretationBlock = (
      <InterpretationHero
        key={interpretation.id ?? interpretation.imagery_id}
        entity={selected!}
        interpretation={interpretation}
        resolvedCharacters={resolvedCharacters}
        resolvedEvents={resolvedEvents}
        pending={reviewMutation.isPending}
        error={reviewError}
        onApprove={handleApprove}
        onSubmitModify={handleSubmitModify}
        onReject={handleReject}
        onRegenerate={handleRegenerate}
      />
    );
  } else {
    interpretationBlock = (
      <InterpretationCta
        onGenerate={() => handleGenerate(false)}
        pending={interpretationTask.running}
        error={interpretationTask.error}
      />
    );
  }

  let detailBody: React.ReactNode;
  if (listLoading) {
    detailBody = (
      <div className="sym-empty">
        <LoadingSpinner />
      </div>
    );
  } else if (selected === null) {
    if (entities.length > 0) {
      detailBody = (
        <SymbolsDashboard
          analysis={analysis}
          batch={batch}
          check={check}
          sortAxis={sortAxis}
          shapeFilter={shapeFilter}
          setShapeFilter={setShapeFilter}
          onSelect={handleSelect}
        />
      );
    } else {
      detailBody = <EmptyState bookId={bookId!} onRefresh={() => queryClient.invalidateQueries({ queryKey: ['books', bookId, 'symbols'] })} />;
    }
  } else {
    detailBody = (
      <>
        <header className="sym-detail-head">
          <div className="sym-detail-title-row">
            <h1 className="sym-detail-title">{selected.term}</h1>
            <TypePill type={selected.imagery_type} />
            <span className="sym-detail-freq">
              {t('symbol.frequency', { count: selected.frequency })}
            </span>
          </div>
          {selected.aliases.length > 0 && (
            <div className="sym-detail-aliases">
              <span className="sym-aliases-label">{t('symbol.aliases')}</span>
              {selected.aliases.map((a) => (
                <span key={a} className="sym-alias-pill">
                  {a}
                </span>
              ))}
            </div>
          )}
        </header>

        {interpretationBlock}

        <ChapterCard entity={selected} totalChapters={totalChapters} />

        <CoOccurrencePanel
          bookId={bookId!}
          coOccurrences={coOccurrences}
          linkedCharacters={resolvedCharacters}
          linkedEvents={resolvedEvents}
          loading={coLoading}
          onSelectCo={setSelectedId}
        />

        <OccurrencesTimeline
          timeline={timeline}
          loading={timelineLoading}
          term={selected.term}
          aliases={selected.aliases}
          bookId={bookId!}
        />
      </>
    );
  }

  return (
    <div className="sym-page">
      <SymbolList
        analysis={analysis}
        selectedId={selectedId}
        onSelect={handleSelect}
        check={check}
        sortAxis={sortAxis}
        setSortAxis={setSortAxis}
        typeFilter={typeFilter}
        setTypeFilter={setTypeFilter}
        shapeFilter={shapeFilter}
        search={search}
        setSearch={setSearch}
      />

      <main className="sym-detail">{detailBody}</main>
    </div>
  );
}

function ChapterCard({ entity, totalChapters }: Readonly<{ entity: ImageryEntity; totalChapters: number }>) {
  const { t } = useTranslation('analysis');
  // Peaks and "first seen" are derived from the same body-chapter view the chart
  // draws, so the caption can no longer contradict the marker: entity.first_chapter
  // is the raw minimum and reads "首見第 -1 章" for anything mentioned in front matter.
  const peakChapters = useMemo(
    () => peakBodyChapters(entity.chapter_distribution),
    [entity.chapter_distribution],
  );
  const firstChapter = firstBodyChapter(entity.chapter_distribution);
  const outside = outsideBodyCount(entity.chapter_distribution);
  const peakLabel = peakChapters.length > 0 ? t('symbol.peakChapters', { chapter: peakChapters[0] }) : null;
  return (
    <section className="sym-card">
      <div className="sym-card-head">
        <BookOpen size={13} style={{ color: 'var(--accent)' }} />
        <span className="sym-card-title">{t('symbol.chapterDist')}</span>
        <span className="sym-card-meta">
          {firstChapter != null && t('symbol.firstSeen', { chapter: firstChapter })}
          {firstChapter != null && peakLabel && <> · </>}
          {peakLabel}
          {outside > 0 && (
            <>
              {(firstChapter != null || peakLabel) && <> · </>}
              {t('symbol.outsideBody', { count: outside })}
            </>
          )}
        </span>
      </div>
      <div className="sym-card-body" style={{ overflowX: 'auto' }}>
        <ChapterDistChart
          distribution={entity.chapter_distribution}
          peakChapters={peakChapters}
          totalChapters={totalChapters}
        />
        <div className="sym-density-legend">
          <span className="sym-density-step" style={{ background: 'var(--symbol-density-low)' }} /> {t('symbol.densityLow')}
          <span className="sym-density-step" style={{ background: 'var(--symbol-density-mid)' }} /> {t('symbol.densityMid')}
          <span className="sym-density-step" style={{ background: 'var(--symbol-density-high)' }} /> {t('symbol.densityHigh')}
          <span className="sym-density-step sym-density-peak">
            <span />
          </span>{' '}
          {t('symbol.densityPeak')}
        </div>
      </div>
    </section>
  );
}

function EmptyState({ bookId, onRefresh }: Readonly<{ bookId: string; onRefresh: () => void }>) {
  const { t } = useTranslation('analysis');
  const navigate = useNavigate();
  return (
    <div className="sym-empty">
      <div className="sym-empty-illust">
        <Telescope size={56} strokeWidth={1.25} />
      </div>
      <h2 className="sym-empty-title">{t('symbol.emptyTitle')}</h2>
      <p className="sym-empty-desc">{t('symbol.emptyHint')}</p>
      <div className="sym-empty-steps">
        {([1, 2, 3] as const).map((n) => (
          <div key={n} className="sym-empty-step">
            <div className="sym-empty-step-n">{n}</div>
            <div>
              <div className="sym-empty-step-t">{t(`symbol.emptyStep${n}Title`)}</div>
              <div className="sym-empty-step-d">{t(`symbol.emptyStep${n}Desc`)}</div>
            </div>
          </div>
        ))}
      </div>
      <div className="sym-empty-cta">
        <button
          type="button"
          className="sym-btn-secondary"
          onClick={() => navigate(`/books/${bookId}/unraveling`)}
        >
          <GitBranch size={13} /> {t('symbol.emptyUnravelingBtn')}
        </button>
        <button type="button" className="sym-btn-ghost-large" onClick={onRefresh}>
          <RefreshCw size={13} /> {t('symbol.emptyRecheckBtn')}
        </button>
      </div>
    </div>
  );
}
