import { useEffect, useMemo, useState } from 'react';
import { Link, useParams } from 'react-router-dom';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { Trans, useTranslation } from 'react-i18next';
import { Compass, TriangleAlert } from 'lucide-react';
import { ApiError } from '@/api/client';
import { failureKind, techDetailOf } from '@/api/failureKind';
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
  fetchRunningNarrative,
  fetchTemporalCoverage,
  refineNarrative,
  reviewNarrativeStructure,
  triggerHeroJourney,
  type NarrativeOp,
  type NarrativeReviewStatus,
} from '@/api/narrative';
import { STAGE_ORDER, getStageTheory, padStages } from '@/components/narrative/heroJourney';
import { HeroJourneySection } from '@/components/narrative/HeroJourneySection';
import { PlotSpine } from '@/components/narrative/PlotSpine';
import { UnclassifiedBlock } from '@/components/narrative/UnclassifiedBlock';
import { CrossEvidence } from '@/components/narrative/CrossEvidence';
import { displacementCounts, splitAffects, summaryGate } from '@/components/narrative/narrativeModel';
import { staleStepKey } from '@/components/timeline/timelineModel';
import { ConfirmDialog } from '@/components/ui/ConfirmDialog';
import type { EventInfo } from '@/components/narrative/StageDetail';
import { LoadingSpinner } from '@/components/ui/LoadingSpinner';
import { GuidanceRibbon } from '@/components/ui/GuidanceRibbon';
import { LlmUnconfiguredNotice } from '@/components/ui/LlmUnconfiguredNotice';
import { PageFailure } from '@/components/ui/PageFailure';
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
}: Readonly<{
  ready: boolean;
  name: string;
  count: string;
  hint: string;
  cta: string;
  to: string;
}>) {
  return (
    <div className="nl-prereq-row">
      <span className={ready ? 'nl-prereq-mark is-ready' : 'nl-prereq-mark'} aria-hidden="true">
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

// Stage strings sent by the #21e runner (routers/narrative.py `_hero_journey`).
const HERO_STEPS: Record<string, 'load' | 'llm' | 'parse'> = {
  'loading chapter summaries': 'load',
  'calling LLM for hero journey mapping': 'llm',
  'parsing hero journey stages': 'parse',
};

// 404 here means "not analyzed yet" — an empty state, not a failure.
const isNotFound = (err: unknown) => err instanceof ApiError && err.status === 404;

export default function NarrativePage() {
  const queryClient = useQueryClient();
  const { bookId } = useParams<{ bookId: string }>();
  const { i18n, t } = useTranslation('analysis');
  const { t: tr } = useTranslation('reader');
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

  // Both write narrative_weight back to the KG, so both invalidate the same
  // queries the page reads.
  const invalidateNarrative = () => {
    queryClient.invalidateQueries({ queryKey: ['narrative', bookId] });
    queryClient.invalidateQueries({ queryKey: qk.analysis.events(bookId) });
  };
  const classifyOp = useTensionTask(fetchClassifyTask, invalidateNarrative, t('narrative.errors.classifyFailed'));
  const refineOp = useTensionTask(fetchRefineTask, invalidateNarrative, t('narrative.errors.refineFailed'));
  const [pendingAction, setPendingAction] = useState<'classify' | 'refine' | null>(null);

  // The three runs share one lock per book (#21m): pick up whichever one holds
  // it — started in another tab, or before a remount — instead of offering to
  // start one the server would refuse.
  const adoptHero = heroJourneyOp.adopt;
  const adoptClassify = classifyOp.adopt;
  const adoptRefine = refineOp.adopt;
  useEffect(() => {
    if (!bookId) return;
    let live = true;
    const adoptBy = { heroJourney: adoptHero, classify: adoptClassify, refine: adoptRefine };
    fetchRunningNarrative(bookId)
      .then((run) => {
        if (live && run.op && run.taskId) adoptBy[run.op](run.taskId);
      })
      .catch(() => {}); // a failed lookup just leaves the page idle
    return () => {
      live = false;
    };
  }, [bookId, adoptHero, adoptClassify, adoptRefine]);

  const runningOp: NarrativeOp | null = heroJourneyOp.running
    ? 'heroJourney'
    : classifyOp.running
      ? 'classify'
      : refineOp.running
        ? 'refine'
        : null;
  const busyReason = runningOp ? t(`narrative.busy.${runningOp}`) : null;

  // The hero-journey runner reports three fixed steps (10/20/90) around one
  // LLM call; name the step rather than show a number that reads as measured.
  const heroStep = HERO_STEPS[heroJourneyOp.task?.stage ?? ''];
  const heroRunningLabel = heroStep
    ? t('narrative.empty.runningStep', { step: t(`narrative.heroStep.${heroStep}`) })
    : t('narrative.empty.runningPlain');

  // A trigger refused with 409 batch_running started nothing: follow the run
  // that holds the lock. If it is this very op, that is the answer. If it is
  // another, that op's control takes it — its busy note says why this one did
  // not start, so the refusal leaves no error of its own behind.
  const triggerFollowing = (
    op: NarrativeOp,
    handle: typeof heroJourneyOp,
    create: () => Promise<{ taskId: string }>,
    triggerError: string,
  ) => {
    let handedOff = false;
    void handle
      .trigger(async () => {
        try {
          return await create();
        } catch (err) {
          if (!(err instanceof ApiError && err.status === 409 && err.code === 'batch_running')) throw err;
          const run = await fetchRunningNarrative(bookId!).catch(() => null);
          if (run?.op && run.taskId) {
            if (run.op === op) return { taskId: run.taskId };
            ({ heroJourney: adoptHero, classify: adoptClassify, refine: adoptRefine })[run.op](run.taskId);
            handedOff = true;
          }
          throw new ApiError(409, t('narrative.busy.other'));
        }
      }, triggerError)
      .then(() => {
        if (handedOff) handle.clearError();
      });
  };
  // The fourth kind of failure, specific to this page: the server refused to
  // reclassify (409). Kept apart from `classifyOp.error` because that hook
  // flattens every failure to a string and loses the status.
  const [classifyRefused, setClassifyRefused] = useState<string | null>(null);

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

  // Pressing a lit button again sends `pending` (resolved by nextReviewStatus).
  const reviewMutation = useMutation({
    mutationFn: (status: NarrativeReviewStatus) => reviewNarrativeStructure(structure!.document_id, status),
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ['narrative', bookId] }),
  });

  const chapterCount = book?.chapterCount ?? 0;
  const hasHeroJourney = (structure?.hero_journey_stages?.length ?? 0) > 0;
  const loading = structureQuery.isLoading || kernelSpineQuery.isLoading;

  // This page's own queries failing. 404 is "not analyzed yet" and stays an
  // empty state. BookLayout already owns the book fetch failing.
  const pageError =
    (structureQuery.isError && !isNotFound(structureQuery.error) ? structureQuery.error : null) ??
    (kernelSpineQuery.isError && !isNotFound(kernelSpineQuery.error) ? kernelSpineQuery.error : null);
  const retryPage = () => {
    if (structureQuery.isError) void structureQuery.refetch();
    if (kernelSpineQuery.isError) void kernelSpineQuery.refetch();
  };

  // Chapter summaries are what map_hero_journey actually reads: without them the
  // task reports success and writes zero stages. The gate guards every path that
  // starts an analysis (first run, re-run, the stale band), so the list is
  // fetched whether or not an analysis already exists. Same query key as
  // useChapters — a reader-page visit already warmed it.
  const chaptersQuery = useQuery({
    queryKey: qk.chapters(bookId),
    queryFn: () => fetchChapters(bookId!),
    enabled: !!bookId && !structureQuery.isLoading,
  });
  const gate = summaryGate(chaptersQuery.data, chapterCount);
  const blockedReason = gate.blocked ? t('narrative.empty.blockedReason', { n: gate.missing }) : null;

  const handleTrigger = (force = false) => {
    if (gate.blocked || runningOp) return;
    triggerFollowing(
      'heroJourney',
      heroJourneyOp,
      () => triggerHeroJourney(bookId!, book?.language ?? 'en', force),
      t('narrative.errors.triggerHero'),
    );
  };

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

  const displacement = useMemo(() => displacementCounts(timelineQuery.data?.events ?? []), [timelineQuery.data]);

  const ev = eventsQuery.data;
  const eventTotal = ev ? ev.analyzed.length + ev.unanalyzed.length : 0;
  const eventDone = ev?.analyzed.length ?? 0;
  const eventReady = eventTotal > 0 && eventDone === eventTotal;

  const sourceLabel = structure
    ? {
        summary_heuristic: t('narrative.source.heuristic'),
        llm_classified: t('narrative.source.llm'),
        human_verified: t('narrative.source.human'),
      }[structure.classification_source]
    : '';
  const kernelCount = structure?.kernel_event_ids?.length ?? 0;
  const satelliteCount = structure?.satellite_event_ids?.length ?? 0;
  const unclassifiedIds = structure?.unclassified_event_ids ?? [];
  // One entry per kernel event, so repeats within a chapter carry the density.
  const kernelChapters = useMemo(() => (kernelSpineQuery.data ?? []).map((e) => e.chapter), [kernelSpineQuery.data]);
  const eventCount = kernelCount + satelliteCount + unclassifiedIds.length;
  const mappedStages = useMemo(() => stages.filter((s) => s.chapter_range.length > 0).length, [stages]);

  // Table of contents: what is on this page, in what order, and how far each
  // one has got — so the fold stops hiding the second half of the page.
  let heroStatus = t('narrative.index.notAnalyzed');
  let heroWarn = true;
  if (hasHeroJourney) {
    heroStatus = t('narrative.index.mappedStatus', { mapped: mappedStages, total: STAGE_ORDER.length });
    heroWarn = false;
  } else if (heroJourneyOp.running) {
    heroStatus = t('narrative.index.running');
    heroWarn = false;
  }
  const indexCards = [
    {
      n: 1,
      role: t('narrative.index.role1'),
      title: t('narrative.index.title1'),
      answers: t('narrative.index.answers1'),
      status: heroStatus,
      warn: heroWarn,
      href: '#nl-hero',
    },
  ];
  // The spine is only drawn once a classification exists (GET /narrative 404
  // otherwise) — same rule as card 3 below.
  if (structure) {
    indexCards.push({
      n: 2,
      role: t('narrative.index.role2'),
      title: t('narrative.index.title2'),
      answers: t('narrative.index.answers2'),
      status: t('narrative.index.kernelStatus', { n: kernelCount }),
      warn: false,
      href: '#nl-spine',
    });
  }
  if (hasHeroJourney) {
    // Only listed once the section it points at exists — a table-of-contents
    // entry for nothing is worse than no entry.
    const crossDone = (timelineQuery.data?.temporalAnalyzed ? 1 : 0) + ((teuQuery.data?.length ?? 0) > 0 ? 1 : 0);
    indexCards.push({
      n: 3,
      role: t('narrative.index.role3'),
      title: t('narrative.index.title3'),
      answers: t('narrative.index.answers3'),
      status: t('narrative.index.crossStatus', { done: crossDone }),
      warn: false,
      href: '#nl-cross',
    });
  }

  // The book's language, not the UI's — this used to read i18n.language, which
  // made an English UI request English analysis of a Chinese book.
  const lang = book?.language ?? 'en';

  const runClassify = () => {
    setPendingAction(null);
    setClassifyRefused(null);
    refineOp.clearError();
    triggerFollowing('classify', classifyOp, async () => {
      try {
        return await classifyNarrative(bookId!);
      } catch (err) {
        // A 409 without a code means one thing per the API contract (#21a),
        // and the page already holds every number the server counted — so say
        // it in the user's language rather than surfacing the server's English
        // string. `batch_running` is the lock, handled by triggerFollowing.
        if (err instanceof ApiError && err.status === 409 && err.code !== 'batch_running') {
          const message = t('narrative.errors.classifyRefused', {
            total: eventCount,
            classified: kernelCount + satelliteCount,
          });
          setClassifyRefused(message);
          throw new ApiError(409, message);
        }
        throw err;
      }
    }, t('narrative.errors.classifyTrigger'));
  };
  const runRefine = () => {
    setPendingAction(null);
    // The block shows one message, classify's first: a refusal or failure left
    // over from an earlier classify would otherwise stand in for this run's.
    setClassifyRefused(null);
    classifyOp.clearError();
    triggerFollowing(
      'refine',
      refineOp,
      () => refineNarrative(bookId!, unclassifiedIds, lang),
      t('narrative.errors.refineTrigger'),
    );
  };

  const unclassifiedBlock = structure ? (
    <UnclassifiedBlock
      count={unclassifiedIds.length}
      eepDone={eventDone}
      eepTotal={eventTotal || eventCount}
      bookId={bookId!}
      onClassify={() => setPendingAction('classify')}
      onRefine={() => setPendingAction('refine')}
      classifyRunning={classifyOp.running}
      refineRunning={refineOp.running}
      progress={(classifyOp.running ? classifyOp.task?.progress : refineOp.task?.progress) ?? 0}
      error={classifyOp.error ?? refineOp.error}
      refusedMessage={classifyRefused}
      llmBlocked={refineOp.llmBlocked}
      busyReason={runningOp === 'heroJourney' ? busyReason : null}
    />
  ) : null;

  // Which pipeline step overtook the analysis, named the way the reader page
  // names it — never the raw step id.
  const staleKey = staleStepKey(structure?.stale_reason);
  const staleStep = staleKey ? tr(`rerun.steps.${staleKey}`) : (structure?.stale_reason ?? '');
  // The banner's link points at the card's own LLM button; it never starts the
  // analysis itself (the click that spends tokens stays on the gated button).
  const goToRerun = () => {
    const el = document.getElementById('nl-hero-run');
    if (!el) return;
    const reduceMotion = window.matchMedia('(prefers-reduced-motion: reduce)').matches;
    el.scrollIntoView({ behavior: reduceMotion ? 'auto' : 'smooth', block: 'center' });
    el.focus({ preventScroll: true });
    el.classList.remove('nl-flash');
    void el.offsetWidth; // restart the animation if it is already running
    el.classList.add('nl-flash');
    window.setTimeout(() => el.classList.remove('nl-flash'), 1700);
  };
  // Without a hero journey, what is stale is the kernel/satellite split — the
  // banner's button cannot fix that (#217), so the spine card says it in
  // words, pointing at the control that can when there is one.
  const spineStaleNote =
    structure?.is_stale && !hasHeroJourney
      ? t(unclassifiedIds.length > 0 ? 'narrative.stale.spineWithAction' : 'narrative.stale.spine', { step: staleStep })
      : null;
  const staleBanner = structure?.is_stale ? (
    <div className="nl-stale" role="status">
      <strong>
        <TriangleAlert size={14} aria-hidden="true" />
        {t('narrative.stale.title')}
      </strong>
      <span>{t('narrative.stale.body', { step: staleStep })}</span>
      <button type="button" className="nl-stale-act" onClick={goToRerun}>
        <span className="ss-llm-glyph" aria-hidden="true" />
        {t('narrative.rerunArrow')}
      </button>
    </div>
  ) : null;

  const lastClassifyDetail = structure
    ? splitAffects(
        t('narrative.unclassified.classifyAffects', {
          total: eventCount,
          kernel: kernelCount,
          satellite: satelliteCount,
          unclassified: unclassifiedIds.length,
        }),
      )
    : { title: '', item: '' };
  const refineDetail = splitAffects(t('narrative.unclassified.refineAffects', { n: unclassifiedIds.length }));

  const backToBook = (
    <Link to={`/books/${bookId}`} className="ss-btn ss-btn-md ss-btn-secondary">
      {t('character.error.backToBook')}
    </Link>
  );

  return (
    <div className="nl-scroll">
      <div className="nl-page">
        {!loading && (
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
        )}

        {!loading && pageError && (
          <PageFailure
            variant={failureKind(pageError)}
            pageName={t('narrative.pageTitle')}
            onRetry={retryPage}
            secondaryAction={backToBook}
            techDetail={techDetailOf(pageError)}
          />
        )}

        {!loading && !pageError && (
          <>
            <GuidanceRibbon surface="narrative">
              <strong>{t('narrative.guide.prefix')}</strong>{' '}
              <Trans i18nKey="narrative.guide.body" ns="analysis" components={{ strong: <strong /> }} />
            </GuidanceRibbon>

            <nav className="nl-index" aria-label={t('narrative.index.navLabel')}>
              {indexCards.map((c) => (
                <a key={c.n} className="nl-index-card" href={c.href}>
                  <div className="nl-index-top">
                    <span className="nl-index-n">{c.n}</span>
                    <span className="nl-index-role">{c.role}</span>
                    <span className={c.warn ? 'nl-index-status is-warning' : 'nl-index-status'}>{c.status}</span>
                  </div>
                  <div className="nl-index-title">{c.title}</div>
                  <div className="nl-index-answers">{c.answers}</div>
                </a>
              ))}
            </nav>
          </>
        )}

        {loading && <LoadingSpinner />}

        {!loading && !pageError && hasHeroJourney && structure && (
          <>
            {staleBanner}
            {heroJourneyOp.llmBlocked && <LlmUnconfiguredNotice />}
            {heroJourneyOp.error && <div className="nl-empty-error">{heroJourneyOp.error}</div>}
            {reviewMutation.isError && (
              <div className="nl-empty-error" role="alert">
                {t('narrative.errors.reviewFailed')}
              </div>
            )}
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
              runningLabel={heroRunningLabel}
              rerunBlockedReason={blockedReason ?? (runningOp && runningOp !== 'heroJourney' ? busyReason : null)}
              kernelChapters={kernelChapters}
              bookId={bookId!}
            />
            <div id="nl-spine">
              <PlotSpine
                structure={structure}
                kernelEvents={kernelSpineQuery.data ?? []}
                bookId={bookId!}
                chapterCount={chapterCount}
              >
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
              displacement={displacement}
              temporalCoverage={temporalCoverageQuery.data?.coverage ?? null}
              temporalSufficient={temporalCoverageQuery.data?.coverage_sufficient ?? false}
              chapterCount={chapterCount}
              bookId={bookId!}
            />
          </>
        )}

        {!loading && !pageError && !hasHeroJourney && (
          <>
          <div className="nl-empty" id="nl-hero">
            <div className="nl-empty-icon">
              <Compass size={36} />
            </div>
            <h2 className="nl-empty-title">{t('narrative.empty.title')}</h2>
            <div className="nl-empty-msg">{t('narrative.empty.message')}</div>

            {/* Prerequisites, stated before the click rather than after it. */}
            <div className="nl-prereq">
              <div className="nl-prereq-head">{t('narrative.empty.prereqTitle')}</div>
              <PrereqRow
                ready={gate.ready}
                name={t('narrative.empty.prereqSummary')}
                count={t('narrative.empty.summaryCount', { done: gate.done, total: gate.total })}
                hint={gate.ready ? t('narrative.empty.summaryHintOk') : t('narrative.empty.summaryHintMissing', { n: gate.missing })}
                cta={t('narrative.empty.ctaSummary')}
                to={`/books/${bookId}/unraveling`}
              />
              <PrereqRow
                ready={eventReady}
                name={t('narrative.empty.prereqEvents')}
                count={t('narrative.empty.eventCount', { done: eventDone, total: eventTotal })}
                hint={t('narrative.empty.eventHint')}
                cta={t('narrative.empty.ctaEvents')}
                to={`/books/${bookId}/events`}
              />
            </div>

            {heroJourneyOp.llmBlocked && <LlmUnconfiguredNotice />}
            {heroJourneyOp.error && <div className="nl-empty-error">{heroJourneyOp.error}</div>}
            {heroJourneyOp.running ? (
              <div className="nl-progress" role="status">
                <div className="nl-progress-line">
                  <span className="nl-progress-spin" aria-hidden="true" />
                  {heroRunningLabel}
                </div>
                <div className="ss-progress nl-progress-indet" aria-hidden="true">
                  <div className="ss-progress-fill" />
                </div>
              </div>
            ) : (
              <div className="nl-trigger-row">
                <button
                  type="button"
                  id="nl-hero-run"
                  className="ss-btn ss-btn-md ss-btn-primary ss-btn-llm"
                  onClick={() => handleTrigger()}
                  disabled={gate.blocked || runningOp !== null}
                >
                  {t('narrative.empty.trigger')}
                </button>
                <span className={runningOp ? 'nl-busy-note' : 'nl-trigger-reason'} role={runningOp ? 'status' : undefined}>
                  {gate.blocked ? blockedReason : (busyReason ?? t('tension.state.tokenHintShort'))}
                </span>
              </div>
            )}
          </div>
          {structure && (
            <div id="nl-spine">
              <PlotSpine
                structure={structure}
                kernelEvents={kernelSpineQuery.data ?? []}
                bookId={bookId!}
                chapterCount={chapterCount}
                staleNote={spineStaleNote}
              >
                {unclassifiedBlock}
              </PlotSpine>
            </div>
          )}
          </>
        )}
      </div>

      <ConfirmDialog
        open={pendingAction === 'classify'}
        title={t('narrative.unclassified.classifyConfirmTitle')}
        message={t('narrative.unclassified.classifyConfirmBody', { n: unclassifiedIds.length })}
        confirmLabel={t('narrative.unclassified.classify')}
        titleBadge={{ label: t('narrative.unclassified.badgeFree'), tone: 'info' }}
        sections={[{ title: lastClassifyDetail.title, items: lastClassifyDetail.item ? [lastClassifyDetail.item] : [] }]}
        onConfirm={runClassify}
        onCancel={() => setPendingAction(null)}
      />
      <ConfirmDialog
        open={pendingAction === 'refine'}
        title={t('narrative.unclassified.refineConfirmTitle', { n: unclassifiedIds.length })}
        message={t('narrative.unclassified.refineConfirmBody', { n: unclassifiedIds.length })}
        confirmLabel={t('narrative.unclassified.refineConfirm')}
        spendsTokens
        titleBadge={{ label: t('narrative.unclassified.badgeTokens'), tone: 'warning' }}
        sections={[{ title: refineDetail.title, items: refineDetail.item ? [refineDetail.item] : [] }]}
        onConfirm={runRefine}
        onCancel={() => setPendingAction(null)}
      />
    </div>
  );
}
