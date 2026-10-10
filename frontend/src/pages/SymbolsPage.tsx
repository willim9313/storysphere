import { useState, useEffect, useMemo } from 'react';
import { Link, useParams, useNavigate } from 'react-router-dom';
import { useQuery, useQueries, useQueryClient, useMutation } from '@tanstack/react-query';
import { Trans, useTranslation } from 'react-i18next';
import { Shapes } from 'lucide-react';

import { useChatDispatch } from '@/contexts/ChatContext';
import { useBook } from '@/hooks/useBook';
import { LoadingSpinner } from '@/components/ui/LoadingSpinner';
import { EmptyState } from '@/components/ui/EmptyState';
import { ConfirmDialog } from '@/components/ui/ConfirmDialog';
import { LlmUnconfiguredNotice } from '@/components/ui/LlmUnconfiguredNotice';
import { PageFailure } from '@/components/ui/PageFailure';
import { ApiError } from '@/api/client';
import { failureKind, isLlmUnconfigured, techDetailOf } from '@/api/failureKind';
import {
  fetchSymbolTimeline,
  fetchSymbolInterpretation,
  reviewSymbolInterpretation,
  type ImageryEntity,
  type InterpretationStatus,
  type Polarity,
  type SymbolOverviewItem,
} from '@/api/symbols';

import { fetchEntityById, fetchEventDetail } from '@/api/graph';
import { SymbolList } from '@/components/symbols/SymbolList';
import { SymbolDetailHead } from '@/components/symbols/SymbolDetailHead';
import { BehaviourSummary } from '@/components/symbols/BehaviourSummary';
import { InterpretationCta } from '@/components/symbols/InterpretationCta';
import { InterpretationGenerating } from '@/components/symbols/InterpretationGenerating';
import { InterpretationHero } from '@/components/symbols/InterpretationHero';
import { ChapterDistChart } from '@/components/symbols/ChapterDistChart';
import { CoOccurrencePanel } from '@/components/symbols/CoOccurrencePanel';
import { OccurrencesTimeline } from '@/components/symbols/OccurrencesTimeline';
import { useSymbolInterpretationTask } from '@/components/symbols/hooks/useSymbolInterpretationTask';
import {
  useSymbolAnalysis,
} from '@/components/symbols/hooks/useSymbolAnalysis';
import { useSymbolBatch } from '@/components/symbols/hooks/useSymbolBatch';
import { useSymbolCheck } from '@/components/symbols/hooks/useSymbolCheck';
import { useSymbolUrlState } from '@/components/symbols/hooks/useSymbolUrlState';
import { SymbolsDashboard } from '@/components/symbols/SymbolsDashboard';
import { ClusterView } from '@/components/symbols/ClusterView';
import { findClusters } from '@/components/symbols/symbolClusters';
import type {
  DistributionShape,
  SymbolSignals,
} from '@/components/symbols/symbolSignals';
import {
  barScale,
  hasDistinctPeak,
  type ChapterAxis,
} from '@/components/symbols/chapterAxis';
import { densityStep } from '@/components/symbols/tokens';
import { densityLegend } from '@/components/symbols/symbolViewModel';
import { GuidanceRibbon } from '@/components/ui/GuidanceRibbon';

import '@/styles/symbols.css';
import { qk } from '@/api/queryKeys';

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
  const { setPageContext } = useChatDispatch();
  const { data: book } = useBook(bookId);
  const { t } = useTranslation('analysis');
  const { t: tc } = useTranslation('common');
  const { t: tn } = useTranslation('nav');
  const queryClient = useQueryClient();

  useEffect(() => {
    if (book) setPageContext({ page: 'analysis', bookId: bookId!, bookTitle: book.title });
    return () => setPageContext({ page: 'other' });
  }, [book, bookId, setPageContext]);

  /*
   * Which view is open, how the list is sorted, and which type is filtered all
   * live in the query string — see `useSymbolUrlState`. Selecting a symbol and
   * opening a cluster are mutually exclusive there, so the breadcrumb can always
   * say where the reader is.
   */
  const {
    symbolId: selectedId,
    clusterSeedId,
    sortAxis,
    typeFilter,
    pinnedId,
    setPinned,
    openSymbol,
    openCluster: openClusterUrl,
    setSortAxis,
    setTypeFilter,
    showAll,
  } = useSymbolUrlState();

  const [search, setSearch] = useState('');
  // Screen-local, unlike the four above: a behaviour group is a way of looking,
  // not a place to link to (redesign decision 05). Cleared whenever the map is
  // returned to.
  const [shapeFilter, setShapeFilter] = useState<DistributionShape | null>(null);

  const {
    analysis,
    data: overview,
    isLoading: listLoading,
    error: listError,
    refetch: refetchOverview,
  } = useSymbolAnalysis(bookId);
  const batch = useSymbolBatch(bookId, t('symbol.overview.batch.failed'));
  const check = useSymbolCheck(analysis);

  const handleSelect = (id: string | null) => {
    openSymbol(id);
    // Returning to the map drops the behaviour filter, which was set on the map.
    if (id === null) setShapeFilter(null);
    // Opening a symbol takes the batch controls off screen with the map, so picks
    // still held would be unspendable — and would come back on the reader's
    // return, minutes later, as a count they no longer recognise.
    else check.exit();
  };

  const handleShowAll = () => {
    showAll();
    setShapeFilter(null);
  };

  const openCluster = (seedId: string) => {
    setShapeFilter(null);
    check.exit();
    openClusterUrl(seedId);
  };

  const cluster = useMemo(() => {
    if (!analysis || !clusterSeedId) return null;
    return findClusters(analysis).find((c) => c.seed.id === clusterSeedId) ?? null;
  }, [analysis, clusterSeedId]);

  /** The pinned symbol, dropped silently if the id no longer resolves. */
  const pinnedSignals = analysis?.all.find((sig) => sig.id === pinnedId) ?? null;

  const entities: ImageryEntity[] = useMemo(
    () => (analysis?.all ?? []).map((s) => toImageryEntity(s.item)),
    [analysis],
  );

  /**
   * The selected symbol's signals, and where it places among the ranked ones.
   *
   * `analysis.main` is already in load order, so the rank is its index. A tail
   * word has no rank: it is not in `main` because it has nothing to rank on, and
   * `indexOf` returning -1 has to become null rather than a 0th place.
   */
  const selectedSignals = analysis?.all.find((s) => s.id === selectedId) ?? null;
  const selectedRank = useMemo(() => {
    if (!analysis || !selectedId) return null;
    const i = analysis.main.findIndex((s) => s.id === selectedId);
    return i === -1 ? null : i + 1;
  }, [analysis, selectedId]);

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
    queryKey: qk.symbols.interpretation(bookId, selectedId),
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
    queryKey: qk.symbols.timeline(bookId, selectedId),
    queryFn: () => fetchSymbolTimeline(selectedId!),
    enabled: !!selectedId,
  });

  /**
   * Co-occurrence counts per entity, for the interpretation's character hints.
   *
   * Read off the overview the page already has. This used to be a lazy `#15d` SEP
   * fetch per selected symbol purely to turn `{uuid: count}` into a hint — the
   * overview carries the same counts already resolved to names and types, so both
   * that request and the `#15c` allies request are gone.
   */
  const entityCounts = useMemo(() => {
    const map: Record<string, number> = {};
    for (const e of selectedSignals?.item.co_occurring_entities ?? []) {
      map[e.id] = e.count;
    }
    return map;
  }, [selectedSignals]);

  // ── Resolve linked character / event IDs → human-readable names ─────────────
  const charIds = interpretation?.linked_characters ?? [];
  const eventIds = interpretation?.linked_events ?? [];

  const characterQueries = useQueries({
    queries: charIds.map((id) => ({
      queryKey: ['entities', id],
      queryFn: () => fetchEntityById(id),
      staleTime: Infinity,
      retry: false,
    })),
  });

  const eventQueries = useQueries({
    queries: eventIds.map((id) => ({
      queryKey: ['events', bookId, id],
      queryFn: () => fetchEventDetail(bookId!, id),
      staleTime: Infinity,
      retry: false,
    })),
  });

  const resolvedCharacters = charIds.map((id, i) => {
    const count = entityCounts[id];
    return {
      id,
      name: characterQueries[i]?.data?.name ?? id,
      // An id that did not resolve is shown shortened in a dashed chip, not dropped.
      resolved: characterQueries[i]?.data?.name != null,
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
      resolved: ev?.title != null,
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
  const refetchInterpretation = (imageryId: string | null = selectedId) => {
    if (!bookId) return;
    void queryClient.invalidateQueries({ queryKey: qk.symbols.overview(bookId) });
    if (imageryId) {
      void queryClient.invalidateQueries({ queryKey: qk.symbols.interpretation(bookId, imageryId) });
    }
  };

  // A run finishes for the symbol it was started on, which the reader may have
  // left by now — refresh that one, not whichever is open.
  const interpretationTask = useSymbolInterpretationTask(
    (_task, imageryId) => refetchInterpretation(imageryId),
    t('symbol.error.generic'),
  );

  const handleGenerate = (force = false) => {
    if (!selectedId || !bookId) return;
    void interpretationTask.trigger(selectedId, { bookId, forceRefresh: force });
  };

  // Regenerating spends tokens and overwrites the interpretation and its review
  // state, so it goes through a loss-list confirmation (DS v3 · 11 補稿 B).
  const [regenOpen, setRegenOpen] = useState(false);
  const handleRegenerate = () => setRegenOpen(true);

  // ── HITL review ──────────────────────────────────────────────
  const reviewMutation = useMutation({
    mutationFn: (vars: {
      status: 'approved' | 'modified' | 'rejected';
      theme?: string;
      evidenceSummary?: string;
      polarity?: Polarity;
    }) =>
      reviewSymbolInterpretation(selectedId!, {
        bookId: bookId!,
        reviewStatus: vars.status,
        theme: vars.theme,
        evidenceSummary: vars.evidenceSummary,
        polarity: vars.polarity,
      }),
    onSuccess: () => refetchInterpretation(),
  });

  const reviewError = reviewMutation.isError ? t('symbol.error.reviewFailed') : null;

  const handleApprove = () => reviewMutation.mutate({ status: 'approved' });
  const handleReject = () => reviewMutation.mutate({ status: 'rejected' });
  const handleSubmitModify = (theme: string, evidenceSummary: string | undefined, polarity: Polarity) =>
    reviewMutation.mutateAsync({ status: 'modified', theme, evidenceSummary, polarity });

  // ── Computed ─────────────────────────────────────────────────
  const selected = entities.find((e) => e.id === selectedId) ?? null;
  // The task may belong to a symbol the reader has since left. Its overlay, cancel
  // button and failure stay with that symbol; this one shows its own state, with
  // the generate button held off by `pending` so two runs never spend at once.
  const taskIsHere = selectedId !== null && interpretationTask.imageryId === selectedId;
  const isGenerating = interpretationTask.running && taskIsHere;

  let interpretationBlock: React.ReactNode;
  if (isGenerating) {
    interpretationBlock = (
      <InterpretationGenerating
        task={interpretationTask.task}
        term={selected?.term ?? ''}
        occurrenceCount={selected?.frequency}
        onCancel={() => void interpretationTask.cancel()}
        cancelling={interpretationTask.cancelling}
        cancelFailed={interpretationTask.cancelFailed}
      />
    );
  } else if (interpretation) {
    interpretationBlock = (
      <InterpretationHero
        key={interpretation.id ?? interpretation.imagery_id}
        entity={selected!}
        interpretation={interpretation}
        // 詮釋與阻擋並存：舊詮釋照常顯示，阻擋改成區塊頂端一條警示列。
        block={selectedSignals?.block ?? null}
        // 後端算的排除數，不是前端自己從 chapter_roles 推的（B-101）：這句
        // 話講的是「LLM 沒看到幾筆」，而那個答案只有排除的那一方知道。
        frontCount={selectedSignals?.item.excluded_front_matter_count ?? 0}
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
    interpretationBlock = selectedSignals ? (
      <InterpretationCta
        signals={selectedSignals}
        rank={selectedRank}
        onGenerate={() => handleGenerate(false)}
        pending={interpretationTask.running}
        error={taskIsHere ? interpretationTask.error : null}
      />
    ) : null;
  }

  const regenDialog = (
    <ConfirmDialog
      open={regenOpen}
      title={t('symbol.regen.title', { term: selected?.term ?? '' })}
      message={t('symbol.interpretation.regenerateConfirm')}
      items={[
        t('symbol.regen.loss.content'),
        t('symbol.regen.loss.status', {
          status: t(`symbol.review.${interpretation?.review_status ?? 'pending'}`),
        }),
      ]}
      costHint={t('tension.state.tokenHintShort')}
      confirmLabel={t('symbol.interpretation.regenerate')}
      spendsTokens
      danger
      onConfirm={() => {
        setRegenOpen(false);
        handleGenerate(true);
      }}
      onCancel={() => setRegenOpen(false)}
    />
  );

  const pageName = tn('tabs.symbolImagery');
  const backToBook = (
    <Link to={`/books/${bookId}`} className="ss-btn ss-btn-md ss-btn-secondary">
      {t('character.error.backToBook')}
    </Link>
  );

  let detailBody: React.ReactNode;
  if (listLoading) {
    detailBody = (
      <div className="sym-empty">
        <LoadingSpinner />
      </div>
    );
  } else if (analysis === null) {
    // The overview did not load. Falling through to the empty state here would
    // report a failure as a book with no symbols — the one thing it must not say.
    detailBody = (
      <PageFailure
        variant={failureKind(listError)}
        pageName={pageName}
        onRetry={() => void refetchOverview()}
        secondaryAction={backToBook}
        techDetail={techDetailOf(listError)}
      />
    );
  } else if (cluster !== null) {
    detailBody = (
      <ClusterView
        cluster={cluster}
        axis={analysis.axis}
        onBack={() => handleSelect(null)}
        onSelect={handleSelect}
      />
    );
  } else if (selected === null) {
    if (entities.length > 0) {
      detailBody = (
        <SymbolsDashboard
          analysis={analysis}
          serverRowCount={overview?.items?.length ?? 0}
          batch={batch}
          check={check}
          sortAxis={sortAxis}
          shapeFilter={shapeFilter}
          setShapeFilter={setShapeFilter}
          onSelect={handleSelect}
          onOpenCluster={openCluster}
        />
      );
    } else {
      detailBody = (
        <NoSymbolsYet
          bookId={bookId!}
          // The page reads the overview, so that is the cache to drop. This used to
          // invalidate `qk.symbols.list`, a different key under a different root:
          // the button looked like it worked and refetched nothing.
          onRefresh={() => queryClient.invalidateQueries({ queryKey: qk.symbols.overview(bookId) })}
        />
      );
    }
  } else {
    detailBody = (
      <>
        {selectedSignals && (
          <SymbolDetailHead
            signals={selectedSignals}
            rank={selectedRank}
            onBack={() => handleSelect(null)}
            pinned={
              pinnedSignals ? { id: pinnedSignals.id, term: pinnedSignals.term } : null
            }
            setPinned={setPinned}
          />
        )}

        {/* Before the interpretation, not after it: this is what the page knows
            for free, and on a book nobody has spent tokens on it is the only
            thing here with anything to say. */}
        {selectedSignals && analysis && (
          <BehaviourSummary
            signals={selectedSignals}
            analysis={analysis}
            rank={selectedRank}
          />
        )}

        {interpretationBlock}

        {selectedSignals && analysis && (
          <ChapterCard
            signals={selectedSignals}
            axis={analysis.axis}
            // Nothing to compare a symbol against itself, so the row is dropped
            // rather than drawn twice.
            pinned={pinnedSignals?.id === selectedSignals.id ? null : pinnedSignals}
            onClearPin={() => setPinned(null)}
          />
        )}

        {selectedSignals && (
          <CoOccurrencePanel
            bookId={bookId!}
            signals={selectedSignals}
            onSelectCo={handleSelect}
          />
        )}

        {analysis && (
          <OccurrencesTimeline
            timeline={timeline}
            loading={timelineLoading}
            term={selected.term}
            aliases={selected.aliases}
            bookId={bookId!}
            axis={analysis.axis}
          />
        )}
      </>
    );
  }

  // Every token-spending trigger (single or batch) fails one of three ways, and the
  // page says which. The app's own 503 means no LLM provider is configured: a
  // feature state, so a notice in place and the page carries on. A response with
  // no body at all is the backend being unreachable: a compact banner with a
  // retry, since there is content on screen worth keeping. Anything else is the
  // trigger failing on its own.
  const triggerFailure = interpretationTask.triggerFailure;
  const showLlmNotice = batch.llmBlocked || isLlmUnconfigured(triggerFailure);
  let triggerBanner: React.ReactNode = null;
  if (triggerFailure && !isLlmUnconfigured(triggerFailure)) {
    const unreachable = failureKind(triggerFailure) === 'backend';
    triggerBanner = (
      <div className="sym-inline-banner" role="alert">
        <span>{unreachable ? tc('failure.backendTitle') : t('symbol.error.triggerFailed')}</span>
        {unreachable && (
          <button
            type="button"
            className="ss-btn ss-btn-sm ss-btn-secondary"
            onClick={() => void interpretationTask.retry()}
          >
            {tc('retry')}
          </button>
        )}
        <button
          type="button"
          className="ss-btn ss-btn-sm ss-btn-ghost"
          onClick={interpretationTask.reset}
        >
          {t('symbol.overview.batch.dismiss')}
        </button>
      </div>
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
        onShowAll={handleShowAll}
        shapeFilter={shapeFilter}
        setShapeFilter={setShapeFilter}
        search={search}
        setSearch={setSearch}
      />

      <main className="sym-detail">
        <div className="sym-detail-inner">
          <GuidanceRibbon surface="symbols">
            <strong>{t('symbol.guide.prefix')}</strong>{' '}
            <Trans i18nKey="symbol.guide.body" ns="analysis" components={{ strong: <strong /> }} />
          </GuidanceRibbon>
          {showLlmNotice && <LlmUnconfiguredNotice />}
          {triggerBanner}
          {detailBody}
          {regenDialog}
        </div>
      </main>
    </div>
  );
}

/**
 * Where in the book a symbol appears, across all three segments.
 *
 * Peaks and "first seen" come from the segmented distribution the chart itself
 * draws, so the caption cannot contradict the markers — `entity.first_chapter` is
 * the raw minimum and reads 「首見第 -1 章」 for anything mentioned on the title
 * page.
 */
function ChapterCard({
  signals,
  axis,
  pinned,
  onClearPin,
}: Readonly<{
  signals: SymbolSignals;
  axis: ChapterAxis;
  pinned: SymbolSignals | null;
  onClearPin: () => void;
}>) {
  const { t } = useTranslation('analysis');
  const { firstBodyChapter: first, peakBodyChapters: peaks, front } = signals.distribution;
  // One source for the bar scale: the caption states it and the legend derives its
  // steps from it, so neither can drift from what the chart drew.
  // With a symbol pinned, both rows share one max so their heights compare directly.
  const scale = Math.max(
    barScale(signals.item.chapter_distribution ?? {}, axis),
    pinned ? barScale(pinned.item.chapter_distribution ?? {}, axis) : 0,
  );

  const meta = [];
  if (first !== null) meta.push(t('symbol.firstSeenBody', { chapter: first }));
  if (peaks.length > 0) {
    meta.push(
      hasDistinctPeak(signals.distribution)
        ? t('symbol.peakChapters', { chapter: peaks.join('、') })
        : t('symbol.dist.peakFlat'),
    );
  }
  meta.push(t('symbol.dist.scale', { max: scale }));

  return (
    <section className="sym-card">
      <div className="sym-card-head">
        <h3 className="sym-card-title">{t('symbol.chapterDist')}</h3>
        <span className="sym-card-meta">{meta.join(' · ')}</span>
        {pinned !== null && (
          // Inside the chart card, so the lower row is read as part of this chart.
          <span className="sym-dist-pin-head">
            <span className="sym-dist-pin-label">
              {t('symbol.pin.clearOther', { term: pinned.term })}
            </span>
            <button type="button" className="ss-btn ss-btn-sm ss-btn-ghost" onClick={onClearPin}>
              {t('symbol.pin.clearSelf')}
            </button>
          </span>
        )}
      </div>
      <div className="sym-card-body" style={{ overflowX: 'auto' }}>
        <ChapterDistChart signals={signals} axis={axis} scale={scale} pinned={pinned} />
        {pinned !== null && (
          <p className="sym-dist-pin-note">
            {t('symbol.pin.note', { term: pinned.term })}
          </p>
        )}
        <div className="sym-dist-legend">
          {densityLegend(scale).map((step) => (
            <span key={step} className="sym-dist-legend-item">
              <span
                className="sym-dist-legend-swatch"
                style={{ background: densityStep(step) }}
              />
              {step === 2
                ? t('symbol.overview.heat.legendMore', { count: step })
                : t('symbol.overview.heat.legendStep', { count: step })}
            </span>
          ))}
          <span className="sym-dist-legend-item">
            <span className="sym-dist-legend-swatch is-outside" />
            {t('symbol.overview.heat.legendOutside')}
          </span>
        </div>
        {/* Says what the front-matter bars are excluded from, because they are
            drawn rather than hidden and a visible bar reads as evidence. */}
        <p className="sym-dist-note">
          {front > 0
            ? t('symbol.dist.noteFront', { count: front })
            : t('symbol.dist.noteClean')}
        </p>
      </div>
    </section>
  );
}

/**
 * The book has no symbols (as opposed to: they failed to load, or a filter matched
 * none). Whole-stage empty — a book that has not been through extraction is the
 * one case where the page has nothing to draw.
 *
 * The three steps use the Build Overview's own words (段落, 象徵節點, 已建立／部分／
 * 未建立, 前置) rather than the pipeline's (token, empty / partial / complete),
 * and the third carries the cost line, since every trigger on that page spends
 * tokens. The sidebar goes empty at the same time — 「全部 0」 — and both must, or
 * the page contradicts itself.
 */
function NoSymbolsYet({ bookId, onRefresh }: Readonly<{ bookId: string; onRefresh: () => void }>) {
  const { t } = useTranslation('analysis');
  const navigate = useNavigate();
  return (
    <EmptyState
      weight="ready"
      icon={<Shapes size={28} aria-hidden="true" />}
      title={t('symbol.emptyTitle')}
      description={t('symbol.emptyHint')}
      action={
        <>
          <div className="sym-empty-steps">
            {([1, 2, 3] as const).map((n) => (
              <div key={n} className="sym-empty-step">
                <span className="sym-empty-step-n">{n}</span>
                <span className="sym-empty-step-t">{t(`symbol.empty.steps.${n}.title`)}</span>
                <span className="sym-empty-step-d">{t(`symbol.empty.steps.${n}.desc`)}</span>
              </div>
            ))}
          </div>
          <div className="ss-state-actions">
            <button
              type="button"
              className="ss-btn ss-btn-sm ss-btn-primary"
              onClick={() => navigate(`/books/${bookId}/unraveling`)}
            >
              {t('symbol.emptyUnravelingBtn')}
            </button>
            <button type="button" className="ss-btn ss-btn-sm ss-btn-secondary" onClick={onRefresh}>
              {t('symbol.emptyRecheckBtn')}
            </button>
          </div>
        </>
      }
    />
  );
}
