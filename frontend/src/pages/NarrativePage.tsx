import { useEffect, useMemo, useState } from 'react';
import { Link, useParams } from 'react-router-dom';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { useTranslation } from 'react-i18next';
import { AlertTriangle, Compass } from 'lucide-react';
import { ApiError } from '@/api/client';
import { useBook } from '@/hooks/useBook';
import { useChatDispatch } from '@/contexts/ChatContext';
import { useTensionTask } from '@/components/tension/hooks/useTensionTask';
import { fetchChapters } from '@/api/chapters';
import { fetchTEUs } from '@/api/tension';
import { fetchTimeline } from '@/api/timeline';
import { fetchEventAnalyses } from '@/api/analysis';
import {
  classifyNarrative,
  fetchClassifyTask,
  fetchHeroJourneyTask,
  fetchKernelSpine,
  fetchNarrativeStructure,
  fetchRefineTask,
  fetchTemporalCoverage,
  refineNarrative,
  reviewNarrativeStructure,
  triggerHeroJourney,
} from '@/api/narrative';
import { STAGE_ORDER, getStageTheory, padStages } from '@/components/narrative/heroJourney';
import { HeroJourneySection } from '@/components/narrative/HeroJourneySection';
import { PlotSpine } from '@/components/narrative/PlotSpine';
import { UnclassifiedBlock } from '@/components/narrative/UnclassifiedBlock';
import { CrossEvidence } from '@/components/narrative/CrossEvidence';
import { ConfirmDialog } from '@/components/ui/ConfirmDialog';
import type { EventInfo } from '@/components/narrative/StageDetail';
import { LoadingSpinner } from '@/components/ui/LoadingSpinner';
import '@/styles/narrative.css';
import { qk } from '@/api/queryKeys';

// One prerequisite line: state · what it is · how far along · why it matters · where to fix it.
function PrereqRow({
  ready,
  name,
  count,
  hint,
  cta,
  to,
}: {
  ready: boolean;
  name: string;
  count: string;
  hint: string;
  cta: string;
  to: string;
}) {
  return (
    <div className="nl-prereq-row">
      <span className="nl-prereq-mark" style={{ color: ready ? 'var(--color-success)' : 'var(--fg-muted)' }}>
        {ready ? '●' : '○'}
      </span>
      <span className="nl-prereq-name">{name}</span>
      <span className="nl-prereq-count">{count}</span>
      <span className="nl-prereq-hint">{hint}</span>
      {/* A satisfied row has nothing to go fix. */}
      {!ready && (
        <Link className="nl-prereq-cta" to={to}>
          {cta} →
        </Link>
      )}
    </div>
  );
}

export default function NarrativePage() {
  const queryClient = useQueryClient();
  const { bookId } = useParams<{ bookId: string }>();
  const { i18n, t } = useTranslation('analysis');
  const { setPageContext } = useChatDispatch();
  const { data: book } = useBook(bookId);

  useEffect(() => {
    if (book) setPageContext({ page: 'analysis', bookId: bookId!, bookTitle: book.title });
    return () => setPageContext({ page: 'other' });
  }, [book, bookId, setPageContext]);

  const structureQuery = useQuery({
    queryKey: ['narrative', bookId],
    queryFn: () => fetchNarrativeStructure(bookId!),
    enabled: !!bookId,
    retry: false,
  });

  const kernelSpineQuery = useQuery({
    queryKey: ['narrative', bookId, 'kernel-spine'],
    queryFn: () => fetchKernelSpine(bookId!),
    enabled: !!bookId,
    retry: false,
  });

  const eventsQuery = useQuery({
    queryKey: qk.analysis.events(bookId),
    queryFn: () => fetchEventAnalyses(bookId!),
    enabled: !!bookId,
  });

  const heroJourneyOp = useTensionTask(
    fetchHeroJourneyTask,
    () => queryClient.invalidateQueries({ queryKey: ['narrative', bookId] }),
    t('narrative.errors.heroFailed'),
  );

  const handleTrigger = (force = false) =>
    heroJourneyOp.trigger(
      () => triggerHeroJourney(bookId!, i18n.language.startsWith('zh') ? 'zh' : 'en', force),
      t('narrative.errors.triggerHero'),
    );

  // Both write narrative_weight back to the KG, so both invalidate the same
  // queries the page reads.
  const invalidateNarrative = () => {
    queryClient.invalidateQueries({ queryKey: ['narrative', bookId] });
    queryClient.invalidateQueries({ queryKey: qk.analysis.events(bookId) });
  };
  const classifyOp = useTensionTask(
    fetchClassifyTask,
    invalidateNarrative,
    t('narrative.errors.classifyFailed'),
  );
  const refineOp = useTensionTask(
    fetchRefineTask,
    invalidateNarrative,
    t('narrative.errors.refineFailed'),
  );
  const [pendingAction, setPendingAction] = useState<'classify' | 'refine' | null>(null);

  const structure = structureQuery.data;
  // Padded to the canonical 12 — so `stages.length` no longer says whether an
  // analysis exists; `hasHeroJourney` reads the raw list for that.
  const stages = useMemo(() => padStages(structure?.hero_journey_stages ?? []), [structure]);
  const theory = useMemo(() => getStageTheory(i18n.language), [i18n.language]);

  // Resolve representative_event_ids → title/chapter from kernel spine + event list.
  const events = useMemo(() => {
    const map: Record<string, EventInfo> = {};
    for (const e of kernelSpineQuery.data ?? [])
      map[e.id] = { title: e.title, chapter: e.chapter, significance: e.significance ?? undefined };
    const ev = eventsQuery.data;
    if (ev) {
      for (const a of ev.analyzed) {
        if (!map[a.entityId]) map[a.entityId] = { title: a.title, chapter: a.chapter ?? undefined };
      }
      for (const u of ev.unanalyzed) {
        if (!map[u.id]) map[u.id] = { title: u.name, chapter: u.chapter ?? undefined };
      }
    }
    return map;
  }, [kernelSpineQuery.data, eventsQuery.data]);

  const reviewMutation = useMutation({
    mutationFn: (status: 'approved' | 'rejected') =>
      reviewNarrativeStructure(structure!.document_id, status),
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ['narrative', bookId] }),
  });

  const chapterCount = book?.chapterCount ?? 0;
  const hasHeroJourney = (structure?.hero_journey_stages?.length ?? 0) > 0;
  const loading = structureQuery.isLoading || kernelSpineQuery.isLoading;

  // Chapter summaries are what map_hero_journey actually reads: without them the
  // task reports success and writes zero stages. Only the empty state needs the
  // per-chapter detail, so this stays off the path where an analysis exists.
  // Same query key as useChapters — a reader-page visit already warmed it.
  const chaptersQuery = useQuery({
    queryKey: qk.chapters(bookId),
    queryFn: () => fetchChapters(bookId!),
    enabled: !!bookId && !structureQuery.isLoading && !hasHeroJourney,
  });

  // ③ cross-evidence reads what the other analysis pages already produced.
  // Gated on there being an arc to cross-reference, so books without one pay
  // for none of it.
  const crossEnabled = !!bookId && hasHeroJourney;
  const teuQuery = useQuery({
    queryKey: qk.tension.teus(bookId),
    queryFn: () => fetchTEUs(bookId!),
    enabled: crossEnabled,
  });
  const timelineQuery = useQuery({
    queryKey: qk.timeline.order(bookId, 'narrative'),
    queryFn: () => fetchTimeline(bookId!),
    enabled: crossEnabled,
  });
  const temporalCoverageQuery = useQuery({
    queryKey: ['narrative', bookId, 'temporal-coverage'],
    queryFn: () => fetchTemporalCoverage(bookId!),
    enabled: crossEnabled,
    retry: false,
  });

  const tensionByChapter = useMemo(() => {
    const out: Record<number, number> = {};
    for (const teu of teuQuery.data ?? []) {
      out[teu.chapter] = Math.max(out[teu.chapter] ?? 0, teu.intensity);
    }
    return out;
  }, [teuQuery.data]);

  const prereq = useMemo(() => {
    const chapters = chaptersQuery.data;
    const summaryTotal = chapters?.length ?? chapterCount;
    const summaryDone = chapters?.filter((c) => c.summary?.trim()).length ?? 0;
    const ev = eventsQuery.data;
    const eventTotal = ev ? ev.analyzed.length + ev.unanalyzed.length : 0;
    return {
      summaryDone,
      summaryTotal,
      summaryMissing: Math.max(0, summaryTotal - summaryDone),
      summaryReady: summaryTotal > 0 && summaryDone === summaryTotal,
      eventDone: ev?.analyzed.length ?? 0,
      eventTotal,
      eventReady: eventTotal > 0 && ev!.analyzed.length === eventTotal,
      known: !!chapters,
    };
  }, [chaptersQuery.data, chapterCount, eventsQuery.data]);

  // Blocked only on the hard prerequisite; event analysis affects representative
  // events but never whether stages can be produced.
  const triggerBlocked = prereq.known && !prereq.summaryReady;

  const sourceLabel = structure
    ? {
        summary_heuristic: t('narrative.source.heuristic'),
        llm_classified: t('narrative.source.llm'),
        human_verified: t('narrative.source.human'),
      }[structure.classification_source]
    : '';
  const kernelCount = structure?.kernel_event_ids?.length ?? 0;
  // One entry per kernel event, so repeats within a chapter carry the density.
  const kernelChapters = useMemo(
    () => (kernelSpineQuery.data ?? []).map((e) => e.chapter),
    [kernelSpineQuery.data],
  );
  // Where the kernel events stop — a stage past this point resolves to none,
  // and the detail panel says so rather than showing a bare empty list.
  const lastKernelChapter = kernelChapters.length ? Math.max(...kernelChapters) : 0;
  const eventCount = (structure?.kernel_event_ids?.length ?? 0)
    + (structure?.satellite_event_ids?.length ?? 0)
    + (structure?.unclassified_event_ids?.length ?? 0);
  const mappedStages = useMemo(
    () => stages.filter((s) => s.chapter_range.length > 0).length,
    [stages],
  );

  // Table of contents: what is on this page, in what order, and how far each
  // one has got — so the fold stops hiding the second half of the page.
  const indexCards = [
    {
      n: 1,
      role: t('narrative.index.role1'),
      title: t('narrative.index.title1'),
      answers: t('narrative.index.answers1'),
      status: hasHeroJourney
        ? t('narrative.index.mappedStatus', { mapped: mappedStages, total: STAGE_ORDER.length })
        : heroJourneyOp.running
          ? t('narrative.index.running')
          : t('narrative.index.notAnalyzed'),
      href: '#nl-hero',
    },
    {
      n: 2,
      role: t('narrative.index.role2'),
      title: t('narrative.index.title2'),
      answers: t('narrative.index.answers2'),
      status: t('narrative.index.kernelStatus', { n: kernelCount }),
      href: '#nl-spine',
    },
  ];
  if (hasHeroJourney) {
    // Only listed once the section it points at exists — a table-of-contents
    // entry for nothing is worse than no entry.
    const crossDone =
      (timelineQuery.data?.temporalAnalyzed ? 1 : 0) + ((teuQuery.data?.length ?? 0) > 0 ? 1 : 0);
    indexCards.push({
      n: 3,
      role: t('narrative.index.role3'),
      title: t('narrative.index.title3'),
      answers: t('narrative.index.answers3'),
      status: t('narrative.index.crossStatus', { done: crossDone }),
      href: '#nl-cross',
    });
  }

  const unclassifiedIds = structure?.unclassified_event_ids ?? [];
  const lang = i18n.language.startsWith('zh') ? 'zh' : 'en';

  const runClassify = () => {
    setPendingAction(null);
    classifyOp.trigger(async () => {
      try {
        return await classifyNarrative(bookId!);
      } catch (err) {
        // 409 means one thing per the API contract (#21a), and the page already
        // holds every number the server counted — so say it in the user's
        // language rather than surfacing the server's English string.
        if (err instanceof ApiError && err.status === 409) {
          throw new ApiError(
            409,
            t('narrative.errors.classifyRefused', {
              total: eventCount,
              classified: kernelCount + (structure?.satellite_event_ids?.length ?? 0),
            }),
          );
        }
        throw err;
      }
    }, t('narrative.errors.classifyTrigger'));
  };
  const runRefine = () => {
    setPendingAction(null);
    refineOp.trigger(
      () => refineNarrative(bookId!, unclassifiedIds, lang),
      t('narrative.errors.refineTrigger'),
    );
  };

  const unclassifiedBlock = structure ? (
    <UnclassifiedBlock
      count={unclassifiedIds.length}
      eepDone={prereq.eventDone}
      eepTotal={prereq.eventTotal || eventCount}
      bookId={bookId!}
      onClassify={() => setPendingAction('classify')}
      onRefine={() => setPendingAction('refine')}
      classifyRunning={classifyOp.running}
      refineRunning={refineOp.running}
      progress={(classifyOp.running ? classifyOp.task?.progress : refineOp.task?.progress) ?? 0}
      error={classifyOp.error ?? refineOp.error}
    />
  ) : null;

  const staleBanner = structure?.is_stale ? (
    <div className="nl-stale" role="status">
      <AlertTriangle size={16} />
      <div>
        <strong>{t('narrative.stale.title')}</strong>
        {t('narrative.stale.body', { step: structure.stale_reason ?? '' })}
      </div>
      {hasHeroJourney && (
        <button
          type="button"
          onClick={() => handleTrigger(true)}
          disabled={heroJourneyOp.running}
          style={{
            marginLeft: 'auto',
            flexShrink: 0,
            alignSelf: 'center',
            cursor: heroJourneyOp.running ? 'wait' : 'pointer',
            background: 'none',
            border: 'none',
            padding: 0,
            fontFamily: 'inherit',
            fontSize: 'var(--font-size-sm)',
            fontWeight: 600,
            color: 'inherit',
            textDecoration: 'underline',
            whiteSpace: 'nowrap',
          }}
        >
          {heroJourneyOp.running ? t('narrative.rerunning') : t('narrative.rerunArrow')}
        </button>
      )}
    </div>
  ) : null;

  return (
    <div className="nl-scroll">
      <div className="nl-page">
        {!loading && (
          <>
            <header className="nl-head">
              <div className="nl-head-line">
                <h1 className="nl-head-title">{t('narrative.pageTitle')}</h1>
                <p className="nl-head-lead">{t('narrative.pageLead')}</p>
              </div>
              {book && structure && (
                <div className="nl-head-meta">
                  {t('narrative.bookMeta', {
                    title: book.title,
                    chapters: chapterCount,
                    events: eventCount,
                    source: sourceLabel,
                  })}
                </div>
              )}
            </header>

            <nav className="nl-index">
              {indexCards.map((c) => (
                <a key={c.n} className="nl-index-card" href={c.href}>
                  <div className="nl-index-top">
                    <span className="nl-index-n">{c.n}</span>
                    <span className="nl-index-role">{c.role}</span>
                    <span className="nl-index-status">{c.status}</span>
                  </div>
                  <div className="nl-index-title">{c.title}</div>
                  <div className="nl-index-answers">{c.answers}</div>
                </a>
              ))}
            </nav>
          </>
        )}

        {loading ? (
          <LoadingSpinner />
        ) : hasHeroJourney && structure ? (
          <>
            {staleBanner}
            {heroJourneyOp.error && <div className="nl-empty-error">{heroJourneyOp.error}</div>}
            <HeroJourneySection
              stages={stages}
              theory={theory}
              events={events}
              chapterCount={chapterCount}
              reviewStatus={structure.review_status}
              onReview={(status) => reviewMutation.mutate(status)}
              reviewPending={reviewMutation.isPending}
              onRerun={() => handleTrigger(true)}
              rerunning={heroJourneyOp.running}
              kernelChapters={kernelChapters}
              lastKernelChapter={lastKernelChapter}
              bookId={bookId!}
            />
            <div id="nl-spine">
              <PlotSpine structure={structure} kernelEvents={kernelSpineQuery.data ?? []} bookId={bookId!} chapterCount={chapterCount}>
                {unclassifiedBlock}
              </PlotSpine>
            </div>
            <CrossEvidence
              stages={stages}
              theory={theory}
              kernelEvents={kernelSpineQuery.data ?? []}
              tensionByChapter={tensionByChapter}
              teuCount={teuQuery.data?.length ?? 0}
              temporalAnalyzed={timelineQuery.data?.temporalAnalyzed ?? false}
              temporalStructure={timelineQuery.data?.temporalStructure ?? null}
              temporalCoverage={temporalCoverageQuery.data?.coverage ?? null}
              temporalSufficient={temporalCoverageQuery.data?.coverage_sufficient ?? false}
              chapterCount={chapterCount}
              bookId={bookId!}
            />
          </>
        ) : (
          <div className="nl-empty">
            {staleBanner}
            <div className="nl-empty-icon">
              <Compass size={36} />
            </div>
            <div className="nl-empty-title">{t('narrative.empty.title')}</div>
            <div className="nl-empty-msg">{t('narrative.empty.message')}</div>

            {/* Prerequisites, stated before the click rather than after it. */}
            <div className="nl-prereq">
              <div className="nl-prereq-head">{t('narrative.empty.prereqTitle')}</div>
              <PrereqRow
                ready={prereq.summaryReady}
                name={t('narrative.empty.prereqSummary')}
                count={t('narrative.empty.summaryCount', { done: prereq.summaryDone, total: prereq.summaryTotal })}
                hint={
                  prereq.summaryReady
                    ? t('narrative.empty.summaryHintOk')
                    : t('narrative.empty.summaryHintMissing', { n: prereq.summaryMissing })
                }
                cta={t('narrative.empty.ctaSummary')}
                to={`/books/${bookId}/unraveling`}
              />
              <PrereqRow
                ready={prereq.eventReady}
                name={t('narrative.empty.prereqEvents')}
                count={t('narrative.empty.eventCount', { done: prereq.eventDone, total: prereq.eventTotal })}
                hint={t('narrative.empty.eventHint')}
                cta={t('narrative.empty.ctaEvents')}
                to={`/books/${bookId}/events`}
              />
            </div>

            {heroJourneyOp.error && <div className="nl-empty-error">{heroJourneyOp.error}</div>}
            <div className="nl-trigger-row">
              <button
                type="button"
                className={triggerBlocked ? 'nl-trigger-btn is-blocked' : 'nl-trigger-btn'}
                onClick={() => handleTrigger()}
                disabled={heroJourneyOp.running || triggerBlocked}
              >
                {heroJourneyOp.running
                  ? t('narrative.empty.running', { progress: heroJourneyOp.task?.progress ?? 0 })
                  : t('narrative.empty.trigger')}
              </button>
              {triggerBlocked && !heroJourneyOp.running && (
                <span className="nl-trigger-reason">
                  {t('narrative.empty.blockedReason', { n: prereq.summaryMissing })}
                </span>
              )}
            </div>
            {structure && (
              <div id="nl-spine" style={{ width: '100%', maxWidth: 1100, marginTop: 28 }}>
                <PlotSpine structure={structure} kernelEvents={kernelSpineQuery.data ?? []} bookId={bookId!} chapterCount={chapterCount}>
                  {unclassifiedBlock}
                </PlotSpine>
              </div>
            )}
          </div>
        )}
      </div>

      <ConfirmDialog
        open={pendingAction === 'classify'}
        title={t('narrative.unclassified.classifyConfirmTitle')}
        message={t('narrative.unclassified.classifyConfirmBody', { n: unclassifiedIds.length })}
        confirmLabel={t('narrative.unclassified.classify')}
        onConfirm={runClassify}
        onCancel={() => setPendingAction(null)}
      />
      <ConfirmDialog
        open={pendingAction === 'refine'}
        title={t('narrative.unclassified.refineConfirmTitle', { n: unclassifiedIds.length })}
        message={t('narrative.unclassified.refineConfirmBody', { n: unclassifiedIds.length })}
        confirmLabel={t('narrative.unclassified.refineConfirm')}
        onConfirm={runRefine}
        onCancel={() => setPendingAction(null)}
      />
    </div>
  );
}
