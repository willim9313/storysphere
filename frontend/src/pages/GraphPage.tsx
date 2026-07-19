import { useState, useMemo, useCallback, useEffect, useRef } from 'react';
import { useParams, useSearchParams } from 'react-router-dom';
import { Plus, Minus, X, Loader, Shapes } from 'lucide-react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { useTranslation } from 'react-i18next';
import { useChatContext } from '@/contexts/ChatContext';
import { useTheme } from '@/contexts/ThemeContext';
import { useBook } from '@/hooks/useBook';
import { useGraphData } from '@/hooks/useGraphData';
import { useLocalStorage } from '@/hooks/useLocalStorage';
import {
  toCytoscapeElements,
  toClusteredCytoscapeElements,
  partitionOrphanNodes,
  classifyRelationLabel,
  POSITIVE_RELATION_LABELS,
  NEGATIVE_RELATION_LABELS,
  type OrphanNode,
} from '@/lib/graphTransform';
import { byCommunity, byType, isSuperNodeId } from '@/services/kgClustering';
import { fetchFactionAnalysis } from '@/api/factions';
import { GraphCanvas, type GraphCanvasHandle, type ViewportSnapshot } from '@/components/graph/GraphCanvas';
import { GraphOnboardingHero } from '@/components/graph/GraphOnboardingHero';
import { GraphToolbar, resolveInferenceState, type AnimationMode, type ClusterMode } from '@/components/graph/GraphToolbar';
import { EntityDetailPanel } from '@/components/graph/EntityDetailPanel';
import { EventDetailPanel } from '@/components/graph/EventDetailPanel';
import { LensCard, type TimelineState } from '@/components/graph/LensCard';
import { LegendCard } from '@/components/graph/LegendCard';
import { MiniMap } from '@/components/graph/MiniMap';
import { SearchDropdown } from '@/components/graph/SearchDropdown';
import { ClusterOverviewPanel, type FactionSettings } from '@/components/graph/ClusterOverviewPanel';
import { FactionCanvas, layoutFactions } from '@/components/graph/FactionCanvas';
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
import { runInference, fetchInferredRelations } from '@/api/graph';
import type { EntityType, GraphNode, EntityChunkItem } from '@/api/types';

const readCssVar = (name: string) => getComputedStyle(document.documentElement).getPropertyValue(name).trim();

const ALL_TYPES = new Set<string>(['character', 'location', 'concept', 'event', 'organization', 'object', 'other']);
const MULTI_SELECT_CAP = 2;

// Matches the abbreviated --graph-{key}-* token keys (see tokens.css / same
// map in LegendCard.tsx) used to color the orphan drawer's pill dots.
const ORPHAN_TYPE_KEY: Record<string, string> = {
  character: 'char',
  location: 'loc',
  organization: 'org',
  object: 'obj',
  concept: 'con',
  event: 'evt',
  other: 'other',
};

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
  const { theme } = useTheme();

  const [timelineState, setTimelineState] = useState<TimelineState | null>(null);
  // C7 裁決：移除「淡入/逐個」動畫模式 UI，固定淡入。GraphCanvas 的
  // AnimationMode prop/型別維持不變，只是不再從使用者輸入。
  const animationMode: AnimationMode = 'fade';
  const [showInferred, setShowInferred] = useState(false);
  const [selectedInferredId, setSelectedInferredId] = useState<string | null>(null);
  const [inferredReviewOpen, setInferredReviewOpen] = useState(false);
  const [clusterMode, setClusterMode] = useLocalStorage<ClusterMode>(
    `graph:${bookId ?? '-'}:clusterMode`,
    'node',
  );
  const [clusterDrillIn, setClusterDrillIn] = useState<string | null>(null);
  const [selectedNodeId, setSelectedNodeId] = useState<string | null>(null);
  const [selectedNodeIds, setSelectedNodeIds] = useState<string[]>([]);
  const [searchQuery, setSearchQuery] = useState('');
  const [searchOpen, setSearchOpen] = useState(false);
  const [visibleTypes, setVisibleTypes] = useState<Set<string>>(new Set(ALL_TYPES));
  const [rightPanel, setRightPanel] = useState<RightPanel>(null);
  const [unknownEntityIds, setUnknownEntityIds] = useState<Set<string>>(new Set());
  const [misbeliefEventIds, setMisbeliefEventIds] = useState<Set<string>>(new Set());
  const [bookmarkedIds, setBookmarkedIds] = useLocalStorage<string[]>(
    `graph:${bookId ?? '-'}:bookmarks`,
    [],
  );
  const [viewportSnap, setViewportSnap] = useState<ViewportSnapshot | null>(null);
  const [orphanOpen, setOrphanOpen] = useState(false);

  const canvasRef = useRef<GraphCanvasHandle>(null);

  const { data, isLoading, error } = useGraphData(bookId, timelineState ?? undefined, showInferred);

  const { data: chapters } = useQuery({
    queryKey: ['books', bookId, 'chapters'],
    queryFn: () => fetchChapters(bookId!),
    enabled: !!bookId,
  });

  // Same call serves both the idle-state "執行推論" and the ready-state
  // "安全重跑" menu item — both only score new entity pairs and preserve
  // existing adopted/rejected decisions.
  const inferMutation = useMutation({
    mutationFn: () => runInference(bookId!),
    onSuccess: () => {
      setShowInferred(true);
      queryClient.invalidateQueries({ queryKey: ['books', bookId, 'graph'] });
      queryClient.invalidateQueries({ queryKey: ['books', bookId, 'inferred-relations'] });
    },
  });

  // Destructive rerun: bypasses skip list, resets every record (incl. past
  // adopt/reject decisions) back to PENDING. Gated behind confirm().
  const forceRerunMutation = useMutation({
    mutationFn: () => runInference(bookId!, true),
    onSuccess: () => {
      setShowInferred(true);
      queryClient.invalidateQueries({ queryKey: ['books', bookId, 'graph'] });
      queryClient.invalidateQueries({ queryKey: ['books', bookId, 'inferred-relations'] });
    },
  });

  const handleForceRerun = useCallback(() => {
    const ok = globalThis.confirm(t('v1.inferred.review.rerunForceConfirm'));
    if (ok) forceRerunMutation.mutate();
  }, [forceRerunMutation, t]);

  // Toolbar's three-state inference control (brief §4: idle / running /
  // ready-with-records). `pendingCount`'s query key intentionally matches
  // InferredEdgePanel's so the two share one cache entry instead of double-
  // fetching when the panel is open. `allInferredData.total` (unfiltered)
  // is the "有紀錄" signal for idle vs ready.
  const { data: pendingInferredData } = useQuery({
    queryKey: ['books', bookId, 'inferred-relations', 'pending'],
    queryFn: () => fetchInferredRelations(bookId!, 'pending'),
    enabled: !!bookId,
  });
  const { data: allInferredData } = useQuery({
    queryKey: ['books', bookId, 'inferred-relations', 'all'],
    queryFn: () => fetchInferredRelations(bookId!),
    enabled: !!bookId,
  });
  const pendingCount = pendingInferredData?.total ?? 0;
  const inferredRecordTotal = allInferredData?.total ?? 0;
  const decidedCount = Math.max(0, inferredRecordTotal - pendingCount);
  const inferenceState = resolveInferenceState(
    inferMutation.isPending || forceRerunMutation.isPending,
    inferredRecordTotal,
  );

  const inferredCount = useMemo(
    () => data?.edges.filter((e) => e.inferred).length ?? 0,
    [data],
  );

  // Faction detection params. `draft` is bound to UI sliders; `applied` is
  // what the query actually uses — pressing "Recompute" promotes draft→applied,
  // avoiding a refetch on every slider tick.
  const [factionDraft, setFactionDraft] = useState<FactionSettings>({
    resolution: 1.0,
    minClusterSize: 2,
  });
  const [factionApplied, setFactionApplied] = useState<FactionSettings>({
    resolution: 1.0,
    minClusterSize: 2,
  });

  // Faction analysis — only fetched when community mode is active.
  const { data: factionData, isFetching: isFactionFetching } = useQuery({
    queryKey: [
      'books',
      bookId,
      'analysis',
      'factions',
      factionApplied.resolution,
      factionApplied.minClusterSize,
    ],
    queryFn: () =>
      fetchFactionAnalysis(bookId!, {
        resolution: factionApplied.resolution,
        minClusterSize: factionApplied.minClusterSize,
      }),
    enabled: !!bookId && clusterMode === 'community',
    staleTime: 5 * 60 * 1000,
  });

  // Cluster transform — picks up 'type' or 'community' grouping.
  const clusteredGraph = useMemo(() => {
    if (clusterMode === 'node' || !data) return null;
    if (clusterMode === 'type') return byType(data);
    if (clusterMode === 'community' && factionData) return byCommunity(data, factionData);
    return null;
  }, [clusterMode, data, factionData]);

  // Faction positions for the bottom-right mini-map (community mode).
  // Mirrors FactionCanvas's layout so the mini-map and main canvas stay aligned.
  const factionMiniMap = useMemo(() => {
    if (!factionData?.factions?.length) {
      return { nodes: [] as { id: string; x: number; y: number; type: string }[], edges: [] as { source: string; target: string }[] };
    }
    const positions = layoutFactions(factionData.factions, null);
    const nodes = factionData.factions
      .map((f) => {
        const p = positions.get(f.id);
        if (!p) return null;
        return { id: f.id, x: p.x, y: p.y, type: 'character' };
      })
      .filter((n): n is { id: string; x: number; y: number; type: string } => n !== null);
    const edges = (factionData.relations ?? []).map((r) => ({
      source: r.sourceFactionId,
      target: r.targetFactionId,
    }));
    return { nodes, edges };
  }, [factionData]);
  const factionMiniMapNodes = factionMiniMap.nodes;
  const factionMiniMapEdges = factionMiniMap.edges;

  const elements = useMemo(() => {
    if (!data) return [];
    if (clusteredGraph) {
      // 2-line label: cluster name on top, "{count} 個節點" sublabel below
      // (rendered via text-wrap: wrap in cytoscapeConfig).
      return toClusteredCytoscapeElements(clusteredGraph, (type, count) => {
        const sn = clusteredGraph.superNodes.find((s) => s.clusterType === type);
        const title = sn?.label ?? t(`entityTypes.${type}`);
        return `${title}\n${t('v1.cluster.members', { n: count })}`;
      });
    }
    return toCytoscapeElements(data);
  }, [data, clusteredGraph, t]);

  // Degree-0 entities (never appear in any relation) are pulled out of the
  // canvas element list — rendering them left a floating grid next to the
  // main graph (brief §3-3). Computed from the full (unfiltered) element set
  // so toggling type/search filters never turns a real orphan back into a
  // false one, or vice versa. Only applies to individual view — cluster
  // super-nodes aggregate everything, so there's no orphan concept there.
  const { connected: connectedElements, orphans } = useMemo(() => {
    if (clusteredGraph) return { connected: elements, orphans: [] as OrphanNode[] };
    return partitionOrphanNodes(elements);
  }, [elements, clusteredGraph]);

  const filteredElements = useMemo(() => {
    const lowerQ = searchQuery.toLowerCase();
    const visibleNodeIds = new Set(
      connectedElements
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
    return connectedElements.filter((el) => {
      if (el.group === 'edges') {
        return visibleNodeIds.has(el.data.source as string) && visibleNodeIds.has(el.data.target as string);
      }
      return visibleNodeIds.has(el.data.id as string);
    });
  }, [connectedElements, searchQuery, visibleTypes]);

  // Edge semantic coloring (brief §3-8: individual view edges were all one
  // muted color). `edge.label` is the raw RelationType enum value; classify
  // it into a color bucket and read the actual token hex via readCssVar
  // (cytoscape only accepts hex/rgb). Inferred edges are excluded — they
  // keep their existing accent treatment from cytoscapeConfig.ts untouched.
  const relationEdgeStylesheet = useMemo(() => {
    const bucketColor: Record<'positive' | 'negative', string> = {
      positive: readCssVar('--color-success') || '#3f7d5c',
      negative: readCssVar('--color-error') || '#b3454a',
    };
    return [...POSITIVE_RELATION_LABELS, ...NEGATIVE_RELATION_LABELS].map((label) => {
      const bucket = classifyRelationLabel(label) as 'positive' | 'negative';
      return {
        selector: `edge[label = "${label}"][!inferred]`,
        style: { 'line-color': bucketColor[bucket] } as Record<string, unknown>,
      };
    });
    // eslint-disable-next-line react-hooks/exhaustive-deps -- `theme` is an intentional cache-buster: forces re-reading CSS vars when the theme switches
  }, [theme]);

  // Epistemic dim: greying selected character's unknown nodes
  const epistemicStylesheet = useMemo(() => {
    if (unknownEntityIds.size === 0) return [];
    const dimBg = readCssVar('--bg-tertiary');
    const dimFg = readCssVar('--fg-muted');
    return Array.from(unknownEntityIds).map((id) => ({
      selector: `node[id = "${id}"]`,
      style: {
        'background-color': dimBg,
        'border-color': dimFg,
        'border-style': 'dashed',
        'border-width': 2,
        color: dimFg,
      } as Record<string, unknown>,
    }));
    // eslint-disable-next-line react-hooks/exhaustive-deps -- `theme` is an intentional cache-buster: forces re-reading CSS vars (getComputedStyle reads the live data-theme) when the theme switches
  }, [unknownEntityIds, theme]);

  // Misbelief markers (LensCard epistemic tab "標記角色誤信" toggle): warning-
  // colored border on the event node(s) each misbelief traces back to.
  // Rendered after epistemicStylesheet so its border-color wins on nodes
  // that are both "unknown" (dashed) and a misbelief source.
  const misbeliefStylesheet = useMemo(() => {
    if (misbeliefEventIds.size === 0) return [];
    const warn = readCssVar('--color-warning');
    return Array.from(misbeliefEventIds).map((id) => ({
      selector: `node[id = "${id}"]`,
      style: {
        'border-color': warn,
        'border-width': 3,
      } as Record<string, unknown>,
    }));
    // eslint-disable-next-line react-hooks/exhaustive-deps -- `theme` is an intentional cache-buster: forces re-reading CSS vars when the theme switches
  }, [misbeliefEventIds, theme]);

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
          if (sn) setClusterDrillIn(sn.clusterType);
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
    // 重置也還原視野 — 選取節點會把鏡頭 zoom 到 1.4，若不 fit 回全圖，
    // 重置後畫面停在原地，看起來像按鈕沒作用（canvas 設計即為「重設視圖」）。
    canvasRef.current?.fitView();
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
    const modeLabelKey =
      clusterMode === 'community' ? 'v1.cluster.mode.community' : 'v1.cluster.mode.type';
    const items = [
      { label: t('toolbar.graphRoot', '知識圖譜'), onClick: () => { setClusterMode('node'); setClusterDrillIn(null); } },
      { label: t(modeLabelKey), onClick: clusterDrillIn ? () => setClusterDrillIn(null) : undefined },
    ];
    if (clusterDrillIn) {
      const sn = clusteredGraph?.superNodes.find((s) => s.clusterType === clusterDrillIn);
      const drillLabel = sn?.label ?? t(`entityTypes.${clusterDrillIn}`);
      items.push({ label: drillLabel, onClick: undefined });
    }
    return items;
  }, [clusterMode, clusterDrillIn, clusteredGraph, t, setClusterMode]);

  if (isLoading) return <LoadingSpinner />;
  if (error) return <ErrorMessage message={error.message} />;

  const nodeCount = data?.nodes.length ?? 0;
  const edgeCount = data?.edges.length ?? 0;

  // No nodes yet → show an onboarding guide instead of a blank canvas.
  if (nodeCount === 0) return <GraphOnboardingHero />;

  // Decide right panel rendering
  const showCompare = !!compareNodes;
  const showInferredReview = !showCompare && (inferredReviewOpen || !!selectedInferredId);
  const showClusterOverview =
    !showCompare &&
    !showInferredReview &&
    (clusterMode === 'type' || clusterMode === 'community') &&
    !selectedNode;
  const showEntityDetail = !showCompare && !showInferredReview && !showClusterOverview && !!selectedNode;
  const rightOpen = showCompare || showInferredReview || showClusterOverview || showEntityDetail || !!rightPanel;
  const rightPanelExtraWidth = rightPanel ? RIGHT_PANEL_WIDTH[rightPanel] : 0;
  // Shared right-anchor for the bottom-right widget column (mini-map / stats / zoom).
  const bottomRightAnchor = rightOpen ? 16 + 280 + rightPanelExtraWidth : 16;

  const isCommunityMode = clusterMode === 'community';

  return (
    <div className="relative h-full w-full">
      {isCommunityMode && factionData ? (
        <FactionCanvas
          analysis={factionData}
          graphNodes={data?.nodes ?? []}
          drillInFactionId={clusterDrillIn}
          onSuperNodeClick={(factionId) => setClusterDrillIn(factionId)}
          onMemberClick={(id) => {
            setSelectedNodeId(id);
            setClusterMode('node');
            setClusterDrillIn(null);
          }}
          onExitDrillIn={() => setClusterDrillIn(null)}
        />
      ) : (
        <GraphCanvas
          ref={canvasRef}
          elements={filteredElements}
          onNodeTap={handleNodeTap}
          onEdgeTap={handleEdgeTap}
          selectedNodeId={selectedNodeId}
          selectedNodeIds={selectedNodeIds}
          animationMode={animationMode}
          extraStylesheet={[...relationEdgeStylesheet, ...epistemicStylesheet, ...misbeliefStylesheet]}
          onViewportChange={handleViewportChange}
        />
      )}

      {/* Toolbar (top-left) */}
      <GraphToolbar
        searchQuery={searchQuery}
        onSearchChange={(q) => {
          setSearchQuery(q);
          setSearchOpen(q.length > 0);
        }}
        onSearchFocus={() => searchQuery.length > 0 && setSearchOpen(true)}
        onReset={handleReset}
        visibleTypes={visibleTypes}
        onTypeToggle={handleTypeToggle}
        clusterMode={clusterMode}
        onClusterModeChange={(m) => {
          setClusterMode(m);
          setClusterDrillIn(null);
          setSelectedNodeId(null);
          setSelectedNodeIds([]);
        }}
        inferenceState={inferenceState}
        pendingCount={pendingCount}
        decidedCount={decidedCount}
        showInferred={showInferred}
        onShowInferredChange={setShowInferred}
        onRunInference={() => inferMutation.mutate()}
        onSafeRerun={() => inferMutation.mutate()}
        onForceRerun={handleForceRerun}
        onOpenReview={() => setInferredReviewOpen(true)}
        chapterCount={chapters?.length ?? 0}
        nodeCount={data?.nodes.length ?? 0}
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

      {/* Legend + orphan drawer (top-right) — shifts left when right panel is open */}
      <div
        className="absolute z-10 flex flex-col items-end"
        style={{
          top: 16,
          right: bottomRightAnchor,
          gap: 8,
          transition: 'right var(--transition-normal, 250ms) ease',
        }}
      >
        <LegendCard graph={data} />
        {clusterMode === 'node' && orphans.length > 0 && (
          <OrphanDrawer orphans={orphans} open={orphanOpen} onToggle={() => setOrphanOpen((v) => !v)} />
        )}
      </div>

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
            // Aggregate views (type/community) have no individual node to
            // select — clicking a bookmark there switches back to the
            // individual view first, same as drilling into a faction member.
            setClusterMode('node');
            setClusterDrillIn(null);
          }}
          onTimelineChange={setTimelineState}
          onUnknownEntityIds={setUnknownEntityIds}
          onMisbeliefEventIds={setMisbeliefEventIds}
          totalChapters={chapters?.length ?? 0}
          clusterMode={clusterMode}
          onBackToIndividual={() => {
            setClusterMode('node');
            setClusterDrillIn(null);
          }}
        />
      )}

      {/* Mini-map (bottom-right) — same slot for all modes */}
      {isCommunityMode && factionData ? (
        <div
          className="absolute z-10"
          style={{
            bottom: 16,
            right: bottomRightAnchor,
            transition: 'right var(--transition-normal, 250ms) ease',
          }}
        >
          <MiniMap
            nodes={factionMiniMapNodes}
            edges={factionMiniMapEdges}
            viewport={null}
            onRecenter={() => {}}
          />
        </div>
      ) : (
        viewportSnap && (
          <div
            className="absolute z-10"
            style={{
              bottom: 16,
              right: bottomRightAnchor,
              transition: 'right var(--transition-normal, 250ms) ease',
            }}
          >
            <MiniMap
              nodes={viewportSnap.nodes}
              edges={viewportSnap.edges}
              viewport={viewportSnap.viewport}
              onRecenter={(gx, gy) => canvasRef.current?.centerOn(gx, gy)}
              onPanByGraph={(dx, dy) => canvasRef.current?.panByGraph(dx, dy)}
            />
          </div>
        )
      )}

      {/* Stats — card just above the mini-map (same slot for all modes) */}
      <div
        className="absolute z-10 flex items-center"
        style={{
          bottom: 144,
          right: bottomRightAnchor,
          gap: 8,
          padding: '4px 10px',
          fontSize: 'var(--font-size-2xs)',
          color: 'var(--fg-muted)',
          backgroundColor: 'var(--bg-primary)',
          border: '1px solid var(--border)',
          borderRadius: 'var(--radius-md)',
          boxShadow: 'var(--shadow-sm)',
          transition: 'right var(--transition-normal, 250ms) ease',
        }}
      >
        {isCommunityMode && factionData ? (
          <>
            <span>
              <strong style={{ color: 'var(--fg-primary)', fontWeight: 600 }}>
                {factionData.factions?.length ?? 0}
              </strong>{' '}
              {tStats('statsFactionLabel')}
            </span>
            <span style={{ opacity: 0.4 }}>·</span>
            <span>
              <strong style={{ color: 'var(--fg-primary)', fontWeight: 600 }}>
                {factionData.relations?.length ?? 0}
              </strong>{' '}
              {tStats('statsAggregatedEdgeLabel')}
            </span>
            <span style={{ opacity: 0.4 }}>·</span>
            <span>
              <strong style={{ color: 'var(--fg-primary)', fontWeight: 600 }}>
                {nodeCount}
              </strong>{' '}
              {tStats('statsUnderlyingNodeLabel')}
            </span>
          </>
        ) : (
          <>
            <span>
              <strong style={{ color: 'var(--fg-primary)', fontWeight: 600 }}>{nodeCount}</strong>{' '}
              {tStats('statsNodeLabel')}
            </span>
            <span style={{ opacity: 0.4 }}>·</span>
            <span>
              <strong style={{ color: 'var(--fg-primary)', fontWeight: 600 }}>{edgeCount}</strong>{' '}
              {tStats('statsEdgeLabel')}
            </span>
            {inferredCount > 0 && (
              <>
                <span style={{ opacity: 0.4 }}>·</span>
                <span style={{ color: 'var(--accent)' }}>
                  {tStats('statsInferred', { n: inferredCount })}
                </span>
              </>
            )}
          </>
        )}
      </div>

      {/* Zoom controls (above stats) */}
      <div
        className="absolute z-10 flex flex-col"
        style={{
          bottom: 176,
          right: bottomRightAnchor,
          transition: 'right var(--transition-normal, 250ms) ease',
        }}
      >
        <button
          className="flex items-center justify-center"
          style={{
            width: 26,
            height: 26,
            backgroundColor: 'var(--bg-primary)',
            border: '1px solid var(--border)',
            borderRadius: 'var(--radius-md) var(--radius-md) 0 0',
            color: 'var(--fg-secondary)',
          }}
          aria-label="Zoom in"
        >
          <Plus size={12} />
        </button>
        <button
          className="flex items-center justify-center"
          style={{
            width: 26,
            height: 26,
            backgroundColor: 'var(--bg-primary)',
            border: '1px solid var(--border)',
            borderTop: 'none',
            borderRadius: '0 0 var(--radius-md) var(--radius-md)',
            color: 'var(--fg-secondary)',
          }}
          aria-label="Zoom out"
        >
          <Minus size={12} />
        </button>
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
            factionAnalysis={isCommunityMode ? factionData ?? null : null}
            factionSettings={isCommunityMode ? factionDraft : undefined}
            onFactionSettingsChange={isCommunityMode ? setFactionDraft : undefined}
            onFactionRecompute={
              isCommunityMode ? () => setFactionApplied(factionDraft) : undefined
            }
            isRecomputing={isCommunityMode && isFactionFetching}
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

// "未連結實體" drawer — degree-0 entities are hidden from the canvas (see
// `connectedElements` above); this surfaces them as a small popover instead
// of a floating grid next to the graph (brief §3-3).
function OrphanDrawer({
  orphans,
  open,
  onToggle,
}: {
  orphans: OrphanNode[];
  open: boolean;
  onToggle: () => void;
}) {
  const { t } = useTranslation('graph');
  return (
    <div className="relative">
      <button
        onClick={onToggle}
        className="flex items-center"
        style={{
          gap: 6,
          padding: '6px 11px',
          backgroundColor: 'var(--bg-primary)',
          border: '1px solid var(--border)',
          borderRadius: 'var(--radius-md)',
          boxShadow: 'var(--shadow-sm)',
          fontSize: 'var(--font-size-2xs)',
          color: 'var(--fg-primary)',
        }}
      >
        <Shapes size={14} style={{ color: 'var(--fg-secondary)' }} />
        <span>{t('v1.orphan.button')}</span>
        <span
          className="tabular-nums"
          style={{
            padding: '0 6px',
            borderRadius: 'var(--pill-radius, 999px)',
            backgroundColor: 'var(--bg-tertiary)',
            color: 'var(--fg-secondary)',
          }}
        >
          {orphans.length}
        </span>
      </button>
      {open && (
        <div
          className="absolute"
          style={{
            top: '100%',
            right: 0,
            marginTop: 6,
            width: 230,
            padding: 12,
            backgroundColor: 'var(--bg-primary)',
            border: '1px solid var(--border)',
            borderRadius: 'var(--radius-md)',
            boxShadow: 'var(--shadow-md, var(--shadow-sm))',
            zIndex: 20,
          }}
        >
          <div
            style={{
              fontSize: 'var(--font-size-2xs)',
              color: 'var(--fg-muted)',
              lineHeight: 1.5,
              marginBottom: 8,
            }}
          >
            {t('v1.orphan.description')}
          </div>
          <div className="flex flex-col" style={{ gap: 5, maxHeight: 220, overflowY: 'auto' }}>
            {orphans.map((o) => {
              const dotKey = ORPHAN_TYPE_KEY[o.type] ?? 'other';
              return (
                <span
                  key={o.id}
                  className="inline-flex items-center self-start"
                  style={{
                    gap: 5,
                    padding: '3px 9px',
                    borderRadius: 'var(--pill-radius, 999px)',
                    border: '1px solid var(--border)',
                    fontSize: 'var(--font-size-2xs)',
                    color: 'var(--fg-secondary)',
                  }}
                >
                  <span
                    className="inline-block rounded-full flex-shrink-0"
                    style={{
                      width: 8,
                      height: 8,
                      backgroundColor: `var(--graph-${dotKey}-fill)`,
                      border: `1px solid var(--graph-${dotKey}-stroke)`,
                    }}
                  />
                  {o.name}
                </span>
              );
            })}
          </div>
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

  // Build displayable markdown content from the appropriate analysis shape.
  // Events return AnalysisItem (has .content); entities return CharacterAnalysisDetail
  // (has .profileSummary + .archetypes + .arc — no .content field).
  let content: string | undefined;
  if (isEvent) {
    content = eventAnalysis?.content;
  } else if (entityAnalysis) {
    const parts: string[] = [];
    if (entityAnalysis.profileSummary) parts.push(entityAnalysis.profileSummary);
    if (entityAnalysis.archetypes?.length) {
      const arcLines = entityAnalysis.archetypes
        .map((a) => `**${a.framework}**: ${a.primary}${a.secondary ? ` / ${a.secondary}` : ''}`)
        .join('\n');
      parts.push(`\n**原型**\n${arcLines}`);
    }
    if (entityAnalysis.arc?.length) {
      const arcSegLines = entityAnalysis.arc
        .map((s) => `- **${s.phase}**（${s.chapterRange}）${s.description}`)
        .join('\n');
      parts.push(`\n**發展弧線**\n${arcSegLines}`);
    }
    content = parts.join('\n\n') || undefined;
  }

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
