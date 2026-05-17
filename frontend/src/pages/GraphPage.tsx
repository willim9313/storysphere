import { useState, useMemo, useCallback, useEffect, useRef } from 'react';
import { useParams, useSearchParams } from 'react-router-dom';
import { Plus, Minus, X, Loader } from 'lucide-react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { useTranslation } from 'react-i18next';
import { useChatContext } from '@/contexts/ChatContext';
import { useBook } from '@/hooks/useBook';
import { useGraphData } from '@/hooks/useGraphData';
import { useLocalStorage } from '@/hooks/useLocalStorage';
import { toCytoscapeElements, toClusteredCytoscapeElements } from '@/lib/graphTransform';
import { byType, isSuperNodeId } from '@/services/kgClustering';
import { GraphCanvas, type GraphCanvasHandle, type ViewportSnapshot } from '@/components/graph/GraphCanvas';
import { GraphToolbar, type AnimationMode, type ClusterMode } from '@/components/graph/GraphToolbar';
import { EntityDetailPanel } from '@/components/graph/EntityDetailPanel';
import { EventDetailPanel } from '@/components/graph/EventDetailPanel';
import { LensCard, type TimelineState } from '@/components/graph/LensCard';
import { LegendCard } from '@/components/graph/LegendCard';
import { MiniMap } from '@/components/graph/MiniMap';
import { SearchDropdown } from '@/components/graph/SearchDropdown';
import { ClusterOverviewPanel } from '@/components/graph/ClusterOverviewPanel';
import { BreadcrumbBar } from '@/components/graph/BreadcrumbBar';
import { EntityComparePanel } from '@/components/graph/EntityComparePanel';
import { InferredEdgePanel } from '@/components/graph/InferredEdgePanel';
import { LoadingSpinner } from '@/components/ui/LoadingSpinner';
import { ErrorMessage } from '@/components/ui/ErrorMessage';
import { MarkdownRenderer } from '@/components/ui/MarkdownRenderer';
import { fetchEntityAnalysis, fetchEventAnalyses } from '@/api/analysis';
import { fetchEntityChunks } from '@/api/chunks';
import { fetchChapters } from '@/api/chapters';
import { SegmentRenderer } from '@/components/reader/SegmentRenderer';
import { runInference } from '@/api/graph';
import type { EntityType, GraphNode, EntityChunkItem } from '@/api/types';

const ALL_TYPES = new Set<string>(['character', 'location', 'concept', 'event', 'organization', 'object', 'other']);
const MULTI_SELECT_CAP = 2;

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
  const { t, t: tStats } = useTranslation('graph');
  const queryClient = useQueryClient();

  const [timelineState, setTimelineState] = useState<TimelineState | null>(null);
  const [animationMode, setAnimationMode] = useState<AnimationMode>('fade');
  const [showInferred, setShowInferred] = useState(false);
  const [selectedInferredId, setSelectedInferredId] = useState<string | null>(null);
  const [inferredReviewOpen, setInferredReviewOpen] = useState(false);
  const [clusterMode, setClusterMode] = useLocalStorage<ClusterMode>(
    `graph:${bookId ?? '-'}:clusterMode`,
    'node',
  );
  const [clusterDrillIn, setClusterDrillIn] = useState<EntityType | null>(null);
  const [selectedNodeId, setSelectedNodeId] = useState<string | null>(null);
  const [selectedNodeIds, setSelectedNodeIds] = useState<string[]>([]);
  const [searchQuery, setSearchQuery] = useState('');
  const [searchOpen, setSearchOpen] = useState(false);
  const [visibleTypes, setVisibleTypes] = useState<Set<string>>(new Set(ALL_TYPES));
  const [rightPanel, setRightPanel] = useState<RightPanel>(null);
  const [unknownEntityIds, setUnknownEntityIds] = useState<Set<string>>(new Set());
  const [bookmarkedIds, setBookmarkedIds] = useLocalStorage<string[]>(
    `graph:${bookId ?? '-'}:bookmarks`,
    [],
  );
  const [viewportSnap, setViewportSnap] = useState<ViewportSnapshot | null>(null);

  const canvasRef = useRef<GraphCanvasHandle>(null);

  const { data, isLoading, error } = useGraphData(bookId, timelineState ?? undefined, showInferred);

  const { data: chapters } = useQuery({
    queryKey: ['books', bookId, 'chapters'],
    queryFn: () => fetchChapters(bookId!),
    enabled: !!bookId,
  });

  const inferMutation = useMutation({
    mutationFn: () => runInference(bookId!, true),
    onSuccess: () => {
      setShowInferred(true);
      queryClient.invalidateQueries({ queryKey: ['books', bookId, 'graph'] });
      queryClient.invalidateQueries({ queryKey: ['books', bookId, 'inferred-relations'] });
    },
  });

  const inferredCount = useMemo(
    () => data?.edges.filter((e) => e.inferred).length ?? 0,
    [data],
  );

  // Cluster transform — only when mode is 'type' (community is disabled in V1)
  const clusteredGraph = useMemo(() => {
    if (clusterMode !== 'type' || !data) return null;
    return byType(data);
  }, [clusterMode, data]);

  const elements = useMemo(() => {
    if (!data) return [];
    if (clusteredGraph) {
      return toClusteredCytoscapeElements(clusteredGraph, (type, count) => {
        return `${t(`entityTypes.${type}`)} · ${count}`;
      });
    }
    return toCytoscapeElements(data);
  }, [data, clusteredGraph, t]);

  const filteredElements = useMemo(() => {
    const lowerQ = searchQuery.toLowerCase();
    const visibleNodeIds = new Set(
      elements
        .filter((el) => {
          if (el.group !== 'nodes') return false;
          if (el.data.cluster) return true; // cluster super-nodes always visible
          const type = String(el.data.entityType ?? '');
          if (!visibleTypes.has(type)) return false;
          if (lowerQ && !String(el.data.label ?? '').toLowerCase().includes(lowerQ)) return false;
          return true;
        })
        .map((el) => el.data.id as string),
    );
    return elements.filter((el) => {
      if (el.group === 'edges') {
        return visibleNodeIds.has(el.data.source as string) && visibleNodeIds.has(el.data.target as string);
      }
      return visibleNodeIds.has(el.data.id as string);
    });
  }, [elements, searchQuery, visibleTypes]);

  // Epistemic dim: greying selected character's unknown nodes
  const epistemicStylesheet = useMemo(() => {
    if (unknownEntityIds.size === 0) return [];
    return Array.from(unknownEntityIds).map((id) => ({
      selector: `node[id = "${id}"]`,
      style: {
        'background-color': '#e5e7eb',
        'border-color': '#9ca3af',
        'border-style': 'dashed',
        'border-width': 2,
        color: '#9ca3af',
      } as Record<string, unknown>,
    }));
  }, [unknownEntityIds]);

  // Auto-select entity from query param
  useEffect(() => {
    if (!data) return;
    const entityId = searchParams.get('entity');
    if (entityId) setSelectedNodeId(entityId);
  }, [data, searchParams]);

  // Multi-select changes → clear single selection mode
  const handleNodeTap = useCallback(
    (nodeId: string, mods: { shift: boolean }) => {
      // Cluster super-node click → drill-in instead of single select
      if (isSuperNodeId(nodeId)) {
        if (clusteredGraph) {
          const sn = clusteredGraph.superNodes.find((s) => s.id === nodeId);
          if (sn) setClusterDrillIn(sn.clusterType as EntityType);
        }
        return;
      }
      if (mods.shift) {
        setSelectedNodeIds((prev) => {
          const next = prev.includes(nodeId) ? prev.filter((x) => x !== nodeId) : [...prev, nodeId];
          if (next.length > MULTI_SELECT_CAP) next.shift();
          return next;
        });
        setSelectedNodeId(null);
        setRightPanel(null);
      } else {
        setSelectedNodeIds([]);
        setSelectedNodeId(nodeId);
        setRightPanel(null);
      }
    },
    [clusteredGraph],
  );

  const handleEdgeTap = useCallback((_edgeId: string, inferredId: string | null) => {
    if (inferredId) {
      setSelectedInferredId(inferredId);
      setInferredReviewOpen(true);
    }
  }, []);

  const handleTypeToggle = useCallback((type: EntityType) => {
    setVisibleTypes((prev) => {
      const next = new Set(prev);
      if (next.has(type)) next.delete(type);
      else next.add(type);
      return next;
    });
  }, []);

  const handleReset = useCallback(() => {
    setSearchQuery('');
    setSearchOpen(false);
    setVisibleTypes(new Set(ALL_TYPES));
    setSelectedNodeId(null);
    setSelectedNodeIds([]);
    setRightPanel(null);
    setClusterDrillIn(null);
  }, []);

  const handleViewportChange = useCallback((snap: ViewportSnapshot) => {
    setViewportSnap(snap);
  }, []);

  const handleBookmarkRemove = useCallback(
    (id: string) => setBookmarkedIds((prev) => prev.filter((x) => x !== id)),
    [setBookmarkedIds],
  );

  const handleBookmarkAdd = useCallback(
    (id: string) =>
      setBookmarkedIds((prev) => (prev.includes(id) ? prev : [...prev, id])),
    [setBookmarkedIds],
  );

  const selectedNode: GraphNode | null = useMemo(() => {
    if (!selectedNodeId || !data) return null;
    return data.nodes.find((n) => n.id === selectedNodeId) ?? null;
  }, [selectedNodeId, data]);

  const compareNodes = useMemo<[GraphNode, GraphNode] | null>(() => {
    if (selectedNodeIds.length !== 2 || !data) return null;
    const a = data.nodes.find((n) => n.id === selectedNodeIds[0]);
    const b = data.nodes.find((n) => n.id === selectedNodeIds[1]);
    if (!a || !b) return null;
    return [a, b];
  }, [selectedNodeIds, data]);

  useEffect(() => {
    setPageContext({ page: 'graph', bookId, bookTitle: book?.title });
  }, [bookId, book?.title, setPageContext]);

  useEffect(() => {
    if (selectedNode) {
      setPageContext({
        selectedEntity: { id: selectedNode.id, name: selectedNode.name, type: selectedNode.type },
      });
    } else {
      setPageContext({ selectedEntity: undefined });
    }
  }, [selectedNode, setPageContext]);

  // Breadcrumb items for drill-in
  const breadcrumbItems = useMemo(() => {
    if (clusterMode === 'node') return [];
    const items = [
      { label: t('toolbar.graphRoot', '知識圖譜'), onClick: () => { setClusterMode('node'); setClusterDrillIn(null); } },
      { label: t('v1.cluster.mode.type'), onClick: clusterDrillIn ? () => setClusterDrillIn(null) : undefined },
    ];
    if (clusterDrillIn) {
      items.push({ label: t(`entityTypes.${clusterDrillIn}`), onClick: undefined });
    }
    return items;
  }, [clusterMode, clusterDrillIn, t, setClusterMode]);

  if (isLoading) return <LoadingSpinner />;
  if (error) return <ErrorMessage message={error.message} />;

  const nodeCount = data?.nodes.length ?? 0;
  const edgeCount = data?.edges.length ?? 0;

  // Decide right panel rendering
  const showCompare = !!compareNodes;
  const showInferredReview = !showCompare && (inferredReviewOpen || !!selectedInferredId);
  const showClusterOverview = !showCompare && !showInferredReview && clusterMode === 'type' && !selectedNode;
  const showEntityDetail = !showCompare && !showInferredReview && !showClusterOverview && !!selectedNode;
  const rightOpen = showCompare || showInferredReview || showClusterOverview || showEntityDetail || !!rightPanel;
  const rightPanelExtraWidth = rightPanel ? RIGHT_PANEL_WIDTH[rightPanel] : 0;
  const statsRight = rightOpen ? 16 + 280 + rightPanelExtraWidth : 16;

  return (
    <div className="relative h-full w-full">
      <GraphCanvas
        ref={canvasRef}
        elements={filteredElements}
        onNodeTap={handleNodeTap}
        onEdgeTap={handleEdgeTap}
        selectedNodeId={selectedNodeId}
        selectedNodeIds={selectedNodeIds}
        animationMode={animationMode}
        extraStylesheet={epistemicStylesheet}
        onViewportChange={handleViewportChange}
      />

      {/* Toolbar (top-left) */}
      <GraphToolbar
        searchQuery={searchQuery}
        onSearchChange={(q) => {
          setSearchQuery(q);
          setSearchOpen(q.length > 0);
        }}
        onSearchFocus={() => searchQuery.length > 0 && setSearchOpen(true)}
        onReset={handleReset}
        clusterMode={clusterMode}
        onClusterModeChange={(m) => {
          setClusterMode(m);
          setClusterDrillIn(null);
          setSelectedNodeId(null);
          setSelectedNodeIds([]);
        }}
        animationMode={animationMode}
        onAnimationModeChange={setAnimationMode}
        showInferred={showInferred}
        inferredCount={inferredCount}
        onShowInferredChange={(v) => {
          setShowInferred(v);
          setInferredReviewOpen(v);
          if (!v) setSelectedInferredId(null);
        }}
        onRunInference={() => inferMutation.mutate()}
        isRunningInference={inferMutation.isPending}
        hasInferredData={inferMutation.data !== undefined || inferredCount > 0}
      />

      {/* Search dropdown (Scenario D) */}
      <SearchDropdown
        query={searchQuery}
        entities={data?.nodes ?? []}
        chapters={chapters ?? []}
        open={searchOpen}
        onClose={() => setSearchOpen(false)}
        onSelectEntity={(id) => {
          setSelectedNodeId(id);
          setSelectedNodeIds([]);
          setSearchOpen(false);
          setSearchQuery('');
        }}
        onSelectChapter={() => {
          setSearchOpen(false);
        }}
      />

      {/* Breadcrumb (Scenario C) */}
      <BreadcrumbBar items={breadcrumbItems} />

      {/* Legend (top-right) */}
      <LegendCard
        graph={data}
        visibleTypes={visibleTypes}
        onTypeToggle={handleTypeToggle}
        inferredCount={inferredCount}
        inferredVisible={showInferred}
        onInferredToggle={() => {
          const v = !showInferred;
          setShowInferred(v);
          setInferredReviewOpen(v);
        }}
      />

      {/* Lens card (bottom-left) — consolidates timeline / epistemic / bookmarks */}
      {bookId && (
        <LensCard
          bookId={bookId}
          nodes={data?.nodes ?? []}
          bookmarkedIds={bookmarkedIds}
          onBookmarkRemove={handleBookmarkRemove}
          onBookmarkClick={(id) => {
            setSelectedNodeId(id);
            setSelectedNodeIds([]);
          }}
          onTimelineChange={setTimelineState}
          onUnknownEntityIds={setUnknownEntityIds}
        />
      )}

      {/* Mini-map (bottom-right) */}
      {viewportSnap && (
        <MiniMap
          nodes={viewportSnap.nodes}
          edges={viewportSnap.edges}
          viewport={viewportSnap.viewport}
          onRecenter={(gx, gy) => canvasRef.current?.centerOn(gx, gy)}
          onPanByGraph={(dx, dy) => canvasRef.current?.panByGraph(dx, dy)}
        />
      )}

      {/* Zoom controls (above mini-map) */}
      <div className="absolute right-4 flex flex-col gap-1 z-10" style={{ bottom: 140 }}>
        <button
          className="w-8 h-8 rounded-md flex items-center justify-center"
          style={{
            backgroundColor: 'var(--bg-primary)',
            border: '1px solid var(--border)',
            color: 'var(--fg-secondary)',
          }}
          aria-label="Zoom in"
        >
          <Plus size={14} />
        </button>
        <button
          className="w-8 h-8 rounded-md flex items-center justify-center"
          style={{
            backgroundColor: 'var(--bg-primary)',
            border: '1px solid var(--border)',
            color: 'var(--fg-secondary)',
          }}
          aria-label="Zoom out"
        >
          <Minus size={14} />
        </button>
      </div>

      {/* Stats */}
      <div
        className="absolute bottom-4 text-xs px-2 py-1 rounded z-10"
        style={{
          right: statsRight,
          backgroundColor: 'var(--bg-primary)',
          border: '1px solid var(--border)',
          color: 'var(--fg-muted)',
          transition: 'right var(--transition-normal, 250ms) ease',
        }}
      >
        {tStats('stats', { nodes: nodeCount, edges: edgeCount })}
      </div>

      {/* Right-side panels — priority: compare > inferred review > cluster overview > entity */}
      {showCompare && compareNodes && bookId && (
        <EntityComparePanel
          bookId={bookId}
          a={compareNodes[0]}
          b={compareNodes[1]}
          onClose={() => setSelectedNodeIds([])}
        />
      )}

      {showInferredReview && bookId && (
        <InferredEdgePanel
          bookId={bookId}
          focusInferredId={selectedInferredId}
          onClose={() => {
            setInferredReviewOpen(false);
            setSelectedInferredId(null);
          }}
        />
      )}

      {showClusterOverview && clusteredGraph && bookId && (
        <div
          className="absolute top-0 right-0 h-full z-20"
          style={{
            width: 280,
            backgroundColor: 'var(--bg-primary)',
            borderLeft: '1px solid var(--border)',
          }}
        >
          <ClusterOverviewPanel
            clustered={clusteredGraph}
            graphNodes={data?.nodes ?? []}
            drillInType={clusterDrillIn}
            onClose={() => {
              setClusterMode('node');
              setClusterDrillIn(null);
            }}
            onDrillIn={(type) => setClusterDrillIn(type)}
            onExitDrillIn={() => setClusterDrillIn(null)}
            onMemberSelect={(id) => {
              setSelectedNodeId(id);
              setClusterMode('node');
              setClusterDrillIn(null);
            }}
          />
        </div>
      )}

      {showEntityDetail && selectedNode && bookId && (
        <div
          className="absolute top-0 h-full z-20"
          style={{
            right: rightPanelExtraWidth,
            transition: 'right var(--transition-normal, 250ms) ease',
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
              isBookmarked={bookmarkedIds.includes(selectedNode.id)}
              onBookmarkToggle={() =>
                bookmarkedIds.includes(selectedNode.id)
                  ? handleBookmarkRemove(selectedNode.id)
                  : handleBookmarkAdd(selectedNode.id)
              }
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

      {/* Secondary detail layer (analysis / paragraphs) */}
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
  const content = isEvent
    ? eventAnalysis?.content
    : (entityAnalysis as unknown as { content?: string } | undefined)?.content;

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
