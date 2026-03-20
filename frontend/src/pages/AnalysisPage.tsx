import { useState, useEffect } from 'react';
import { useParams, Link } from 'react-router-dom';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { Search, ExternalLink, RefreshCw, AlertTriangle } from 'lucide-react';
import { useCharacterAnalysis } from '@/hooks/useCharacterAnalysis';
import { useEventAnalysis } from '@/hooks/useEventAnalysis';
import { fetchEntityAnalysis, triggerEntityAnalysis, deleteEntityAnalysis, triggerEventAnalysis, deleteEventAnalysis } from '@/api/analysis';
import { AnalysisAccordion } from '@/components/analysis/AnalysisAccordion';
import { MarkdownRenderer } from '@/components/ui/MarkdownRenderer';
import { LoadingSpinner } from '@/components/ui/LoadingSpinner';

import { ConfirmDialog } from '@/components/ui/ConfirmDialog';
import { useTaskPolling } from '@/hooks/useTaskPolling';
import type { AnalysisItem, UnanalyzedEntity } from '@/api/types';

type Tab = 'characters' | 'events';
type Framework = 'jung' | 'schmidt';

export default function AnalysisPage() {
  const queryClient = useQueryClient();
  const { bookId } = useParams<{ bookId: string }>();
  const [tab, setTab] = useState<Tab>('characters');
  const [framework, setFramework] = useState<Framework>('jung');
  const [searchQuery, setSearchQuery] = useState('');
  const [selectedEntityId, setSelectedEntityId] = useState<string | null>(null);
  const [confirmRegenerate, setConfirmRegenerate] = useState(false);
  const [generateTaskId, setGenerateTaskId] = useState<string | null>(null);

  const { data: charData, isLoading: charLoading } = useCharacterAnalysis(bookId);
  const { data: evtData, isLoading: evtLoading } = useEventAnalysis(bookId);

  const activeData = tab === 'characters' ? charData : evtData;
  const isLoading = tab === 'characters' ? charLoading : evtLoading;

  // Entity analysis detail
  const { data: entityAnalysis, isLoading: analysisLoading } = useQuery({
    queryKey: ['books', bookId, 'entities', selectedEntityId, 'analysis'],
    queryFn: () => fetchEntityAnalysis(bookId!, selectedEntityId!),
    enabled: !!bookId && !!selectedEntityId && tab === 'characters',
  });

  // Trigger analysis (entity or event based on active tab)
  const [triggerError, setTriggerError] = useState<string | null>(null);
  const triggerMutation = useMutation({
    mutationFn: (id: string) =>
      tab === 'events'
        ? triggerEventAnalysis(bookId!, id)
        : triggerEntityAnalysis(bookId!, id),
    onSuccess: (data) => { setTriggerError(null); setGenerateTaskId(data.taskId); },
    onError: () => setTriggerError('觸發分析失敗，請稍後再試。'),
  });

  // Task polling for generation
  const { data: genTask } = useTaskPolling(generateTaskId);

  // When generation task completes, refetch analysis data and reset task state
  useEffect(() => {
    if (genTask?.status === 'done') {
      queryClient.invalidateQueries({ queryKey: ['books', bookId, 'entities', selectedEntityId, 'analysis'] });
      queryClient.invalidateQueries({ queryKey: ['books', bookId, 'analysis', 'characters'] });
      queryClient.invalidateQueries({ queryKey: ['books', bookId, 'analysis', 'events'] });
      setGenerateTaskId(null);
    }
  }, [genTask?.status, bookId, selectedEntityId, queryClient]);

  // Find selected item in analyzed list
  const selectedAnalyzed = activeData?.analyzed.find((a) => a.entityId === selectedEntityId);

  // Filter by search
  const filterFn = (name: string) =>
    !searchQuery || name.toLowerCase().includes(searchQuery.toLowerCase());

  const filteredAnalyzed = activeData?.analyzed.filter((a) => filterFn(a.title)) ?? [];
  const filteredUnanalyzed = activeData?.unanalyzed.filter((u) => filterFn(u.name)) ?? [];

  // Parse sections from markdown content
  const parseSections = (content: string) => {
    const sections: { title: string; subtitle?: string; content: string }[] = [];
    const parts = content.split(/^### /m).filter(Boolean);
    for (const part of parts) {
      const newline = part.indexOf('\n');
      if (newline === -1) continue;
      const title = part.slice(0, newline).trim();
      const body = part.slice(newline + 1).trim();
      if (body) sections.push({ title, content: body });
    }
    return sections.length > 0 ? sections : [{ title: '分析內容', content }];
  };

  if (isLoading) return <LoadingSpinner />;

  return (
    <div className="flex h-full">
      {/* Left Panel */}
      <div
        className="flex-shrink-0 flex flex-col overflow-hidden"
        style={{
          width: 260,
          borderRight: '1px solid var(--border)',
          backgroundColor: 'var(--bg-secondary)',
        }}
      >
        {/* Sub tabs */}
        <div className="flex border-b" style={{ borderColor: 'var(--border)' }}>
          {(['characters', 'events'] as Tab[]).map((t) => (
            <button
              key={t}
              onClick={() => { setTab(t); setSelectedEntityId(null); setGenerateTaskId(null); setTriggerError(null); }}
              className="flex-1 py-2 text-xs font-medium border-b-2 -mb-px"
              style={{
                borderColor: tab === t ? 'var(--accent)' : 'transparent',
                color: tab === t ? 'var(--accent)' : 'var(--fg-muted)',
              }}
            >
              {t === 'characters' ? '角色分析' : '事件分析'}
            </button>
          ))}
        </div>

        {/* Framework selector (characters only) */}
        {tab === 'characters' && (
          <div className="px-3 py-2 flex items-center gap-2">
            {(['jung', 'schmidt'] as Framework[]).map((f) => (
              <button
                key={f}
                onClick={() => setFramework(f)}
                className="text-xs px-2 py-0.5 rounded-full"
                style={{
                  backgroundColor: framework === f ? 'var(--accent)' : 'var(--bg-tertiary)',
                  color: framework === f ? 'white' : 'var(--fg-secondary)',
                }}
              >
                {f === 'jung' ? 'Jung 12' : 'Schmidt 45'}
              </button>
            ))}
            <Link
              to={`/frameworks?framework=${framework}`}
              className="text-xs flex items-center gap-0.5 ml-auto"
              style={{ color: 'var(--accent)' }}
            >
              框架索引 <ExternalLink size={10} />
            </Link>
          </div>
        )}

        {/* Search */}
        <div className="px-3 py-2">
          <div
            className="flex items-center gap-2 px-2 py-1 rounded-md"
            style={{ backgroundColor: 'var(--bg-tertiary)' }}
          >
            <Search size={12} style={{ color: 'var(--fg-muted)' }} />
            <input
              type="text"
              placeholder="搜尋..."
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              className="bg-transparent text-xs flex-1 outline-none"
              style={{ color: 'var(--fg-primary)' }}
            />
          </div>
        </div>

        {/* List */}
        <div className="flex-1 overflow-y-auto px-2 pb-2 space-y-1">
          {filteredAnalyzed.length > 0 && (
            <>
              <div className="text-xs px-2 py-1" style={{ color: 'var(--fg-muted)' }}>
                已分析 ({filteredAnalyzed.length})
              </div>
              {filteredAnalyzed.map((item) => (
                <AnalyzedItem
                  key={item.id}
                  item={item}
                  isSelected={selectedEntityId === item.entityId}
                  onSelect={() => setSelectedEntityId(item.entityId)}
                />
              ))}
            </>
          )}
          {filteredUnanalyzed.length > 0 && (
            <>
              <div className="text-xs px-2 py-1 mt-2" style={{ color: 'var(--fg-muted)' }}>
                尚未分析 ({filteredUnanalyzed.length})
              </div>
              {filteredUnanalyzed.map((item) => (
                <UnanalyzedItem
                  key={item.id}
                  item={item}
                  isSelected={selectedEntityId === item.id}
                  onSelect={() => setSelectedEntityId(item.id)}
                  onGenerate={() => triggerMutation.mutate(item.id)}
                  isGenerating={triggerMutation.isPending}
                />
              ))}
            </>
          )}
        </div>
      </div>

      {/* Content Area */}
      <div className="flex-1 overflow-y-auto p-6">
        {selectedEntityId && selectedAnalyzed ? (
          <>
            {/* Title bar */}
            <div className="flex items-center justify-between mb-6">
              <div className="flex items-center gap-3">
                <h2
                  className="text-xl font-bold"
                  style={{ fontFamily: 'var(--font-serif)', color: 'var(--fg-primary)' }}
                >
                  {selectedAnalyzed.title}
                </h2>
                <span
                  className="text-xs px-2 py-0.5 rounded-full"
                  style={{ backgroundColor: 'var(--bg-secondary)', color: 'var(--fg-muted)' }}
                >
                  {selectedAnalyzed.framework.toUpperCase()}
                </span>
                <Link
                  to={`/books/${bookId}/graph?entity=${selectedAnalyzed.entityId}`}
                  className="text-xs flex items-center gap-1"
                  style={{ color: 'var(--accent)' }}
                >
                  在圖譜中查看 <ExternalLink size={10} />
                </Link>
              </div>
              <button
                className="btn btn-secondary text-xs"
                onClick={() => setConfirmRegenerate(true)}
              >
                <RefreshCw size={12} />
                覆蓋重新生成
              </button>
            </div>

            {/* Accordion content */}
            <AnalysisAccordion sections={parseSections(selectedAnalyzed.content)} />
          </>
        ) : selectedEntityId && analysisLoading ? (
          <LoadingSpinner />
        ) : selectedEntityId && entityAnalysis ? (
          <div>
            <h2
              className="text-xl font-bold mb-4"
              style={{ fontFamily: 'var(--font-serif)', color: 'var(--fg-primary)' }}
            >
              {entityAnalysis.entityName}
            </h2>
            <MarkdownRenderer content={entityAnalysis.content} />
          </div>
        ) : genTask?.status === 'error' ? (
          <div className="flex flex-col items-center justify-center h-48 gap-3">
            <AlertTriangle size={24} style={{ color: 'var(--color-danger, #e53e3e)' }} />
            <p className="text-sm" style={{ color: 'var(--color-danger, #e53e3e)' }}>
              分析失敗{genTask.error ? `：${genTask.error}` : ''}
            </p>
            <button
              className="btn btn-secondary text-xs"
              onClick={() => { setGenerateTaskId(null); triggerMutation.reset(); setTriggerError(null); }}
            >
              重試
            </button>
          </div>
        ) : generateTaskId && genTask && genTask.status !== 'done' ? (
          <div className="flex flex-col items-center justify-center h-48 gap-2">
            <LoadingSpinner />
            <p className="text-sm" style={{ color: 'var(--fg-muted)' }}>
              {genTask.stage} ({genTask.progress}%)
            </p>
          </div>
        ) : triggerError ? (
          <div className="flex flex-col items-center justify-center h-48 gap-3">
            <AlertTriangle size={24} style={{ color: 'var(--color-danger, #e53e3e)' }} />
            <p className="text-sm" style={{ color: 'var(--color-danger, #e53e3e)' }}>{triggerError}</p>
            <button
              className="btn btn-secondary text-xs"
              onClick={() => setTriggerError(null)}
            >
              確認
            </button>
          </div>
        ) : (
          <div className="flex items-center justify-center h-48">
            <p className="text-sm" style={{ color: 'var(--fg-muted)' }}>
              選擇{tab === 'characters' ? '角色' : '事件'}以查看或生成分析
            </p>
          </div>
        )}

        {/* Regenerate confirm */}
        <ConfirmDialog
          open={confirmRegenerate}
          title="覆蓋重新生成"
          message="此操作將覆蓋現有結果並消耗 token，確認後執行？"
          onConfirm={() => {
            setConfirmRegenerate(false);
            if (selectedEntityId && bookId) {
              const deleteFn = tab === 'events' ? deleteEventAnalysis : deleteEntityAnalysis;
              deleteFn(bookId, selectedEntityId).then(() => {
                // Invalidate list so selectedAnalyzed becomes null, allowing spinner to show
                queryClient.invalidateQueries({ queryKey: ['books', bookId, 'analysis', 'characters'] });
                queryClient.invalidateQueries({ queryKey: ['books', bookId, 'analysis', 'events'] });
                queryClient.invalidateQueries({ queryKey: ['books', bookId, 'entities', selectedEntityId, 'analysis'] });
                triggerMutation.mutate(selectedEntityId);
              });
            }
          }}
          onCancel={() => setConfirmRegenerate(false)}
        />
      </div>
    </div>
  );
}

function AnalyzedItem({
  item,
  isSelected,
  onSelect,
}: {
  item: AnalysisItem;
  isSelected: boolean;
  onSelect: () => void;
}) {
  return (
    <button
      className="flex items-center gap-2 w-full px-2 py-1.5 rounded-md text-left transition-colors"
      style={{
        backgroundColor: isSelected ? 'var(--bg-tertiary)' : 'transparent',
      }}
      onClick={onSelect}
    >
      <div
        className="w-6 h-6 rounded-full flex items-center justify-center text-xs font-medium flex-shrink-0"
        style={{ backgroundColor: 'var(--entity-char-bg)', color: 'var(--entity-char-fg)' }}
      >
        {item.title[0]}
      </div>
      <div className="flex-1 min-w-0">
        <div className="text-xs font-medium truncate" style={{ color: 'var(--fg-primary)' }}>
          {item.title}
        </div>
        {item.archetypeType && (
          <div className="text-xs truncate" style={{ color: 'var(--fg-muted)' }}>
            {item.archetypeType}
          </div>
        )}
      </div>
      <span className="w-2 h-2 rounded-full flex-shrink-0" style={{ backgroundColor: 'var(--color-success)' }} />
    </button>
  );
}

function UnanalyzedItem({
  item,
  isSelected,
  onSelect,
  onGenerate,
  isGenerating,
}: {
  item: UnanalyzedEntity;
  isSelected: boolean;
  onSelect: () => void;
  onGenerate: () => void;
  isGenerating: boolean;
}) {
  return (
    <button
      className="flex items-center gap-2 w-full px-2 py-1.5 rounded-md text-left transition-colors"
      style={{
        backgroundColor: isSelected ? 'var(--bg-tertiary)' : 'transparent',
      }}
      onClick={onSelect}
    >
      <div
        className="w-6 h-6 rounded-full flex items-center justify-center text-xs flex-shrink-0"
        style={{ backgroundColor: 'var(--bg-tertiary)', color: 'var(--fg-muted)' }}
      >
        {item.name[0]}
      </div>
      <div className="flex-1 min-w-0">
        <div className="text-xs truncate" style={{ color: 'var(--fg-muted)' }}>
          {item.name}
        </div>
        <div className="text-xs" style={{ color: 'var(--fg-muted)' }}>
          尚未分析
        </div>
      </div>
      <button
        className="text-xs px-1.5 py-0.5 rounded flex-shrink-0"
        style={{ backgroundColor: 'var(--accent)', color: 'white' }}
        onClick={(e) => {
          e.stopPropagation();
          onGenerate();
        }}
        disabled={isGenerating}
      >
        建立
      </button>
    </button>
  );
}
