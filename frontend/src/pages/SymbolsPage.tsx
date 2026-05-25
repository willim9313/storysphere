import { useState, useEffect, useMemo } from 'react';
import { useParams } from 'react-router-dom';
import { useQuery, useQueryClient, useMutation } from '@tanstack/react-query';
import { useTranslation } from 'react-i18next';
import { Telescope, BookOpen } from 'lucide-react';

import { useChatContext } from '@/contexts/ChatContext';
import { useBook } from '@/hooks/useBook';
import { LoadingSpinner } from '@/components/ui/LoadingSpinner';
import { ApiError } from '@/api/client';
import {
  fetchSymbols,
  fetchSymbolTimeline,
  fetchCoOccurrences,
  fetchSymbolInterpretation,
  reviewSymbolInterpretation,
  type ImageryEntity,
  type Polarity,
  type SymbolInterpretation,
} from '@/api/symbols';

import { SymbolList, type SymbolSort } from '@/components/symbols/SymbolList';
import { TypePill } from '@/components/symbols/Badges';
import { InterpretationCta } from '@/components/symbols/InterpretationCta';
import { InterpretationGenerating } from '@/components/symbols/InterpretationGenerating';
import { InterpretationHero } from '@/components/symbols/InterpretationHero';
import { ChapterDistChart } from '@/components/symbols/ChapterDistChart';
import { CoOccurrencePanel } from '@/components/symbols/CoOccurrencePanel';
import { OccurrencesTimeline } from '@/components/symbols/OccurrencesTimeline';
import { useSymbolInterpretationTask } from '@/components/symbols/hooks/useSymbolInterpretationTask';

import '@/styles/symbols.css';

const INTERPRETATION_KEY = (bookId: string | undefined, imageryId: string | null) =>
  ['books', bookId, 'symbols', imageryId, 'interpretation'] as const;

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
  const [sort, setSort] = useState<SymbolSort>('freq');
  const [search, setSearch] = useState('');

  const { data: listData, isLoading: listLoading } = useQuery({
    queryKey: ['books', bookId, 'symbols', typeFilter],
    queryFn: () => fetchSymbols(bookId!, { imageryType: typeFilter ?? undefined, limit: 200 }),
    enabled: !!bookId,
  });
  const entities: ImageryEntity[] = useMemo(() => listData?.items ?? [], [listData]);

  // For sort-by-review we need interpretations for every entity. The interpretation
  // queries below are only fired for the selected entity (list view shows
  // review badge only when the user has already opened that imagery). We mirror
  // the cached interpretation in a local lookup so the list keeps its badge
  // after the user navigates away.
  const interpretations = useMemo(() => {
    const map: Record<string, SymbolInterpretation | undefined> = {};
    entities.forEach((e) => {
      const cached = queryClient.getQueryData<SymbolInterpretation | null>(
        INTERPRETATION_KEY(bookId, e.id),
      );
      if (cached) map[e.id] = cached;
    });
    return map;
  }, [entities, queryClient, bookId]);

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

  const { data: interpretation } = useQuery<SymbolInterpretation | null>({
    queryKey: INTERPRETATION_KEY(bookId, selectedId),
    queryFn: async () => {
      try {
        return await fetchSymbolInterpretation(selectedId!, bookId!);
      } catch (err) {
        if (err instanceof ApiError && err.status === 404) return null;
        throw err;
      }
    },
    enabled: !!selectedId && !!bookId,
    retry: false,
  });

  // ── Generation task ──────────────────────────────────────────
  const refetchInterpretation = () => {
    if (selectedId && bookId) {
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
    onSuccess: () => {
      void queryClient.invalidateQueries({ queryKey: INTERPRETATION_KEY(bookId, selectedId) });
    },
  });

  const reviewError = reviewMutation.isError ? t('symbol.error.reviewFailed') : null;

  const handleApprove = () => reviewMutation.mutate({ status: 'approved' });
  const handleReject = () => reviewMutation.mutate({ status: 'rejected' });
  const handleSubmitModify = (theme: string, polarity: Polarity) =>
    reviewMutation.mutate({ status: 'modified', theme, polarity });

  // ── Computed ─────────────────────────────────────────────────
  const selected = entities.find((e) => e.id === selectedId) ?? null;
  const totalChapters = useMemo(() => {
    const fromBook = book?.chapterCount;
    if (fromBook && fromBook > 0) return fromBook;
    return Math.max(
      20,
      entities.reduce((acc, e) => {
        const last = Object.keys(e.chapter_distribution)
          .map(Number)
          .reduce((m, n) => Math.max(m, n), 0);
        return Math.max(acc, last);
      }, 0),
    );
  }, [book, entities]);

  const isGenerating = interpretationTask.running && selectedId !== null;

  let interpretationBlock: React.ReactNode;
  if (isGenerating) {
    interpretationBlock = <InterpretationGenerating task={interpretationTask.task} />;
  } else if (interpretation) {
    interpretationBlock = (
      <InterpretationHero
        key={interpretation.id}
        entity={selected!}
        interpretation={interpretation}
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
    detailBody = <EmptyState hasData={entities.length > 0} />;
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
          coOccurrences={coOccurrences}
          linkedCharacterIds={interpretation?.linked_characters ?? []}
          linkedEventIds={interpretation?.linked_events ?? []}
          loading={coLoading}
          onSelectCo={setSelectedId}
        />

        <OccurrencesTimeline
          timeline={timeline}
          loading={timelineLoading}
          term={selected.term}
          aliases={selected.aliases}
        />
      </>
    );
  }

  return (
    <div className="sym-page">
      <SymbolList
        entities={entities}
        interpretations={interpretations}
        selectedId={selectedId}
        onSelect={setSelectedId}
        typeFilter={typeFilter}
        setTypeFilter={setTypeFilter}
        sort={sort}
        setSort={setSort}
        search={search}
        setSearch={setSearch}
        totalChapters={totalChapters}
      />

      <main className="sym-detail">{detailBody}</main>
    </div>
  );
}

function ChapterCard({ entity, totalChapters }: Readonly<{ entity: ImageryEntity; totalChapters: number }>) {
  const { t } = useTranslation('analysis');
  const peakChapters = useMemo(() => {
    return Object.entries(entity.chapter_distribution)
      .map(([ch, cnt]) => ({ ch: Number(ch), cnt }))
      .sort((a, b) => b.cnt - a.cnt)
      .slice(0, 3)
      .map((e) => e.ch);
  }, [entity.chapter_distribution]);
  const peakLabel = peakChapters.length > 0 ? t('symbol.peakChapters', { chapter: peakChapters[0] }) : null;
  return (
    <section className="sym-card">
      <div className="sym-card-head">
        <BookOpen size={13} style={{ color: 'var(--accent)' }} />
        <span className="sym-card-title">{t('symbol.chapterDist')}</span>
        <span className="sym-card-meta">
          {t('symbol.firstSeen', { chapter: entity.first_chapter ?? '?' })}
          {peakLabel && <> · {peakLabel}</>}
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

function EmptyState({ hasData }: Readonly<{ hasData: boolean }>) {
  const { t } = useTranslation('analysis');
  return (
    <div className="sym-empty">
      <div className="sym-empty-icon">
        <Telescope size={40} />
      </div>
      <h2 className="sym-empty-title">
        {hasData ? t('symbol.selectPrompt') : t('symbol.emptyTitle')}
      </h2>
      <p className="sym-empty-desc">{hasData ? t('symbol.selectPromptDesc') : t('symbol.emptyHint')}</p>
    </div>
  );
}
