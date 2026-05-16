import { useEffect, useState } from 'react';
import { useParams, Link } from 'react-router-dom';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import {
  Search,
  ExternalLink,
  RefreshCw,
  AlertTriangle,
  GitCompare,
} from 'lucide-react';
import { useTranslation } from 'react-i18next';
import '@/styles/character-analysis.css';
import { useChatContext } from '@/contexts/ChatContext';
import { useBook } from '@/hooks/useBook';
import { useCharacterAnalysis } from '@/hooks/useCharacterAnalysis';
import {
  fetchEntityAnalysis,
  triggerEntityAnalysis,
  deleteEntityAnalysis,
} from '@/api/analysis';
import {
  CharacterAnalysisDetail,
  type OverviewSubTab,
} from '@/components/analysis/CharacterAnalysisDetail';
import { EpistemicStateSection } from '@/components/analysis/EpistemicStateSection';
import { VoiceProfilingPanel } from '@/components/analysis/VoiceProfilingPanel';
import { FrameworkCompareDrawer } from '@/components/analysis/FrameworkCompareDrawer';
import { CharacterTipRibbon } from '@/components/analysis/CharacterTipRibbon';
import { AnalyzedItem, UnanalyzedItem } from '@/components/analysis/AnalysisListItems';
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

  const [framework, setFramework] = useState<Framework>('jung');
  const [searchQuery, setSearchQuery] = useState('');
  const [selectedEntityId, setSelectedEntityId] = useState<string | null>(null);
  const [primaryTab, setPrimaryTab] = useState<PrimaryTab>('overview');
  const [overviewSubTab, setOverviewSubTab] = useState<OverviewSubTab>('persona');
  const [confirmRegenerate, setConfirmRegenerate] = useState(false);
  const [compareOpen, setCompareOpen] = useState(false);
  const [generateTaskId, setGenerateTaskId] = useState<string | null>(null);
  const [generatingId, setGeneratingId] = useState<string | null>(null);
  const [triggerError, setTriggerError] = useState<string | null>(null);

  useEffect(() => {
    if (book) setPageContext({ page: 'analysis', bookId, bookTitle: book.title, analysisTab: 'characters' });
    return () => setPageContext({ page: 'other' });
  }, [book, bookId, setPageContext]);

  const { data: charData, isLoading } = useCharacterAnalysis(bookId);

  const { data: entityAnalysis, isLoading: analysisLoading } = useQuery({
    queryKey: ['books', bookId, 'entities', selectedEntityId, 'analysis'],
    queryFn: () => fetchEntityAnalysis(bookId!, selectedEntityId!),
    enabled: !!bookId && !!selectedEntityId,
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

  const handleSelectEntity = (id: string) => {
    setSelectedEntityId(id);
    // Reset sub-tab when switching characters so each one starts at persona
    setOverviewSubTab('persona');
    setCompareOpen(false);
  };

  const handleGenerate = (id: string) => {
    setGeneratingId(id);
    handleSelectEntity(id);
    triggerMutation.mutate(id);
  };

  const handleRegenerate = () => {
    if (!selectedEntityId || !bookId) return;
    deleteEntityAnalysis(bookId, selectedEntityId).then(() => {
      queryClient.invalidateQueries({ queryKey: ['books', bookId, 'analysis', 'characters'] });
      queryClient.invalidateQueries({ queryKey: ['books', bookId, 'entities', selectedEntityId, 'analysis'] });
      triggerMutation.mutate(selectedEntityId);
    });
  };

  const { data: genTask } = useTaskPolling(generateTaskId);

  useEffect(() => {
    if (genTask?.status === 'done') {
      queryClient.invalidateQueries({ queryKey: ['books', bookId, 'entities', selectedEntityId, 'analysis'] });
      queryClient.invalidateQueries({ queryKey: ['books', bookId, 'analysis', 'characters'] });
      setGenerateTaskId(null);
      setGeneratingId(null);
    }
  }, [genTask?.status, bookId, selectedEntityId, queryClient]);

  const selectedAnalyzed = charData?.analyzed.find((a) => a.entityId === selectedEntityId);
  const selectedUnanalyzed = charData?.unanalyzed.find((u) => u.id === selectedEntityId);

  const filterFn = (name: string) =>
    !searchQuery || name.toLowerCase().includes(searchQuery.toLowerCase());
  const filteredAnalyzed = charData?.analyzed.filter((a) => filterFn(a.title)) ?? [];
  const filteredUnanalyzed = charData?.unanalyzed.filter((u) => filterFn(u.name)) ?? [];

  const totalCharacters = (charData?.analyzed.length ?? 0) + (charData?.unanalyzed.length ?? 0);

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
            <p className="ca-left-section-label">{t('list.frameworkLabel')}</p>
            <div className="ca-fw-chips">
              {(['jung', 'schmidt'] as Framework[]).map((f) => (
                <button
                  key={f}
                  type="button"
                  className={'ca-fw-chip' + (framework === f ? ' active' : '')}
                  onClick={() => setFramework(f)}
                >
                  {f === 'jung' ? 'Jung 12' : 'Schmidt 45'}
                </button>
              ))}
            </div>
            <div className="ca-fw-meta">
              <button
                type="button"
                onClick={() => {
                  if (entityAnalysis) setCompareOpen(true);
                }}
                disabled={!entityAnalysis}
              >
                <GitCompare size={10} />
                {t('compare.fromSidebar')}
              </button>
              <Link to={`/frameworks?framework=${framework}`}>
                {t('frameworkIndex')} <ExternalLink size={9} />
              </Link>
            </div>
          </div>

          <div className="ca-left-section tight">
            <div className="ca-search">
              <Search size={12} style={{ color: 'var(--fg-muted)' }} />
              <input
                type="text"
                placeholder={t('list.searchPlaceholder', { count: totalCharacters })}
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
                    item={item}
                    framework={framework}
                    isSelected={selectedEntityId === item.entityId}
                    onSelect={() => handleSelectEntity(item.entityId)}
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
                    item={item}
                    isSelected={selectedEntityId === item.id}
                    onSelect={() => handleSelectEntity(item.id)}
                    onGenerate={() => handleGenerate(item.id)}
                    isGenerating={generatingId === item.id}
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
                  <div>
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
                          {t('list.chapterCount', { count: selectedAnalyzed.chapterCount })}
                        </span>
                      )}
                      <Link
                        to={`/books/${bookId}/graph?entity=${selectedEntityId}`}
                        className="ca-title-link"
                      >
                        {t('viewInGraph')} <ExternalLink size={10} />
                      </Link>
                    </div>
                  </div>
                  <div className="ca-titlebar-actions">
                    <button
                      type="button"
                      className="ca-btn"
                      onClick={() => setCompareOpen(true)}
                    >
                      <GitCompare size={12} /> {t('compare.open')}
                    </button>
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
                    onOpenCompare={() => setCompareOpen(true)}
                    onRegenerate={handleRegenerate}
                    isRegenerating={
                      triggerMutation.isPending ||
                      (!!generateTaskId && genTask?.status !== 'done')
                    }
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
            ) : generateTaskId && genTask && genTask.status !== 'done' ? (
              <div className="ca-empty">
                <LoadingSpinner />
                <p className="ca-empty-sub">
                  {genTask.stage || t('analyzing')}
                  {genTask.progress > 0 ? ` (${genTask.progress}%)` : ''}
                </p>
              </div>
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
            ) : (
              <div className="ca-empty">
                <p className="ca-empty-sub">{t('selectCharacter')}</p>
              </div>
            )}
          </div>

          {/* Compare drawer overlays content area only */}
          <FrameworkCompareDrawer
            open={compareOpen}
            data={entityAnalysis}
            onClose={() => setCompareOpen(false)}
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
    </div>
  );
}
