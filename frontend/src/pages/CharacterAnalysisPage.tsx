import { useState, useEffect } from 'react';
import { useParams, Link } from 'react-router-dom';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { Search, ExternalLink, RefreshCw, AlertTriangle } from 'lucide-react';
import { useChatContext } from '@/contexts/ChatContext';
import { useBook } from '@/hooks/useBook';
import { useCharacterAnalysis } from '@/hooks/useCharacterAnalysis';
import { fetchEntityAnalysis, triggerEntityAnalysis, deleteEntityAnalysis } from '@/api/analysis';
import { CharacterAnalysisDetail } from '@/components/analysis/CharacterAnalysisDetail';
import { AnalyzedItem, UnanalyzedItem } from '@/components/analysis/AnalysisListItems';
import { LoadingSpinner } from '@/components/ui/LoadingSpinner';
import { ConfirmDialog } from '@/components/ui/ConfirmDialog';
import { useTaskPolling } from '@/hooks/useTaskPolling';

type Framework = 'jung' | 'schmidt';

export default function CharacterAnalysisPage() {
  const queryClient = useQueryClient();
  const { bookId } = useParams<{ bookId: string }>();
  const { setPageContext } = useChatContext();
  const { data: book } = useBook(bookId);
  const [framework, setFramework] = useState<Framework>('jung');
  const [searchQuery, setSearchQuery] = useState('');
  const [selectedEntityId, setSelectedEntityId] = useState<string | null>(null);
  const [confirmRegenerate, setConfirmRegenerate] = useState(false);
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
    onSuccess: (data) => { setTriggerError(null); setGenerateTaskId(data.taskId); },
    onError: () => { setGeneratingId(null); setTriggerError('觸發分析失敗，請稍後再試。'); },
  });

  const handleGenerate = (id: string) => {
    setGeneratingId(id);
    setSelectedEntityId(id);
    triggerMutation.mutate(id);
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

  if (isLoading) return <LoadingSpinner />;

  return (
    <div className="flex h-full">
      {/* Left Panel */}
      <div
        className="flex-shrink-0 flex flex-col overflow-hidden"
        style={{ width: 260, borderRight: '1px solid var(--border)', backgroundColor: 'var(--bg-secondary)' }}
      >
        {/* Framework selector */}
        <div className="px-3 py-2 flex items-center gap-2 border-b" style={{ borderColor: 'var(--border)' }}>
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
                  onGenerate={() => handleGenerate(item.id)}
                  isGenerating={generatingId === item.id}
                />
              ))}
            </>
          )}
        </div>
      </div>

      {/* Content Area */}
      <div className="flex-1 overflow-y-auto p-6">
        {selectedEntityId && analysisLoading ? (
          <LoadingSpinner />
        ) : selectedEntityId && entityAnalysis ? (
          <>
            <div className="flex items-center justify-between mb-6">
              <div className="flex items-center gap-3">
                <h2
                  className="text-xl font-bold"
                  style={{ fontFamily: 'var(--font-serif)', color: 'var(--fg-primary)' }}
                >
                  {entityAnalysis.entityName}
                </h2>
                {selectedAnalyzed && (
                  <span
                    className="text-xs px-2 py-0.5 rounded-full"
                    style={{ backgroundColor: 'var(--bg-secondary)', color: 'var(--fg-muted)' }}
                  >
                    {selectedAnalyzed.framework.toUpperCase()}
                  </span>
                )}
                <Link
                  to={`/books/${bookId}/graph?entity=${selectedEntityId}`}
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
            <CharacterAnalysisDetail data={entityAnalysis} />
          </>
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
              {genTask.stage || '分析中'}{genTask.progress > 0 ? ` (${genTask.progress}%)` : ''}
            </p>
          </div>
        ) : selectedUnanalyzed ? (
          <div className="flex flex-col items-center justify-center h-48 gap-4">
            <p className="text-base font-medium" style={{ fontFamily: 'var(--font-serif)', color: 'var(--fg-primary)' }}>
              {selectedUnanalyzed.name}
            </p>
            <p className="text-sm" style={{ color: 'var(--fg-muted)' }}>尚未進行深度分析</p>
            <button
              className="btn btn-primary text-sm px-4 py-1.5"
              onClick={() => handleGenerate(selectedUnanalyzed.id)}
              disabled={triggerMutation.isPending}
            >
              生成分析
            </button>
          </div>
        ) : triggerError ? (
          <div className="flex flex-col items-center justify-center h-48 gap-3">
            <AlertTriangle size={24} style={{ color: 'var(--color-danger, #e53e3e)' }} />
            <p className="text-sm" style={{ color: 'var(--color-danger, #e53e3e)' }}>{triggerError}</p>
            <button className="btn btn-secondary text-xs" onClick={() => setTriggerError(null)}>
              確認
            </button>
          </div>
        ) : (
          <div className="flex items-center justify-center h-48">
            <p className="text-sm" style={{ color: 'var(--fg-muted)' }}>選擇角色以查看或生成分析</p>
          </div>
        )}

        <ConfirmDialog
          open={confirmRegenerate}
          title="覆蓋重新生成"
          message="此操作將覆蓋現有結果並消耗 token，確認後執行？"
          onConfirm={() => {
            setConfirmRegenerate(false);
            if (selectedEntityId && bookId) {
              deleteEntityAnalysis(bookId, selectedEntityId).then(() => {
                queryClient.invalidateQueries({ queryKey: ['books', bookId, 'analysis', 'characters'] });
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
