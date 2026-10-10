import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { useParams, useLocation, Link } from 'react-router-dom';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { Search, ExternalLink, AlertCircle, ArrowLeft, X } from 'lucide-react';
import { Trans, useTranslation } from 'react-i18next';
import '@/styles/character-analysis.css';
import { useChatDispatch } from '@/contexts/ChatContext';
import { useToast } from '@/contexts/ToastContext';
import { useBook } from '@/hooks/useBook';
import { useCharacterAnalysis } from '@/hooks/useCharacterAnalysis';
import { useEventAnalysis } from '@/hooks/useEventAnalysis';
import {
  fetchEntityAnalysis,
  triggerEntityAnalysis,
  triggerBatchEntityAnalysis,
  fetchActiveEntityBatch,
} from '@/api/analysis';
import { failureKind, isLlmUnconfigured, techDetailOf } from '@/api/failureKind';
import {
  CharacterAnalysisDetail,
  type OverviewSubTab,
} from '@/components/analysis/CharacterAnalysisDetail';
import { EpistemicStateSection } from '@/components/analysis/EpistemicStateSection';
import { VoiceProfilingPanel } from '@/components/analysis/VoiceProfilingPanel';
import { FrameworkCompareDrawer } from '@/components/analysis/FrameworkCompareDrawer';
import { EpistemicCompareDrawer } from '@/components/analysis/EpistemicCompareDrawer';
import { CharacterGenerating } from '@/components/analysis/CharacterGenerating';
import { GuidanceRibbon } from '@/components/ui/GuidanceRibbon';
import { LlmUnconfiguredNotice } from '@/components/ui/LlmUnconfiguredNotice';
import { PageFailure } from '@/components/ui/PageFailure';
import { Tooltip } from '@/components/ui/Tooltip';
import { AnalyzedItem, UnanalyzedItem } from '@/components/analysis/AnalysisListItems';
import { ArchetypeFilterDropdown } from '@/components/analysis/ArchetypeFilterDropdown';
import { CharacterOverviewLanding } from '@/components/analysis/overview/CharacterOverviewLanding';
import { UnanalyzedCharacterDetail } from '@/components/analysis/UnanalyzedCharacterDetail';
import {
  archetypeDisplayName,
  archetypeKey,
  archetypeState,
} from '@/components/analysis/characterModel';
import { LoadingSpinner } from '@/components/ui/LoadingSpinner';
import { ConfirmDialog } from '@/components/ui/ConfirmDialog';
import { useAsyncTask } from '@/hooks/useAsyncTask';
import { BatchEepPanel } from '@/components/analysis/BatchEepPanel';
import { failedCountOf, liveFailedIds } from '@/components/analysis/batchPanelModel';
import { useBatchTask } from '@/hooks/useBatchTask';
import { qk } from '@/api/queryKeys';

/** Search matches the name, and for analyzed characters, also the current
 *  framework's archetype label (e.g. searching "統治者" finds that archetype). */
function matchesQuery(query: string, name: string, archetype?: string): boolean {
  if (!query) return true;
  const q = query.toLowerCase();
  return name.toLowerCase().includes(q) || !!archetype?.toLowerCase().includes(q);
}

type Framework = 'jung' | 'schmidt';
type PrimaryTab = 'overview' | 'voice' | 'epistemic';

const PRIMARY_TABS: PrimaryTab[] = ['overview', 'voice', 'epistemic'];

/** Group head count: just the total, or "shown / total" while search or the
 *  archetype filter is narrowing the group. */
function groupCount(shown: number, total: number): string {
  return shown === total ? String(total) : `${shown} / ${total}`;
}

export default function CharacterAnalysisPage() {
  const queryClient = useQueryClient();
  const { bookId } = useParams<{ bookId: string }>();
  const { setPageContext } = useChatDispatch();
  const { data: book } = useBook(bookId);
  const { t, i18n } = useTranslation('analysis');
  const { push } = useToast();
  const { t: tc } = useTranslation('common');
  const { t: tn } = useTranslation('nav');

  const location = useLocation();
  const searchInputRef = useRef<HTMLInputElement>(null);

  const [framework, setFramework] = useState<Framework>('jung');
  const [archFilter, setArchFilter] = useState<string[]>([]);
  const [searchQuery, setSearchQuery] = useState('');
  const [selectedEntityId, setSelectedEntityId] = useState<string | null>(
    (location.state as { selectId?: string } | null)?.selectId ?? null,
  );
  const [primaryTab, setPrimaryTab] = useState<PrimaryTab>('overview');
  const [overviewSubTab, setOverviewSubTab] = useState<OverviewSubTab>('persona');
  const [confirmRegenerate, setConfirmRegenerate] = useState(false);
  // Page-level drawer state: only one of the two right-side drawers (#10
  // epistemic compare, framework compare) may be open at a time.
  const [drawerOpen, setDrawerOpen] = useState<null | 'framework' | 'epistemic'>(null);
  // Seeds the epistemic-compare drawer's shared cursor with whatever chapter
  // the epistemic tab's own cursor was on when "對照另一角色" was clicked.
  const [epistemicCompareChapter, setEpistemicCompareChapter] = useState(1);
  const [generatingId, setGeneratingId] = useState<string | null>(null);
  const [triggerError, setTriggerError] = useState<string | null>(null);
  // 「尚未設定 LLM provider」（503 + 應用層 body）是功能層狀態：就地顯示，
  // 已分析的結果照常可讀——失敗的只是「生成」這個動作。
  const [llmBlocked, setLlmBlocked] = useState(false);

  // #11 tiered batch: 'top10' analyzes the top-10-by-mentionCount unanalyzed
  // characters (entityIds subset), 'all' analyzes everything unanalyzed.
  const [batchMode, setBatchMode] = useState<'top10' | 'all' | null>(null);
  // 「只看失敗」：把左欄清單篩到上一批失敗的角色（本次瀏覽才有）。
  const [failedOnly, setFailedOnly] = useState(false);

  useEffect(() => {
    if (book) setPageContext({ page: 'analysis', bookId, bookTitle: book.title, analysisTab: 'characters' });
    return () => setPageContext({ page: 'other' });
  }, [book, bookId, setPageContext]);

  const {
    data: charData,
    isLoading,
    error: charError,
    refetch: refetchChars,
  } = useCharacterAnalysis(bookId);
  // #5 behavior-pane keyEvents -> event analysis page name matching.
  const { data: eventData } = useEventAnalysis(bookId);

  // Generation task for the selected character. The id is deliberately kept
  // after a failure: the error panel below is rendered from `gen.task`, and
  // clearing the id would take it off screen.
  const gen = useAsyncTask({
    defaultError: t('triggerFailed'),
    onDone: (_task, { reset }) => {
      queryClient.invalidateQueries({
        queryKey: qk.entity.analysis(bookId, selectedEntityId),
      });
      queryClient.invalidateQueries({ queryKey: qk.analysis.characters(bookId) });
      reset();
      setGeneratingId(null);
    },
  });

  const {
    data: entityAnalysis,
    isLoading: analysisLoading,
    error: analysisError,
    refetch: refetchAnalysis,
  } = useQuery({
    queryKey: qk.entity.analysis(bookId, selectedEntityId),
    queryFn: () => fetchEntityAnalysis(bookId!, selectedEntityId!),
    // Pause while a generation task runs. The old analysis is no longer
    // deleted up front, so this is not about avoiding a 404 any more — it just
    // keeps the cached result untouched until the run lands, which is what
    // makes a failed re-run recoverable.
    enabled: !!bookId && !!selectedEntityId && !gen.taskId,
  });

  // Every token-spending trigger (建立, 覆蓋重新生成, 重試失敗部分) fails the same
  // way: a 503 carrying the app's own body means no LLM provider is configured.
  // Say that in place; anything else is the generic trigger failure.
  const onTriggerStart = () => {
    setTriggerError(null);
    setLlmBlocked(false);
  };
  const onTriggerFailed = (err: unknown) => {
    if (isLlmUnconfigured(err)) {
      setLlmBlocked(true);
      setTriggerError(null);
    } else {
      setTriggerError(t('triggerFailed'));
    }
  };

  const triggerMutation = useMutation({
    mutationFn: (id: string) => triggerEntityAnalysis(bookId!, id),
    onMutate: onTriggerStart,
    onSuccess: (data) => gen.adopt(data.taskId),
    onError: (err) => {
      setGeneratingId(null);
      onTriggerFailed(err);
    },
  });

  // Retry only the failed parts of a partial result (reuses cached CEP).
  const retryFailedMutation = useMutation({
    mutationFn: (id: string) => triggerEntityAnalysis(bookId!, id, 'retryFailed'),
    onMutate: onTriggerStart,
    onSuccess: (data) => gen.adopt(data.taskId),
    onError: onTriggerFailed,
  });

  const handleSelectEntity = useCallback((id: string) => {
    setSelectedEntityId(id);
    // Reset sub-tab when switching characters so each one starts at persona
    setOverviewSubTab('persona');
    setDrawerOpen(null);
  }, []);

  // #1 回程路徑: leaves the detail/unanalyzed view and returns to the cast
  // overview landing.
  const handleBackToOverview = useCallback(() => {
    setSelectedEntityId(null);
  }, []);

  const handleGenerate = (id: string) => {
    setGeneratingId(id);
    handleSelectEntity(id);
    triggerMutation.mutate(id);
  };

  const handleRegenerate = () => {
    if (!selectedEntityId || !bookId) return;
    // No delete first. `mode: 'full'` re-analyses server-side and only
    // overwrites the cache once the new result lands, so deleting up front
    // would throw away a working analysis whenever the re-run then fails.
    // EventAnalysisPage has always done it this way; this page was the
    // outlier. The generating view no longer depends on the data being gone —
    // the branch below keys off `gen.taskId` instead.
    triggerMutation.mutate(selectedEntityId);
  };

  // 失敗面板的「重試」：和「生成分析」一樣會花 token（鈕上掛 LLM 字符），
  // 所以是真的重新送出，不只是把面板收掉。
  const handleRetryGeneration = () => {
    gen.reset();
    triggerMutation.reset();
    if (!selectedEntityId) return;
    setGeneratingId(selectedEntityId);
    triggerMutation.mutate(selectedEntityId);
  };

  const refreshCast = useCallback(
    () => queryClient.invalidateQueries({ queryKey: qk.analysis.characters(bookId) }),
    [queryClient, bookId],
  );

  const [batchLlmBlocked, setBatchLlmBlocked] = useState(false);
  const batch = useBatchTask<string[]>({
    i18nPrefix: 'character.batch',
    trigger: async (entityIds) => {
      setBatchLlmBlocked(false);
      try {
        return await triggerBatchEntityAnalysis(bookId!, entityIds);
      } catch (err) {
        // useBatchTask only keeps a message, so the 503 distinction is made here.
        if (isLlmUnconfigured(err)) setBatchLlmBlocked(true);
        throw err;
      }
    },
    onProgress: refreshCast,
    onDone: (summary) => {
      refreshCast();
      if (!summary) return;
      // Same as the events page (DS v3 第 5 批 · 09·10 C 區): the toast is only a
      // completion notice and auto-dismisses. Failures stay as a count plus
      // 「只看失敗」 in the left-column panel, and as marked rows in the list.
      // `warning` when something failed: a partial run is not a clean success.
      const hasFailures = (summary.failures?.length ?? 0) > 0;
      push({
        type: hasFailures ? 'warning' : 'success',
        title: t('character.batch.toastTitle'),
        body: t('character.batch.toastBody', {
          generated: summary.progress - summary.skipped - summary.failed,
          skipped: summary.skipped,
          failed: summary.failed,
        }),
      });
    },
    failureMessage: t('character.batch.triggerFailed'),
    resume: { key: bookId, fetch: () => fetchActiveEntityBatch(bookId!) },
  });
  const startBatch = (ids?: string[]) => {
    setFailedOnly(false);
    batch.start(ids);
  };

  // Failed characters of the last run that are still unanalyzed (面板失敗數、清單篩選與列上記號共用)。
  const failedIds = useMemo(
    () =>
      liveFailedIds(
        batch.summary,
        (charData?.unanalyzed ?? []).map((u) => u.id),
        'characters',
      ),
    [batch.summary, charData],
  );
  const failedCount = failedCountOf(batch.summary, failedIds);
  const failedSet = useMemo(() => new Set(failedIds), [failedIds]);
  const failedFilterOn = failedOnly && failedIds.length > 0;

  const selectedAnalyzed = charData?.analyzed.find((a) => a.entityId === selectedEntityId);
  const selectedUnanalyzed = charData?.unanalyzed.find((u) => u.id === selectedEntityId);

  // Both lists are memoized, and deliberately so: `flatNavList` below takes them
  // as deps, and the ↑/↓ keyboard effect takes `flatNavList`. Rebuilding these
  // arrays every render made that useMemo miss every time, which in turn tore
  // down and re-attached the window keydown listener on every single render.
  // #14 archetype filter only applies to the analyzed group (dropdown is
  // scoped to "篩選已分析角色"), and resets whenever the framework switches.
  const filteredAnalyzed = useMemo(
    () =>
      (failedFilterOn ? [] : (charData?.analyzed ?? []))
        .filter((a) =>
          matchesQuery(
            searchQuery,
            a.title,
            archetypeDisplayName(framework, a.archetypes?.[framework], i18n.language),
          ),
        )
        .filter(
          (a) => archFilter.length === 0 || archFilter.includes(archetypeKey(framework, a.archetypes?.[framework])),
        )
        .sort((a, b) => b.mentionCount - a.mentionCount),
    [charData, searchQuery, framework, archFilter, failedFilterOn, i18n.language],
  );
  const filteredUnanalyzed = useMemo(
    () =>
      (charData?.unanalyzed ?? [])
        .filter((u) => matchesQuery(searchQuery, u.name))
        .filter((u) => !failedFilterOn || failedSet.has(u.id))
        .sort((a, b) => b.mentionCount - a.mentionCount),
    [charData, searchQuery, failedFilterOn, failedSet],
  );

  const totalCharacters = (charData?.analyzed.length ?? 0) + (charData?.unanalyzed.length ?? 0);
  const maxMentionCount = Math.max(
    0,
    ...(charData?.analyzed.map((a) => a.mentionCount) ?? []),
    ...(charData?.unanalyzed.map((u) => u.mentionCount) ?? []),
  );

  // #11 "先生成前 10 位要角": top-10-by-mentionCount unanalyzed entity ids.
  const top10UnanalyzedIds = [...(charData?.unanalyzed ?? [])]
    .sort((a, b) => b.mentionCount - a.mentionCount)
    .slice(0, 10)
    .map((u) => u.id);

  // #3 relations-pane target click-through: full character roster (analyzed +
  // unanalyzed) so a `cep.relations[].target` name can be matched to an
  // entityId regardless of that character's own analysis status.
  const characterRoster = useMemo(
    () => [
      ...(charData?.analyzed ?? []).map((a) => ({ name: a.title, id: a.entityId })),
      ...(charData?.unanalyzed ?? []).map((u) => ({ name: u.name, id: u.id })),
    ],
    [charData],
  );
  // #5 behavior-pane keyEvents -> event analysis page name matching.
  const eventRoster = useMemo(
    () => [
      ...(eventData?.analyzed ?? []).map((a) => ({ name: a.title, id: a.entityId })),
      ...(eventData?.unanalyzed ?? []).map((u) => ({ name: u.name, id: u.id })),
    ],
    [eventData],
  );

  // Flattened, filtered+sorted list (analyzed → unanalyzed) for ↑/↓ keyboard nav.
  const flatNavList = useMemo(
    () => [
      ...filteredAnalyzed.map((a) => a.entityId),
      ...filteredUnanalyzed.map((u) => u.id),
    ],
    [filteredAnalyzed, filteredUnanalyzed],
  );

  // #13 keyboard operation: ↑/↓ moves through the left list, / focuses search,
  // 1/2/3 switches primary tabs (only once an analyzed character is selected).
  // Ignored entirely while focus is in an input/textarea/select/contenteditable
  // (search box, epistemic chapter slider, native <select> that uses ↑/↓ itself),
  // on a role=tab (tablists own ←/→/↓ roving focus), or anywhere inside a
  // role=dialog. While a compare drawer is open every shortcut is off, so ↓ in
  // the drawer can't switch the primary character and close it underneath.
  useEffect(() => {
    const onKeyDown = (e: KeyboardEvent) => {
      const target = e.target as HTMLElement | null;
      const tag = target?.tagName;
      const isEditable =
        tag === 'INPUT' || tag === 'TEXTAREA' || tag === 'SELECT' || !!target?.isContentEditable;
      if (isEditable) return;
      if (drawerOpen !== null) return;
      if (target?.closest('[role="tab"], [role="dialog"]')) return;

      if (e.key === '/') {
        e.preventDefault();
        searchInputRef.current?.focus();
        return;
      }

      if (e.key === 'ArrowDown' || e.key === 'ArrowUp') {
        if (flatNavList.length === 0) return;
        e.preventDefault();
        const currentIndex = flatNavList.indexOf(selectedEntityId ?? '');
        const delta = e.key === 'ArrowDown' ? 1 : -1;
        const nextIndex =
          currentIndex === -1 ? 0 : (currentIndex + delta + flatNavList.length) % flatNavList.length;
        const nextId = flatNavList[nextIndex];
        handleSelectEntity(nextId);
        document.getElementById(`ca-list-item-${nextId}`)?.scrollIntoView({ block: 'nearest' });
        return;
      }

      if (e.key === '1' || e.key === '2' || e.key === '3') {
        if (!selectedAnalyzed) return;
        const tab = PRIMARY_TABS[Number(e.key) - 1];
        if (tab) {
          e.preventDefault();
          setPrimaryTab(tab);
        }
      }
    };
    window.addEventListener('keydown', onKeyDown);
    return () => window.removeEventListener('keydown', onKeyDown);
  }, [flatNavList, selectedEntityId, selectedAnalyzed, handleSelectEntity, drawerOpen]);

  if (isLoading) return <LoadingSpinner />;

  // Header badge: archetype of the active framework — or why there is none.
  const fwName = framework === 'jung' ? 'Jung' : 'Schmidt';
  const headerArchetype = (() => {
    if (!entityAnalysis) return null;
    const state = archetypeState(entityAnalysis, framework);
    if (state === 'ready') {
      const primary = archetypeDisplayName(
        framework,
        entityAnalysis.archetypes.find((a) => a.framework === framework)?.primary,
        i18n.language,
      );
      return { cls: 'ss-badge ss-badge-info', text: `${fwName} · ${primary}` };
    }
    if (state === 'failed') {
      return { cls: 'ss-badge ss-badge-error', text: `${fwName} · ${t('character.persona.archetypeFailed')}` };
    }
    return { cls: 'ss-badge', text: `${fwName} · ${t('character.persona.archetypeNotGenerated')}` };
  })();

  const pageName = tn('tabs.characterAnalysis');
  const backToBook = (
    <Link to={`/books/${bookId}`} className="ss-btn ss-btn-md ss-btn-secondary">
      {t('character.error.backToBook')}
    </Link>
  );

  const retryFailed = () => {
    if (selectedEntityId) retryFailedMutation.mutate(selectedEntityId);
  };
  // A batch 503 shows in the panel (BatchEepPanel) instead of up here.
  const showLlmNotice = llmBlocked;

  // 「← 角色總覽」：詳情態放在標題列名字之前（09 D 區）；其他有選角的態（未分析、
  // 生成中、失敗）沒有標題列，退回內容區頂端，免得失去回程路徑。
  const backLink = (
    <button type="button" className="ca-back-link" onClick={handleBackToOverview}>
      <ArrowLeft size={12} /> {t('character.overview.backToOverview')}
    </button>
  );
  const inDetail = !!(selectedEntityId && !analysisLoading && entityAnalysis && !gen.taskId);

  let body: React.ReactNode;
  if (selectedEntityId && analysisLoading) {
    body = <LoadingSpinner />;
  } else if (selectedEntityId && entityAnalysis && !gen.taskId) {
    body = (
      <>
        {/* Title bar */}
        <div className="ca-titlebar">
          <div className="ca-titlebar-main">
            {backLink}
            {selectedAnalyzed?.status === 'partial' && <span className="ca-title-dot" aria-hidden="true" />}
            <h1 className="ca-title">{entityAnalysis.entityName}</h1>
            {selectedAnalyzed && headerArchetype && (
              <span className={headerArchetype.cls}>{headerArchetype.text}</span>
            )}
            {selectedAnalyzed && (
              <span className="ca-title-meta">
                {t('character.list.mentionCount', { count: selectedAnalyzed.mentionCount })}
              </span>
            )}
            {selectedAnalyzed?.status === 'partial' && (
              <span className="ss-badge ss-badge-warning">{t('event.partialBadge')}</span>
            )}
            {entityAnalysis.isStale && (
              <Tooltip label={t('character.stale.tooltip')}>
                <span className="ss-badge ss-badge-info" tabIndex={0}>
                  {t('character.stale.badge')}
                </span>
              </Tooltip>
            )}
          </div>
          <div className="ca-titlebar-actions">
            <button
              type="button"
              className="ss-btn ss-btn-sm ss-btn-secondary"
              onClick={() => setDrawerOpen('framework')}
            >
              {t('character.compare.open')}
            </button>
            <Link
              to={`/books/${bookId}/graph?entity=${selectedEntityId}`}
              className="ss-btn ss-btn-sm ss-btn-ghost"
            >
              {t('viewInGraph')} <ExternalLink size={11} />
            </Link>
            {entityAnalysis.status === 'partial' && (
              <button
                type="button"
                className="ss-btn ss-btn-sm ss-btn-secondary ss-btn-llm"
                disabled={retryFailedMutation.isPending}
                onClick={retryFailed}
              >
                {t('character.persona.retryFailed')}
              </button>
            )}
            <button
              type="button"
              className="ss-btn ss-btn-sm ss-btn-secondary ss-btn-llm"
              onClick={() => setConfirmRegenerate(true)}
            >
              {t('regenerate')}
            </button>
          </div>
        </div>

        {/* Primary tabs */}
        <div className="ss-utabs" role="tablist">
          {PRIMARY_TABS.map((tab) => (
            <button
              key={tab}
              type="button"
              role="tab"
              aria-selected={primaryTab === tab}
              className={'ss-utab' + (primaryTab === tab ? ' active' : '')}
              onClick={() => setPrimaryTab(tab)}
            >
              {t(`character.tabs.${tab}`)}
            </button>
          ))}
        </div>

        {/* Tab panels */}
        {primaryTab === 'overview' && (
          <CharacterAnalysisDetail
            data={entityAnalysis}
            framework={framework}
            subTab={overviewSubTab}
            onSubTabChange={setOverviewSubTab}
            onOpenCompare={() => setDrawerOpen('framework')}
            onRegenerate={() => setConfirmRegenerate(true)}
            isRegenerating={
              triggerMutation.isPending || (!!gen.taskId && gen.task?.status !== 'done')
            }
            onRetryFailed={retryFailed}
            isRetrying={retryFailedMutation.isPending}
            bookId={bookId!}
            chapterCount={book?.chapterCount ?? 0}
            characterRoster={characterRoster}
            eventRoster={eventRoster}
            onSelectCharacter={handleSelectEntity}
          />
        )}
        {primaryTab === 'voice' && bookId && selectedEntityId && (
          <VoiceProfilingPanel bookId={bookId} entityId={selectedEntityId} />
        )}
        {primaryTab === 'epistemic' && bookId && selectedEntityId && book && (
          <EpistemicStateSection
            bookId={bookId}
            characterId={selectedEntityId}
            totalChapters={book.chapterCount}
            onOpenCompare={(currentChapter) => {
              setEpistemicCompareChapter(currentChapter);
              setDrawerOpen('epistemic');
            }}
          />
        )}
      </>
    );
  } else if (gen.task?.status === 'error') {
    // The task id stays on screen on purpose: it is what you quote when reporting
    // the failure, and the panel is rendered from `gen.task`, so it must outlive
    // the failure. The message is the backend's own, unrewritten.
    body = (
      <div className="ca-gen">
        <div className="ca-gen-card ca-gen-fail">
          <div className="ca-gen-fail-head">
            <AlertCircle size={16} />
            <span>{t('analysisFailed')}</span>
          </div>
          {gen.task.error && <code className="ca-gen-fail-msg">{gen.task.error}</code>}
          <span className="ca-gen-fail-id">
            {t('character.generating.taskLabel')} {gen.taskId}
          </span>
          <button
            type="button"
            className="ss-btn ss-btn-sm ss-btn-secondary ss-btn-llm"
            onClick={handleRetryGeneration}
          >
            {tc('retry')}
          </button>
        </div>
      </div>
    );
  } else if (gen.taskId && gen.task?.status !== 'done') {
    body = (
      <CharacterGenerating
        task={gen.task}
        name={selectedUnanalyzed?.name ?? selectedAnalyzed?.title ?? ''}
      />
    );
  } else if (selectedUnanalyzed) {
    body = (
      <UnanalyzedCharacterDetail
        bookId={bookId!}
        entityId={selectedUnanalyzed.id}
        name={selectedUnanalyzed.name}
        mentionCount={selectedUnanalyzed.mentionCount}
        onGenerate={() => handleGenerate(selectedUnanalyzed.id)}
        generating={triggerMutation.isPending}
      />
    );
  } else if (selectedEntityId && analysisError && selectedAnalyzed) {
    body = (
      <PageFailure
        variant={failureKind(analysisError)}
        pageName={pageName}
        onRetry={() => void refetchAnalysis()}
        secondaryAction={backToBook}
        techDetail={techDetailOf(analysisError)}
      />
    );
  } else if (charData) {
    body = (
      <CharacterOverviewLanding
        bookId={bookId!}
        charData={charData}
        onSelectEntity={handleSelectEntity}
        onGenerate={handleGenerate}
        generatingId={generatingId}
      />
    );
  } else {
    // The #6a list itself failed to load (isLoading already gated the spinner).
    body = (
      <PageFailure
        variant={failureKind(charError)}
        pageName={pageName}
        onRetry={() => void refetchChars()}
        secondaryAction={backToBook}
        techDetail={techDetailOf(charError)}
      />
    );
  }

  return (
    <div className="ca-page">
      <div className="ca-body">
        {/* ── Left panel ── */}
        <aside className="ca-left">
          <div className="ca-left-top">
            {/* Book-level batch actions live in the one column both views share,
                above the framework axis (09·10): reachable with a character selected. */}
            {/* With no characters the panel is only disabled buttons (0/0); hide it. */}
            {charData && bookId && totalCharacters > 0 && (
              <BatchEepPanel
                bookId={bookId}
                page="characters"
                i18nPrefix="character.batch"
                analyzedCount={charData.analyzed.length}
                totalCount={totalCharacters}
                batchTask={batch.task}
                stage={batch.stage}
                isBatchRunning={batch.running}
                batchError={batchLlmBlocked ? null : batch.error}
                batchSummary={batch.summary}
                onTrigger={() => setBatchMode('all')}
                llmBlocked={batchLlmBlocked}
                isPending={batch.pending}
                pendingLine={t('character.batch.statusLine', { count: charData.unanalyzed.length })}
                failedCount={failedCount}
                onShowFailures={failedIds.length > 0 ? () => setFailedOnly(true) : undefined}
                topSubset={{
                  count: top10UnanalyzedIds.length,
                  onTrigger: () => setBatchMode('top10'),
                }}
              />
            )}
            <div className="ca-left-fx">
              <span className="ca-left-label">{t('character.list.frameworkLabel')}</span>
              <div className="ca-fw-chips">
                {(['jung', 'schmidt'] as Framework[]).map((f) => (
                  <button
                    key={f}
                    type="button"
                    className={'ca-fw-chip' + (framework === f ? ' active' : '')}
                    aria-pressed={framework === f}
                    onClick={() => {
                      setFramework(f);
                      setArchFilter([]);
                    }}
                  >
                    {f === 'jung' ? 'Jung 12' : 'Schmidt 45'}
                  </button>
                ))}
              </div>
              <span className="ca-left-note">{t('character.list.frameworkNote')}</span>
            </div>

            <div className="ca-search">
              <Search size={14} />
              <input
                ref={searchInputRef}
                type="text"
                placeholder={t('character.list.searchPlaceholder', { count: totalCharacters })}
                value={searchQuery}
                onChange={(e) => setSearchQuery(e.target.value)}
              />
            </div>

            <ArchetypeFilterDropdown
              framework={framework}
              analyzed={charData?.analyzed ?? []}
              selected={archFilter}
              onChange={setArchFilter}
            />

            <div className="ca-fw-meta">
              <button
                type="button"
                className="ss-btn ss-btn-sm ss-btn-secondary"
                onClick={() => {
                  if (entityAnalysis) setDrawerOpen('framework');
                }}
                disabled={!entityAnalysis}
              >
                {t('character.compare.fromSidebar')}
              </button>
              <Link to={`/methodology?framework=${framework}`}>
                {t('frameworkIndex')} <ExternalLink size={10} />
              </Link>
            </div>
          </div>

          {failedIds.length > 0 && (
            <div className="ca-fail-row">
              <button
                type="button"
                className={'ca-fail-chip' + (failedFilterOn ? ' active' : '')}
                aria-pressed={failedFilterOn}
                onClick={() => setFailedOnly(!failedFilterOn)}
              >
                {t('character.batch.failedShort', { count: failedIds.length })}
              </button>
            </div>
          )}

          <div className="ca-list">
            {charData && totalCharacters === 0 && (
              // Group-head row: same inset and muted 2xs as the group labels it replaces.
              <p className="ca-list-group-head" style={{ margin: 0 }}>{t('character.list.empty')}</p>
            )}
            {filteredAnalyzed.length > 0 && (
              <div className="ca-list-group">
                <div className="ca-list-group-head">
                  <span>{t('analyzed')}</span>
                  <span className="count">
                    {groupCount(filteredAnalyzed.length, charData?.analyzed.length ?? 0)}
                  </span>
                </div>
                <div className="ca-list-rows">
                  {filteredAnalyzed.map((item) => (
                    <AnalyzedItem
                      key={item.id}
                      itemId={`ca-list-item-${item.entityId}`}
                      item={item}
                      isSelected={selectedEntityId === item.entityId}
                      onSelect={() => handleSelectEntity(item.entityId)}
                      maxMentionCount={maxMentionCount}
                    />
                  ))}
                </div>
              </div>
            )}
            {filteredUnanalyzed.length > 0 && (
              <div className="ca-list-group">
                <div className="ca-list-group-head">
                  <span>{t('notAnalyzed')}</span>
                  <span className="count">
                    {groupCount(filteredUnanalyzed.length, charData?.unanalyzed.length ?? 0)}
                  </span>
                </div>
                <div className="ca-list-rows">
                  {filteredUnanalyzed.map((item) => (
                    <UnanalyzedItem
                      key={item.id}
                      itemId={`ca-list-item-${item.id}`}
                      item={item}
                      isSelected={selectedEntityId === item.id}
                      onSelect={() => handleSelectEntity(item.id)}
                      onGenerate={() => handleGenerate(item.id)}
                      isGenerating={generatingId === item.id}
                      failed={failedSet.has(item.id)}
                      maxMentionCount={maxMentionCount}
                    />
                  ))}
                </div>
              </div>
            )}
          </div>
        </aside>

        {/* ── Content area ── */}
        <div className="ca-content">
          <div className="ca-content-scroll">
            <div className="ca-content-inner">
              {/* 研究者導覽條只在總覽（landing）出現（09 A 區）。 */}
              {!selectedEntityId && (
                <GuidanceRibbon surface="character-analysis">
                  <strong>{t('character.tip.prefix')}</strong>{' '}
                  <Trans
                    i18nKey="character.tip.body"
                    ns="analysis"
                    components={{ strong: <strong /> }}
                  />
                </GuidanceRibbon>
              )}

              {showLlmNotice && <LlmUnconfiguredNotice />}
              {triggerError && (
                <div className="ca-inline-banner" role="alert">
                  <span>{triggerError}</span>
                  <button
                    type="button"
                    className="ss-btn ss-btn-sm ss-btn-ghost"
                    onClick={() => setTriggerError(null)}
                    aria-label={tc('confirm')}
                  >
                    <X size={12} />
                  </button>
                </div>
              )}

              {selectedEntityId && !inDetail && backLink}
              {body}
            </div>
          </div>

          {/* Compare drawers overlay content area only; page-level drawerOpen
              guarantees only one of the two is ever open at once. */}
          <FrameworkCompareDrawer
            open={drawerOpen === 'framework'}
            data={entityAnalysis}
            onClose={() => setDrawerOpen(null)}
          />
          <EpistemicCompareDrawer
            open={drawerOpen === 'epistemic'}
            onClose={() => setDrawerOpen(null)}
            bookId={bookId}
            totalChapters={book?.chapterCount ?? 0}
            characterAId={selectedEntityId}
            characterAName={entityAnalysis?.entityName ?? ''}
            initialChapter={epistemicCompareChapter}
            roster={characterRoster}
          />
        </div>
      </div>

      <ConfirmDialog
        open={confirmRegenerate}
        title={t('regenerateTitle')}
        message={t('regenerateMessage')}
        spendsTokens
        onConfirm={() => {
          setConfirmRegenerate(false);
          handleRegenerate();
        }}
        onCancel={() => setConfirmRegenerate(false)}
      />

      <ConfirmDialog
        open={batchMode !== null}
        title={
          batchMode === 'top10'
            ? t('character.batch.confirmTop10Title')
            : t('character.batch.confirmTitle')
        }
        message={
          batchMode === 'top10'
            ? t('character.batch.confirmTop10Message', { count: top10UnanalyzedIds.length })
            : t('character.batch.confirmMessage', { count: charData?.unanalyzed.length ?? 0 })
        }
        confirmLabel={t('character.batch.confirmBtn')}
        spendsTokens
        onConfirm={() => {
          const ids = batchMode === 'top10' ? top10UnanalyzedIds : undefined;
          setBatchMode(null);
          startBatch(ids);
        }}
        onCancel={() => setBatchMode(null)}
      />
    </div>
  );
}
