import { useEffect, useMemo } from 'react';
import { Link, useParams } from 'react-router-dom';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { useTranslation } from 'react-i18next';
import { AlertTriangle, Compass } from 'lucide-react';
import { useBook } from '@/hooks/useBook';
import { useChatContext } from '@/contexts/ChatContext';
import { useTensionTask } from '@/components/tension/hooks/useTensionTask';
import { fetchChapters } from '@/api/chapters';
import { fetchEventAnalyses } from '@/api/analysis';
import {
  fetchHeroJourneyTask,
  fetchKernelSpine,
  fetchNarrativeStructure,
  reviewNarrativeStructure,
  triggerHeroJourney,
} from '@/api/narrative';
import { getStageTheory, padStages } from '@/components/narrative/heroJourney';
import { HeroJourneySection } from '@/components/narrative/HeroJourneySection';
import { PlotSpine } from '@/components/narrative/PlotSpine';
import type { EventInfo } from '@/components/narrative/StageDetail';
import { LoadingSpinner } from '@/components/ui/LoadingSpinner';
import '@/styles/narrative.css';

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
  const { setPageContext } = useChatContext();
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
    queryKey: ['books', bookId, 'analysis', 'events'],
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

  const structure = structureQuery.data;
  // Padded to the canonical 12 — so `stages.length` no longer says whether an
  // analysis exists; `hasHeroJourney` reads the raw list for that.
  const stages = useMemo(() => padStages(structure?.hero_journey_stages ?? []), [structure]);
  const theory = useMemo(() => getStageTheory(i18n.language), [i18n.language]);

  // Resolve representative_event_ids → title/chapter from kernel spine + event list.
  const events = useMemo(() => {
    const map: Record<string, EventInfo> = {};
    for (const e of kernelSpineQuery.data ?? []) map[e.id] = { title: e.title, chapter: e.chapter };
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
    queryKey: ['books', bookId, 'chapters'],
    queryFn: () => fetchChapters(bookId!),
    enabled: !!bookId && !structureQuery.isLoading && !hasHeroJourney,
  });

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
            />
            <PlotSpine structure={structure} kernelEvents={kernelSpineQuery.data ?? []} bookId={bookId!} chapterCount={chapterCount} />
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
              <div style={{ width: '100%', maxWidth: 1100, marginTop: 28 }}>
                <PlotSpine structure={structure} kernelEvents={kernelSpineQuery.data ?? []} bookId={bookId!} chapterCount={chapterCount} />
              </div>
            )}
          </div>
        )}
      </div>
    </div>
  );
}
