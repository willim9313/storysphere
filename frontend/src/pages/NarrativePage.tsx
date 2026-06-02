import { useEffect, useMemo } from 'react';
import { useParams } from 'react-router-dom';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { useTranslation } from 'react-i18next';
import { Compass } from 'lucide-react';
import { useBook } from '@/hooks/useBook';
import { useChatContext } from '@/contexts/ChatContext';
import { useTensionTask } from '@/components/tension/hooks/useTensionTask';
import { fetchEventAnalyses } from '@/api/analysis';
import {
  fetchHeroJourneyTask,
  fetchKernelSpine,
  fetchNarrativeStructure,
  reviewNarrativeStructure,
  triggerHeroJourney,
} from '@/api/narrative';
import { getStageTheory, sortStages } from '@/components/narrative/heroJourney';
import { HeroJourneySection } from '@/components/narrative/HeroJourneySection';
import { PlotSpine } from '@/components/narrative/PlotSpine';
import type { EventInfo } from '@/components/narrative/StageDetail';
import { LoadingSpinner } from '@/components/ui/LoadingSpinner';
import '@/styles/narrative.css';

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

  const handleTrigger = () =>
    heroJourneyOp.trigger(
      () => triggerHeroJourney(bookId!, i18n.language.startsWith('zh') ? 'zh' : 'en'),
      t('narrative.errors.triggerHero'),
    );

  const structure = structureQuery.data;
  const stages = useMemo(() => sortStages(structure?.hero_journey_stages ?? []), [structure]);
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
  const hasHeroJourney = stages.length > 0;
  const loading = structureQuery.isLoading || kernelSpineQuery.isLoading;

  return (
    <div className="nl-scroll">
      <div className="nl-page">
        {loading ? (
          <LoadingSpinner />
        ) : hasHeroJourney && structure ? (
          <>
            <HeroJourneySection
              stages={stages}
              theory={theory}
              events={events}
              chapterCount={chapterCount}
              reviewStatus={structure.review_status}
              onReview={(status) => reviewMutation.mutate(status)}
              reviewPending={reviewMutation.isPending}
            />
            <PlotSpine structure={structure} kernelEvents={kernelSpineQuery.data ?? []} bookId={bookId!} chapterCount={chapterCount} />
          </>
        ) : (
          <div className="nl-empty">
            <div className="nl-empty-icon">
              <Compass size={36} />
            </div>
            <div className="nl-empty-title">{t('narrative.empty.title')}</div>
            <div className="nl-empty-msg">{t('narrative.empty.message')}</div>
            {heroJourneyOp.error && <div className="nl-empty-error">{heroJourneyOp.error}</div>}
            <button className="nl-trigger-btn" onClick={handleTrigger} disabled={heroJourneyOp.running}>
              {heroJourneyOp.running
                ? t('narrative.empty.running', { progress: heroJourneyOp.task?.progress ?? 0 })
                : t('narrative.empty.trigger')}
            </button>
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
