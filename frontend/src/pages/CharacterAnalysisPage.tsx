import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { useParams, useLocation, Link } from 'react-router-dom';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import {
  Search,
  ExternalLink,
  RefreshCw,
  AlertTriangle,
  GitCompare,
  ArrowLeft,
  Check,
  X,
} from 'lucide-react';
import { useTranslation } from 'react-i18next';
import '@/styles/character-analysis.css';
import { useChatContext } from '@/contexts/ChatContext';
import { useBook } from '@/hooks/useBook';
import { useCharacterAnalysis } from '@/hooks/useCharacterAnalysis';
import { useEventAnalysis } from '@/hooks/useEventAnalysis';
import {
  fetchEntityAnalysis,
  triggerEntityAnalysis,
  deleteEntityAnalysis,
  triggerBatchEntityAnalysis,
} from '@/api/analysis';
import type { BatchEepResult } from '@/api/types';
import {
  CharacterAnalysisDetail,
  type OverviewSubTab,
} from '@/components/analysis/CharacterAnalysisDetail';
import { EpistemicStateSection } from '@/components/analysis/EpistemicStateSection';
import { VoiceProfilingPanel } from '@/components/analysis/VoiceProfilingPanel';
import { FrameworkCompareDrawer } from '@/components/analysis/FrameworkCompareDrawer';
import { EpistemicCompareDrawer } from '@/components/analysis/EpistemicCompareDrawer';
import { CharacterGenerating } from '@/components/analysis/CharacterGenerating';
import { CharacterTipRibbon } from '@/components/analysis/CharacterTipRibbon';
import { AnalyzedItem, UnanalyzedItem } from '@/components/analysis/AnalysisListItems';
import { ArchetypeFilterDropdown } from '@/components/analysis/ArchetypeFilterDropdown';
import { CharacterOverviewLanding } from '@/components/analysis/overview/CharacterOverviewLanding';
import { LoadingSpinner } from '@/components/ui/LoadingSpinner';
import { ConfirmDialog } from '@/components/ui/ConfirmDialog';
import { useTaskPolling } from '@/hooks/useTaskPolling';

type Framework = 'jung' | 'schmidt';
type PrimaryTab = 'overview' | 'voice' | 'epistemic';

const PRIMARY_TABS: PrimaryTab[] = ['overview', 'voice', 'epistemic'];

export default function CharacterAnalysisPage() {
  const queryClient = useQueryClient();
  const { bookId } = useParams<{ bookId: string }>();
  const { setPageContext } = useChatContext();
  const { data: book } = useBook(bookId);
  const { t } = useTranslation('analysis');
  const { t: tc } = useTranslation('common');

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
  const [generateTaskId, setGenerateTaskId] = useState<string | null>(null);
  const [generatingId, setGeneratingId] = useState<string | null>(null);
  const [triggerError, setTriggerError] = useState<string | null>(null);

  // #11 tiered batch: 'top10' analyzes the top-10-by-mentionCount unanalyzed
  // characters (entityIds subset), 'all' analyzes everything unanalyzed.
  const [batchMode, setBatchMode] = useState<'top10' | 'all' | null>(null);
  const [batchTaskId, setBatchTaskId] = useState<string | null>(null);
  const [batchError, setBatchError] = useState<string | null>(null);
  const [batchSummary, setBatchSummary] = useState<BatchEepResult | null>(null);
  const [prevBatchProgress, setPrevBatchProgress] = useState(0);
  const [toastVisible, setToastVisible] = useState(false);

  useEffect(() => {
    if (book) setPageContext({ page: 'analysis', bookId, bookTitle: book.title, analysisTab: 'characters' });
    return () => setPageContext({ page: 'other' });
  }, [book, bookId, setPageContext]);

  const { data: charData, isLoading } = useCharacterAnalysis(bookId);
  // #5 behavior-pane keyEvents -> event analysis page name matching.
  const { data: eventData } = useEventAnalysis(bookId);

  const { data: entityAnalysis, isLoading: analysisLoading } = useQuery({
    queryKey: ['books', bookId, 'entities', selectedEntityId, 'analysis'],
    queryFn: () => fetchEntityAnalysis(bookId!, selectedEntityId!),
    // Pause while a generation task runs: the old analysis is deleted at that
    // point, so a refetch would only 404 and pin stale data on screen.
    enabled: !!bookId && !!selectedEntityId && !generateTaskId,
  });

  const triggerMutation = useMutation({
    mutationFn: (id: string) => triggerEntityAnalysis(bookId!, id),
    onSuccess: (data) => {
      setTriggerError(null);
      setGenerateTaskId(data.taskId);
    },
    onError: () => {
      setGeneratingId(null);
      setTriggerError(t('triggerFailed'));
    },
  });

  // Retry only the failed parts of a partial result (reuses cached CEP).
  const retryFailedMutation = useMutation({
    mutationFn: (id: string) => triggerEntityAnalysis(bookId!, id, 'retryFailed'),
    onSuccess: (data) => {
      setTriggerError(null);
      setGenerateTaskId(data.taskId);
    },
    onError: () => setTriggerError(t('triggerFailed')),
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
    deleteEntityAnalysis(bookId, selectedEntityId).then(() => {
      queryClient.invalidateQueries({ queryKey: ['books', bookId, 'analysis', 'characters'] });
      // removeQueries (not invalidate): the analysis row is gone, and
      // invalidate would keep serving the stale result on refetch error —
      // the screen must drop to the generating view instead.
      queryClient.removeQueries({ queryKey: ['books', bookId, 'entities', selectedEntityId, 'analysis'] });
      triggerMutation.mutate(selectedEntityId);
    });
  };

  const { data: genTask } = useTaskPolling(generateTaskId);

  /* eslint-disable react-hooks/set-state-in-effect */
  useEffect(() => {
    if (genTask?.status === 'done') {
      queryClient.invalidateQueries({ queryKey: ['books', bookId, 'entities', selectedEntityId, 'analysis'] });
      queryClient.invalidateQueries({ queryKey: ['books', bookId, 'analysis', 'characters'] });
      setGenerateTaskId(null);
      setGeneratingId(null);
    }
  }, [genTask?.status, bookId, selectedEntityId, queryClient]);
  /* eslint-enable react-hooks/set-state-in-effect */

  const batchMutation = useMutation({
    mutationFn: (entityIds?: string[]) => triggerBatchEntityAnalysis(bookId!, entityIds),
    onSuccess: (data) => {
      setBatchError(null);
      setBatchSummary(null);
      setPrevBatchProgress(0);
      setBatchTaskId(data.taskId);
    },
    onError: () => setBatchError(t('character.batch.triggerFailed')),
  });

  const { data: batchTask } = useTaskPolling(batchTaskId);
  const isBatchRunning =
    !!batchTaskId &&
    !!batchTask &&
    batchTask.status !== 'done' &&
    batchTask.status !== 'error';

  /* eslint-disable react-hooks/set-state-in-effect */
  useEffect(() => {
    if (!batchTask?.result) return;
    const result = batchTask.result as unknown as BatchEepResult;
    if (result.progress > prevBatchProgress) {
      setPrevBatchProgress(result.progress);
      queryClient.invalidateQueries({ queryKey: ['books', bookId, 'analysis', 'characters'] });
    }
  }, [batchTask?.result, prevBatchProgress, bookId, queryClient]);

  useEffect(() => {
    if (batchTask?.status === 'done') {
      queryClient.invalidateQueries({ queryKey: ['books', bookId, 'analysis', 'characters'] });
      const result = batchTask.result as unknown as BatchEepResult;
      setBatchSummary(result);
      setBatchTaskId(null);
      setToastVisible(true);
    } else if (batchTask?.status === 'error') {
      setBatchError(batchTask.error ?? t('character.batch.triggerFailed'));
      setBatchTaskId(null);
    }
  }, [batchTask?.status, batchTask?.result, batchTask?.error, bookId, queryClient, t]);
  /* eslint-enable react-hooks/set-state-in-effect */

  useEffect(() => {
    if (!toastVisible) return;
    const timer = setTimeout(() => setToastVisible(false), 5000);
    return () => clearTimeout(timer);
  }, [toastVisible]);

  const selectedAnalyzed = charData?.analyzed.find((a) => a.entityId === selectedEntityId);
  const selectedUnanalyzed = charData?.unanalyzed.find((u) => u.id === selectedEntityId);

  // Search matches the name, and for analyzed characters, also the current
  // framework's archetype label (e.g. searching "統治者" finds that archetype).
  const filterFn = (name: string, archetype?: string) => {
    if (!searchQuery) return true;
    const q = searchQuery.toLowerCase();
    return name.toLowerCase().includes(q) || !!archetype?.toLowerCase().includes(q);
  };
  // #14 archetype filter only applies to the analyzed group (dropdown is
  // scoped to "篩選已分析角色"), and resets whenever the framework switches.
  const filteredAnalyzed = (charData?.analyzed ?? [])
    .filter((a) => filterFn(a.title, a.archetypes?.[framework]))
    .filter((a) => archFilter.length === 0 || archFilter.includes(a.archetypes?.[framework] ?? ''))
    .sort((a, b) => b.mentionCount - a.mentionCount);
  const filteredUnanalyzed = (charData?.unanalyzed ?? [])
    .filter((u) => filterFn(u.name))
    .sort((a, b) => b.mentionCount - a.mentionCount);

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
  // Ignored entirely while focus is in an input/textarea/contenteditable so it
  // never steals keys from the search box or the epistemic chapter slider.
  useEffect(() => {
    const onKeyDown = (e: KeyboardEvent) => {
      const target = e.target as HTMLElement | null;
      const tag = target?.tagName;
      const isEditable = tag === 'INPUT' || tag === 'TEXTAREA' || !!target?.isContentEditable;
      if (isEditable) return;

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
  }, [flatNavList, selectedEntityId, selectedAnalyzed, handleSelectEntity]);

  // Title bar archetype badge label
  const titleArchetypeName = entityAnalysis
    ? entityAnalysis.archetypes.find((a) => a.framework === framework)?.primary
    : undefined;

  if (isLoading) return <LoadingSpinner />;

  return (
    <div className="ca-page">
      <div className="ca-body">
        {/* ── Left panel ── */}
        <aside className="ca-left">
          <div className="ca-left-section">
            <p className="ca-left-section-label">{t('character.list.frameworkLabel')}</p>
            <div className="ca-fw-chips">
              {(['jung', 'schmidt'] as Framework[]).map((f) => (
                <button
                  key={f}
                  type="button"
                  className={'ca-fw-chip' + (framework === f ? ' active' : '')}
                  onClick={() => {
                    setFramework(f);
                    setArchFilter([]);
                  }}
                >
                  {f === 'jung' ? 'Jung 12' : 'Schmidt 45'}
                </button>
              ))}
            </div>
            <div className="ca-fw-meta">
              <button
                type="button"
                onClick={() => {
                  if (entityAnalysis) setDrawerOpen('framework');
                }}
                disabled={!entityAnalysis}
              >
                <GitCompare size={10} />
                {t('character.compare.fromSidebar')}
              </button>
              <Link to={`/methodology?framework=${framework}`}>
                {t('frameworkIndex')} <ExternalLink size={9} />
              </Link>
            </div>
            <ArchetypeFilterDropdown
              framework={framework}
              analyzed={charData?.analyzed ?? []}
              selected={archFilter}
              onChange={setArchFilter}
            />
          </div>

          {selectedEntityId && (
            <button type="button" className="ca-back-to-overview" onClick={handleBackToOverview}>
              <ArrowLeft size={14} /> {t('character.overview.backToOverview')}
            </button>
          )}

          <div className="ca-left-section tight">
            <div className="ca-search">
              <Search size={12} style={{ color: 'var(--fg-muted)' }} />
              <input
                ref={searchInputRef}
                type="text"
                placeholder={t('character.list.searchPlaceholder', { count: totalCharacters })}
                value={searchQuery}
                onChange={(e) => setSearchQuery(e.target.value)}
              />
            </div>
          </div>

          <div className="ca-list">
            {filteredAnalyzed.length > 0 && (
              <div className="ca-list-group">
                <div className="ca-list-group-head">
                  <span>{t('analyzed')}</span>
                  <span className="count">{filteredAnalyzed.length}</span>
                </div>
                {filteredAnalyzed.map((item) => (
                  <AnalyzedItem
                    key={item.id}
                    itemId={`ca-list-item-${item.entityId}`}
                    item={item}
                    framework={framework}
                    isSelected={selectedEntityId === item.entityId}
                    onSelect={() => handleSelectEntity(item.entityId)}
                    maxMentionCount={maxMentionCount}
                  />
                ))}
              </div>
            )}
            {filteredUnanalyzed.length > 0 && (
              <div className="ca-list-group">
                <div className="ca-list-group-head">
                  <span>{t('notAnalyzed')}</span>
                  <span className="count">{filteredUnanalyzed.length}</span>
                </div>
                {filteredUnanalyzed.map((item) => (
                  <UnanalyzedItem
                    key={item.id}
                    itemId={`ca-list-item-${item.id}`}
                    item={item}
                    isSelected={selectedEntityId === item.id}
                    onSelect={() => handleSelectEntity(item.id)}
                    onGenerate={() => handleGenerate(item.id)}
                    isGenerating={generatingId === item.id}
                    maxMentionCount={maxMentionCount}
                  />
                ))}
              </div>
            )}
          </div>
        </aside>

        {/* ── Content area ── */}
        <div className="ca-content">
          <div className="ca-content-scroll">
            <CharacterTipRibbon />

            {selectedEntityId && analysisLoading ? (
              <LoadingSpinner />
            ) : selectedEntityId && entityAnalysis ? (
              <>
                {/* Title bar */}
                <div className="ca-titlebar">
                  <div className="ca-titlebar-main">
                    <h1 className="ca-title">{entityAnalysis.entityName}</h1>
                    {selectedAnalyzed && (
                      <span className="ca-title-badge">
                        <span className="ca-title-badge-dot" />
                        {framework === 'jung' ? 'Jung · ' : 'Schmidt · '}
                        {titleArchetypeName || t('character.persona.archetypeNotGenerated')}
                      </span>
                    )}
                    {selectedAnalyzed && (
                      <span className="ca-title-meta">
                        {t('character.list.mentionCount', { count: selectedAnalyzed.mentionCount })}
                      </span>
                    )}
                  </div>
                  <div className="ca-titlebar-actions">
                    <Link
                      to={`/books/${bookId}/graph?entity=${selectedEntityId}`}
                      className="ca-btn"
                    >
                      <ExternalLink size={12} /> {t('viewInGraph')}
                    </Link>
                    <button
                      type="button"
                      className="ca-btn"
                      onClick={() => setDrawerOpen('framework')}
                    >
                      <GitCompare size={12} /> {t('character.compare.open')}
                    </button>
                    {entityAnalysis.status === 'partial' && (
                      <button
                        type="button"
                        className="ca-btn"
                        style={{ color: 'var(--color-warning)' }}
                        disabled={retryFailedMutation.isPending}
                        onClick={() => selectedEntityId && retryFailedMutation.mutate(selectedEntityId)}
                      >
                        <RefreshCw size={12} /> {t('character.persona.retryFailed')}
                      </button>
                    )}
                    <button
                      type="button"
                      className="ca-btn"
                      onClick={() => setConfirmRegenerate(true)}
                    >
                      <RefreshCw size={12} /> {t('regenerate')}
                    </button>
                  </div>
                </div>

                {/* Primary tabs */}
                <div className="ca-tabs" role="tablist">
                  {PRIMARY_TABS.map((tab) => (
                    <button
                      key={tab}
                      type="button"
                      role="tab"
                      aria-selected={primaryTab === tab}
                      className={'ca-tab' + (primaryTab === tab ? ' active' : '')}
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
                    onRegenerate={handleRegenerate}
                    isRegenerating={
                      triggerMutation.isPending ||
                      (!!generateTaskId && genTask?.status !== 'done')
                    }
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
            ) : genTask?.status === 'error' ? (
              <div className="ca-empty">
                <div className="ca-empty-icon">
                  <AlertTriangle size={22} />
                </div>
                <div className="ca-empty-title">{t('analysisFailed')}</div>
                {genTask.error && (
                  <p className="ca-empty-sub">{genTask.error}</p>
                )}
                <button
                  type="button"
                  className="ca-btn"
                  onClick={() => {
                    setGenerateTaskId(null);
                    triggerMutation.reset();
                    setTriggerError(null);
                  }}
                >
                  {tc('retry')}
                </button>
              </div>
            ) : generateTaskId && genTask?.status !== 'done' ? (
              <CharacterGenerating
                task={genTask}
                name={selectedUnanalyzed?.name ?? selectedAnalyzed?.title ?? ''}
              />
            ) : selectedUnanalyzed ? (
              <div className="ca-empty">
                <p className="ca-empty-title">{selectedUnanalyzed.name}</p>
                <p className="ca-empty-sub">{t('noAnalysis')}</p>
                <button
                  type="button"
                  className="ca-btn ca-btn-primary"
                  onClick={() => handleGenerate(selectedUnanalyzed.id)}
                  disabled={triggerMutation.isPending}
                >
                  {t('generate')}
                </button>
              </div>
            ) : triggerError ? (
              <div className="ca-empty">
                <div className="ca-empty-icon">
                  <AlertTriangle size={22} />
                </div>
                <p className="ca-empty-sub">{triggerError}</p>
                <button
                  type="button"
                  className="ca-btn"
                  onClick={() => setTriggerError(null)}
                >
                  {tc('confirm')}
                </button>
              </div>
            ) : charData ? (
              <CharacterOverviewLanding
                bookId={bookId!}
                charData={charData}
                onSelectEntity={handleSelectEntity}
                onGenerate={handleGenerate}
                generatingId={generatingId}
                onOpenBatchModal={setBatchMode}
                isBatchRunning={isBatchRunning}
                batchProgressLabel={
                  isBatchRunning
                    ? t('character.overview.batchProgress', { progress: batchTask?.progress ?? 0 })
                    : undefined
                }
                batchError={batchError}
                onDismissBatchError={() => setBatchError(null)}
              />
            ) : (
              // Only reached if the #6a list query itself failed (isLoading
              // already gates the loading state above).
              <div className="ca-empty">
                <div className="ca-empty-icon">
                  <AlertTriangle size={22} />
                </div>
                <p className="ca-empty-sub">{t('selectCharacter')}</p>
              </div>
            )}
          </div>

          {/* Batch completion toast */}
          {toastVisible && batchSummary && (
            <div className="ca-toast" role="status">
              <div className="ca-toast-icon">
                <Check size={18} strokeWidth={2.2} />
              </div>
              <div className="ca-toast-main">
                <div className="ca-toast-title">{t('character.batch.toastTitle')}</div>
                <div className="ca-toast-body">
                  {t('character.batch.toastBody', {
                    generated:
                      batchSummary.progress - batchSummary.skipped - batchSummary.failed,
                    skipped: batchSummary.skipped,
                    failed: batchSummary.failed,
                  })}
                </div>
              </div>
              <button
                type="button"
                className="ca-toast-close"
                onClick={() => setToastVisible(false)}
                aria-label={t('character.batch.toastClose')}
              >
                <X size={12} />
              </button>
            </div>
          )}

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
        onConfirm={() => {
          const ids = batchMode === 'top10' ? top10UnanalyzedIds : undefined;
          setBatchMode(null);
          batchMutation.mutate(ids);
        }}
        onCancel={() => setBatchMode(null)}
      />
    </div>
  );
}
