import { useState, useMemo, useCallback, useEffect } from 'react';
import { useParams, useSearchParams } from 'react-router-dom';
import { Plus, Minus, X, Loader } from 'lucide-react';
import { useQuery } from '@tanstack/react-query';
import { useTranslation } from 'react-i18next';
import { useChatContext } from '@/contexts/ChatContext';
import { useBook } from '@/hooks/useBook';
import { useGraphData } from '@/hooks/useGraphData';
import { toCytoscapeElements } from '@/lib/graphTransform';
import { GraphCanvas } from '@/components/graph/GraphCanvas';
import { GraphToolbar, type AnimationMode } from '@/components/graph/GraphToolbar';
import { EntityDetailPanel } from '@/components/graph/EntityDetailPanel';
import { EventDetailPanel } from '@/components/graph/EventDetailPanel';
import { TimelineControls, type TimelineState } from '@/components/graph/TimelineControls';
import { LoadingSpinner } from '@/components/ui/LoadingSpinner';
import { ErrorMessage } from '@/components/ui/ErrorMessage';
import { MarkdownRenderer } from '@/components/ui/MarkdownRenderer';
import { fetchEntityAnalysis, fetchEventAnalyses } from '@/api/analysis';
import { fetchEntityChunks } from '@/api/chunks';
import { SegmentRenderer } from '@/components/reader/SegmentRenderer';
import type { GraphNode, EntityChunkItem } from '@/api/types';

const ALL_TYPES = new Set(['character', 'location', 'concept', 'event']);

type RightPanel = 'analysis' | 'paragraphs' | null;

const RIGHT_PANEL_WIDTH: Record<NonNullable<RightPanel>, number> = {
  analysis: 360,
  paragraphs: 400,
};

export default function GraphPage() {
  const { bookId } = useParams<{ bookId: string }>();
  const [searchParams] = useSearchParams();
  const { setPageContext } = useChatContext();
  const { data: book } = useBook(bookId);
  const { t: tStats } = useTranslation('graph');
  const [timelineState, setTimelineState] = useState<TimelineState | null>(null);
  const [animationMode, setAnimationMode] = useState<AnimationMode>('fade');
  const { data, isLoading, error } = useGraphData(bookId, timelineState ?? undefined);
  const [selectedNodeId, setSelectedNodeId] = useState<string | null>(null);
  const [searchQuery, setSearchQuery] = useState('');
  const [visibleTypes, setVisibleTypes] = useState(new Set(ALL_TYPES));
  const [rightPanel, setRightPanel] = useState<RightPanel>(null);

  // Auto-select entity from query param (e.g. navigating from analysis page)
  useEffect(() => {
    if (!data) return;
    const entityId = searchParams.get('entity');
    if (entityId) setSelectedNodeId(entityId);
  }, [data, searchParams]);

  const handleTypeToggle = (type: string) => {
    setVisibleTypes((prev) => {
      const next = new Set(prev);
      if (next.has(type)) next.delete(type);
      else next.add(type);
      return next;
    });
  };

  const handleReset = () => {
    setSearchQuery('');
    setVisibleTypes(new Set(ALL_TYPES));
    setSelectedNodeId(null);
    setRightPanel(null);
  };

  const handleNodeTap = useCallback((nodeId: string) => {
    setSelectedNodeId(nodeId);
    setRightPanel(null);
  }, []);

  const elements = useMemo(() => {
    if (!data) return [];
    return toCytoscapeElements(data);
  }, [data]);

  const filteredElements = useMemo(() => {
    const lowerQ = searchQuery.toLowerCase();
    const visibleNodeIds = new Set(
      elements
        .filter((el) => {
          if (el.group !== 'nodes') return false;
          if (!visibleTypes.has(String(el.data.entityType ?? ''))) return false;
          if (lowerQ && !String(el.data.label ?? '').toLowerCase().includes(lowerQ)) return false;
          return true;
        })
        .map((el) => el.data.id),
    );
    return elements.filter((el) => {
      if (el.group === 'edges') {
        return visibleNodeIds.has(el.data.source) && visibleNodeIds.has(el.data.target);
      }
      return visibleNodeIds.has(el.data.id);
    });
  }, [elements, searchQuery, visibleTypes]);

  const selectedNode: GraphNode | null = useMemo(() => {
    if (!selectedNodeId || !data) return null;
    return data.nodes.find((n) => n.id === selectedNodeId) ?? null;
  }, [selectedNodeId, data]);

  useEffect(() => {
    setPageContext({ page: 'graph', bookId, bookTitle: book?.title });
  }, [bookId, book?.title, setPageContext]);

  useEffect(() => {
    if (selectedNode) {
      setPageContext({ selectedEntity: { id: selectedNode.id, name: selectedNode.name, type: selectedNode.type } });
    } else {
      setPageContext({ selectedEntity: undefined });
    }
  }, [selectedNode, setPageContext]);

  if (isLoading) return <LoadingSpinner />;
  if (error) return <ErrorMessage message={error.message} />;

  const nodeCount = data?.nodes.length ?? 0;
  const edgeCount = data?.edges.length ?? 0;
  const rightPanelWidth = rightPanel ? RIGHT_PANEL_WIDTH[rightPanel] : 0;
  const entityPanelWidth = 260;
  const statsRight = selectedNode
    ? rightPanel
      ? rightPanelWidth + entityPanelWidth + 16
      : entityPanelWidth + 16
    : 16;

  return (
    <div className="relative h-full w-full">
      {/* Graph canvas — fills entire area, never resizes */}
      <GraphCanvas elements={filteredElements} onNodeTap={handleNodeTap} selectedNodeId={selectedNodeId} animationMode={animationMode} />

      {/* Floating toolbar (top-left) */}
      <GraphToolbar
        searchQuery={searchQuery}
        onSearchChange={setSearchQuery}
        visibleTypes={visibleTypes}
        onTypeToggle={handleTypeToggle}
        onReset={handleReset}
        animationMode={animationMode}
        onAnimationModeChange={setAnimationMode}
      />

      {/* Timeline snapshot controls (bottom-left, above zoom) */}
      {bookId && (
        <TimelineControls bookId={bookId} onChange={setTimelineState} />
      )}

      {/* Zoom controls (bottom-right) */}
      <div className="absolute bottom-4 right-4 flex flex-col gap-1 z-10">
        <button
          className="w-8 h-8 rounded-md flex items-center justify-center"
          style={{ backgroundColor: 'white', border: '1px solid var(--border)' }}
        >
          <Plus size={14} />
        </button>
        <button
          className="w-8 h-8 rounded-md flex items-center justify-center"
          style={{ backgroundColor: 'white', border: '1px solid var(--border)' }}
        >
          <Minus size={14} />
        </button>
      </div>

      {/* Stats (bottom-right) */}
      <div
        className="absolute bottom-4 text-xs px-2 py-1 rounded z-10"
        style={{
          right: statsRight,
          backgroundColor: 'white',
          border: '1px solid var(--border)',
          color: 'var(--fg-muted)',
          transition: 'right 200ms ease',
        }}
      >
        {tStats('stats', { nodes: nodeCount, edges: edgeCount })}
      </div>

      {/* Entity detail panel — slides left when right panel is open */}
      {selectedNode && bookId && (
        <div
          className="absolute top-0 h-full z-20"
          style={{
            right: rightPanelWidth,
            transition: 'right 200ms ease',
          }}
        >
          {selectedNode.type === 'event' ? (
            <EventDetailPanel
              key={selectedNode.id}
              node={selectedNode}
              bookId={bookId}
              onClose={() => {
                setSelectedNodeId(null);
                setRightPanel(null);
              }}
              onShowAnalysis={() => setRightPanel('analysis')}
            />
          ) : (
            <EntityDetailPanel
              key={selectedNode.id}
              node={selectedNode}
              bookId={bookId}
              onClose={() => {
                setSelectedNodeId(null);
                setRightPanel(null);
              }}
              onShowAnalysis={() => setRightPanel('analysis')}
              onShowParagraphs={() => setRightPanel('paragraphs')}
            />
          )}
        </div>
      )}

      {/* Right detail panel — analysis or paragraphs */}
      {rightPanel && selectedNode && bookId && (
        <div
          className="absolute top-0 right-0 h-full z-20"
          style={{
            width: RIGHT_PANEL_WIDTH[rightPanel],
            backgroundColor: 'var(--bg-primary)',
            borderLeft: '1px solid var(--border)',
          }}
        >
          {rightPanel === 'analysis' ? (
            <AnalysisPanel
              bookId={bookId}
              node={selectedNode}
              onClose={() => setRightPanel(null)}
            />
          ) : (
            <ParagraphsPanel
              bookId={bookId}
              node={selectedNode}
              onClose={() => setRightPanel(null)}
            />
          )}
        </div>
      )}
    </div>
  );
}

function AnalysisPanel({ bookId, node, onClose }: { bookId: string; node: GraphNode; onClose: () => void }) {
  const { t } = useTranslation('graph');
  const isEvent = node.type === 'event';

  const { data: entityAnalysis, isLoading: entityLoading } = useQuery({
    queryKey: ['books', bookId, 'entities', node.id, 'analysis'],
    queryFn: () => fetchEntityAnalysis(bookId, node.id),
    retry: false,
    enabled: !isEvent,
  });

  const { data: eventAnalyses, isLoading: eventLoading } = useQuery({
    queryKey: ['books', bookId, 'analysis', 'events'],
    queryFn: () => fetchEventAnalyses(bookId),
    retry: false,
    enabled: isEvent,
  });

  const eventAnalysis = isEvent
    ? eventAnalyses?.analyzed.find((a) => a.entityId === node.id)
    : undefined;

  const isLoading = isEvent ? eventLoading : entityLoading;
  const content = isEvent ? eventAnalysis?.content : entityAnalysis?.content;

  return (
    <div className="flex flex-col h-full overflow-hidden">
      <div
        className="flex items-center justify-between p-3 flex-shrink-0"
        style={{ borderBottom: '1px solid var(--border)' }}
      >
        <h3 className="text-sm font-semibold" style={{ fontFamily: 'var(--font-serif)', color: 'var(--fg-primary)' }}>
          {isEvent ? t('analysisPanel.eventTitle', { name: node.name }) : t('analysisPanel.entityTitle', { name: node.name })}
        </h3>
        <button onClick={onClose} style={{ color: 'var(--fg-muted)' }}>
          <X size={16} />
        </button>
      </div>
      <div className="flex-1 overflow-y-auto p-4">
        {isLoading ? (
          <div className="flex items-center gap-2">
            <Loader size={12} className="animate-spin" style={{ color: 'var(--fg-muted)' }} />
            <span className="text-xs" style={{ color: 'var(--fg-muted)' }}>{t('analysisPanel.loading')}</span>
          </div>
        ) : content ? (
          <MarkdownRenderer content={content} compact />
        ) : (
          <p className="text-xs" style={{ color: 'var(--fg-muted)' }}>
            {isEvent ? t('analysisPanel.noEventAnalysis') : t('analysisPanel.noEntityAnalysis')}
          </p>
        )}
      </div>
    </div>
  );
}

function ParagraphsPanel({ bookId, node, onClose }: { bookId: string; node: GraphNode; onClose: () => void }) {
  const { t } = useTranslation('graph');
  const { data, isLoading } = useQuery({
    queryKey: ['books', bookId, 'entities', node.id, 'chunks'],
    queryFn: () => fetchEntityChunks(bookId, node.id),
  });

  // Group chunks by chapter
  const grouped = useMemo(() => {
    if (!data?.chunks) return [];
    const map = new Map<number, { chapterId: string; title: string | undefined; chunks: EntityChunkItem[] }>();
    for (const chunk of data.chunks) {
      let group = map.get(chunk.chapterNumber);
      if (!group) {
        group = { chapterId: chunk.chapterId, title: chunk.chapterTitle, chunks: [] };
        map.set(chunk.chapterNumber, group);
      }
      group.chunks.push(chunk);
    }
    return Array.from(map.entries()).sort(([a], [b]) => a - b);
  }, [data]);

  return (
    <div className="flex flex-col h-full overflow-hidden">
      <div
        className="flex items-center justify-between p-3 flex-shrink-0"
        style={{ borderBottom: '1px solid var(--border)' }}
      >
        <h3 className="text-sm font-semibold" style={{ fontFamily: 'var(--font-serif)', color: 'var(--fg-primary)' }}>
          {t('paragraphsPanel.title', { name: node.name })}
        </h3>
        <button onClick={onClose} style={{ color: 'var(--fg-muted)' }}>
          <X size={16} />
        </button>
      </div>
      <div className="flex-1 overflow-y-auto p-4 space-y-4">
        {isLoading ? (
          <div className="flex items-center gap-2">
            <Loader size={12} className="animate-spin" style={{ color: 'var(--fg-muted)' }} />
            <span className="text-xs" style={{ color: 'var(--fg-muted)' }}>{t('paragraphsPanel.loading')}</span>
          </div>
        ) : data && data.total > 0 ? (
          <>
            <p className="text-xs" style={{ color: 'var(--fg-muted)' }}>
              {t('paragraphsPanel.total', { count: data.total })}
            </p>
            {grouped.map(([chapterNum, group]) => (
              <div key={chapterNum}>
                <h4
                  className="text-xs font-semibold mb-2 sticky top-0 py-1"
                  style={{ color: 'var(--fg-secondary)', backgroundColor: 'var(--bg-primary)' }}
                >
                  {group.title || t('paragraphsPanel.chapterTitle', { chapter: chapterNum })}
                </h4>
                <div className="space-y-2">
                  {group.chunks.map((chunk) => (
                    <div
                      key={chunk.id}
                      className="text-xs leading-relaxed p-2 rounded"
                      style={{ backgroundColor: 'var(--bg-secondary)', color: 'var(--fg-primary)' }}
                    >
                      <SegmentRenderer segments={chunk.segments} />
                    </div>
                  ))}
                </div>
              </div>
            ))}
          </>
        ) : (
          <p className="text-xs" style={{ color: 'var(--fg-muted)' }}>{t('paragraphsPanel.noData')}</p>
        )}
      </div>
    </div>
  );
}
