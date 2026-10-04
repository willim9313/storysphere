import { useState, useMemo, useCallback, useEffect, useRef } from 'react';
import { Link, useParams, useSearchParams } from 'react-router-dom';
import { Plus, Minus, X, Loader, Shapes, ChevronUp } from 'lucide-react';
import { useQuery, useQueries, useMutation, useQueryClient } from '@tanstack/react-query';
import { Trans, useTranslation } from 'react-i18next';
import { useChatDispatch } from '@/contexts/ChatContext';
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
import { byCommunity, byType, factionChapterParam, isSuperNodeId } from '@/services/kgClustering';
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
import { EntityComparePanel } from '@/components/graph/EntityComparePanel';
import { InferredEdgePanel } from '@/components/graph/InferredEdgePanel';
import { GraphRightRail } from '@/components/graph/GraphRightRail';
import {
  SECONDARY_PANEL_WIDTH,
  activeSecondaryPanel,
  railWidth,
  resolveRailPanel,
  type SecondaryPanel,
} from '@/components/graph/graphPanelModel';
import { PairModeOverlay, type PairSubMode } from '@/components/graph/PairModeOverlay';
import { LoadingSpinner } from '@/components/ui/LoadingSpinner';
import { ConfirmDialog } from '@/components/ui/ConfirmDialog';
import { PageFailure } from '@/components/ui/PageFailure';
import { MarkdownRenderer } from '@/components/ui/MarkdownRenderer';
import { failureKind, techDetailOf } from '@/api/failureKind';
import { fetchEntityAnalysis, fetchEventAnalyses } from '@/api/analysis';
import { fetchEntityChunks } from '@/api/chunks';
import { fetchChapters } from '@/api/chapters';
import { SegmentRenderer } from '@/components/reader/SegmentRenderer';
import { GuidanceRibbon } from '@/components/ui/GuidanceRibbon';
import { runInference, fetchInferredRelations, fetchGraphData } from '@/api/graph';
import { pairEvolution, shortestPath, isInsufficientChange } from '@/lib/graphPair';
import type { EntityType, GraphNode, GraphData, EntityChunkItem } from '@/api/types';
import { qk } from '@/api/queryKeys';
import '@/styles/graph.css';

const readCssVar = (name: string) => getComputedStyle(document.documentElement).getPropertyValue(name).trim();

const ALL_TYPES = new Set<string>(['character', 'location', 'concept', 'event', 'organization', 'object', 'other']);
const MULTI_SELECT_CAP = 2;
const ZOOM_STEP = 1.25;

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

export default function GraphPage() {
  const { bookId } = useParams<{ bookId: string }>();
  const [searchParams] = useSearchParams();
  const { setPageContext } = useChatDispatch();
  const { data: book } = useBook(bookId);
  const { t, t: tStats } = useTranslation('graph');
  const { t: tAnalysis } = useTranslation('analysis');
  const { t: tNav } = useTranslation('nav');
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
  // Entity-detail「加入比較」flow: the first pick is held here; the next plain
  // node tap completes the pair and opens the compare panel.
  const [compareArmed, setCompareArmed] = useState(false);
  const [searchQuery, setSearchQuery] = useState('');
  const [searchOpen, setSearchOpen] = useState(false);
  const [visibleTypes, setVisibleTypes] = useState<Set<string>>(new Set(ALL_TYPES));
  const [rightPanel, setRightPanel] = useState<SecondaryPanel | null>(null);
  const [unknownEntityIds, setUnknownEntityIds] = useState<Set<string>>(new Set());
  const [misbeliefEventIds, setMisbeliefEventIds] = useState<Set<string>>(new Set());
  const [bookmarkedIds, setBookmarkedIds] = useLocalStorage<string[]>(
    `graph:${bookId ?? '-'}:bookmarks`,
    [],
  );
  const [viewportSnap, setViewportSnap] = useState<ViewportSnapshot | null>(null);
  const [orphanOpen, setOrphanOpen] = useState(false);
  const [forceConfirmOpen, setForceConfirmOpen] = useState(false);

  // Phase 5: entity-pair mode (F1 evolution / F2 path tracing) — exclusive
  // overlay driven from the existing multi-select compare panel.
  const [pairState, setPairState] = useState<{
    a: GraphNode;
    b: GraphNode;
    subMode: PairSubMode;
    step: number;
  } | null>(null);

  const canvasRef = useRef<GraphCanvasHandle>(null);

  const { data, isLoading, error, refetch } = useGraphData(bookId, timelineState ?? undefined, showInferred);

  const { data: chapters } = useQuery({
    queryKey: qk.chapters(bookId),
    queryFn: () => fetchChapters(bookId!),
    enabled: !!bookId,
  });

  const pairTotalChapters = chapters?.length ?? 0;

  // Per-chapter cumulative graph snapshots (Phase 5 F1) — same query key
  // shape as useGraphData so this shares its cache instead of refetching.
  // Only enabled while pair mode is active.
  const pairSnapshotQueries = useQueries({
    queries: Array.from({ length: pairTotalChapters }, (_, i) => i + 1).map((ch) => ({
      queryKey: qk.graph.view(bookId, 'chapter', ch, false),
      queryFn: () => fetchGraphData(bookId!, { mode: 'chapter', position: ch }, false),
      enabled: !!pairState && !!bookId,
    })),
  });

  const pairSnapshotsByChapter = useMemo(
    () =>
      pairSnapshotQueries.map((q, i) => ({
        chapter: i + 1,
        graph: q.data as GraphData | undefined,
      })),
    [pairSnapshotQueries],
  );

  const pairSteps = useMemo(() => {
    if (!pairState) return [];
    return pairEvolution(pairSnapshotsByChapter, pairState.a.id, pairState.b.id);
  }, [pairState, pairSnapshotsByChapter]);

  const pairInsufficientChange = useMemo(() => isInsufficientChange(pairSteps), [pairSteps]);

  const pairPath = useMemo(() => {
    if (!pairState || !data) return null;
    return shortestPath(data, pairState.a.id, pairState.b.id);
  }, [pairState, data]);

  // Node lookup for the overlay — full graph first, then snapshot nodes as a
  // fallback in case a common-neighbor id hasn't surfaced in `data` yet.
  const pairNodeById = useMemo(() => {
    const map = new Map<string, GraphNode>();
    for (const n of data?.nodes ?? []) map.set(n.id, n);
    for (const snap of pairSnapshotsByChapter) {
      for (const n of snap.graph?.nodes ?? []) {
        if (!map.has(n.id)) map.set(n.id, n);
      }
    }
    return map;
  }, [data, pairSnapshotsByChapter]);

  // Same call serves both the idle-state "執行推論" and the ready-state
  // "安全重跑" menu item — both only score new entity pairs and preserve
  // existing adopted/rejected decisions.
  const inferMutation = useMutation({
    mutationFn: () => runInference(bookId!),
    onSuccess: () => {
      setShowInferred(true);
      queryClient.invalidateQueries({ queryKey: qk.graph.all(bookId) });
      queryClient.invalidateQueries({ queryKey: qk.inferred.all(bookId) });
    },
  });

  // Destructive rerun: bypasses skip list, resets every record (incl. past
  // adopt/reject decisions) back to PENDING. Gated behind a ConfirmDialog
  // (danger, no cost glyph — it is irreversible but spends no tokens).
  const forceRerunMutation = useMutation({
    mutationFn: () => runInference(bookId!, true),
    onSuccess: () => {
      setShowInferred(true);
      queryClient.invalidateQueries({ queryKey: qk.graph.all(bookId) });
      queryClient.invalidateQueries({ queryKey: qk.inferred.all(bookId) });
    },
  });

  const handleForceRerun = useCallback(() => setForceConfirmOpen(true), []);

  // Toolbar's three-state inference control (brief §4: idle / running /
  // ready-with-records). `pendingCount`'s query key intentionally matches
  // InferredEdgePanel's so the two share one cache entry instead of double-
  // fetching when the panel is open. `allInferredData.total` (unfiltered)
  // is the "有紀錄" signal for idle vs ready.
  const { data: pendingInferredData } = useQuery({
    queryKey: qk.inferred.pending(bookId),
    queryFn: () => fetchInferredRelations(bookId!, 'pending'),
    enabled: !!bookId,
  });
  const { data: allInferredData } = useQuery({
    queryKey: qk.inferred.list(bookId),
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
  const factionChapter = factionChapterParam(timelineState);
  const { data: factionData, isFetching: isFactionFetching } = useQuery({
    queryKey: [
      'books',
      bookId,
      'analysis',
      'factions',
      factionApplied.resolution,
      factionApplied.minClusterSize,
      factionChapter,
    ],
    queryFn: () =>
      fetchFactionAnalysis(bookId!, {
        chapter: factionChapter,
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

  // F4 deep-link restore (?entity=&mode=&chapter=): seeds selection + cluster
  // mode from the shareable URL on load. `entity` keeps applying whenever
  // `data` becomes available (unchanged from before); `mode` is applied only
  // once, guarded by a ref, so it doesn't fight the user's own toolbar
  // clicks afterwards. `chapter` is read separately below and handed to
  // LensCard, which seeds the timeline itself.
  const deepLinkModeAppliedRef = useRef(false);
  useEffect(() => {
    if (!data) return;
    const entityId = searchParams.get('entity');
    if (entityId) setSelectedNodeId(entityId);
    if (!deepLinkModeAppliedRef.current) {
      deepLinkModeAppliedRef.current = true;
      const modeParam = searchParams.get('mode');
      if (modeParam === 'type' || modeParam === 'community') {
        setClusterMode(modeParam);
      }
    }
  }, [data, searchParams, setClusterMode]);

  const deepLinkChapter = useMemo(() => {
    const raw = searchParams.get('chapter');
    if (!raw) return undefined;
    const n = parseInt(raw, 10);
    return Number.isNaN(n) ? undefined : n;
  }, [searchParams]);

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
      // 「加入比較」pending: the panel armed a first pick — this plain tap
      // completes the pair and opens the compare panel.
      if (compareArmed && !mods.shift) {
        setSelectedNodeIds((prev) => (prev.includes(nodeId) ? prev : [...prev, nodeId]));
        setCompareArmed(false);
        setSelectedNodeId(null);
        setRightPanel(null);
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
    [clusteredGraph, compareArmed],
  );

  // 「加入比較」— hold the current entity as the first comparison pick; the
  // next node tap completes the pair (see handleNodeTap).
  const handleAddToCompare = useCallback(() => {
    if (!selectedNodeId) return;
    setSelectedNodeIds([selectedNodeId]);
    setCompareArmed(true);
  }, [selectedNodeId]);

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
    setCompareArmed(false);
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

  // Relation count (graph degree) of the selected node in the current graph.
  const selectedRelationCount = useMemo(() => {
    if (!selectedNodeId || !data) return 0;
    return data.edges.reduce(
      (n, e) => n + (e.source === selectedNodeId || e.target === selectedNodeId ? 1 : 0),
      0,
    );
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

  if (isLoading) return <LoadingSpinner />;
  if (error) {
    // Title bar / sidebar stay (this is the route's content area); only the page
    // body is replaced. `failureKind` splits the app's own JSON error from a bare
    // proxy status. Retry refetches this page's own query — nothing here remounts
    // the page, so an errored (data-less) query is not reset in a loop.
    return (
      <div className="kg-failure">
        <PageFailure
          variant={failureKind(error)}
          pageName={tNav('tabs.knowledgeGraph')}
          onRetry={() => void refetch()}
          secondaryAction={
            <Link to={`/books/${bookId}`} className="ss-btn ss-btn-md ss-btn-secondary">
              {tAnalysis('character.error.backToBook')}
            </Link>
          }
          techDetail={techDetailOf(error)}
        />
      </div>
    );
  }

  const nodeCount = data?.nodes.length ?? 0;
  const edgeCount = data?.edges.length ?? 0;

  // No nodes yet → show an onboarding guide instead of a blank canvas.
  if (nodeCount === 0) return <GraphOnboardingHero />;

  // Right rail: one main panel (priority chain), plus at most one secondary
  // panel beside it — and only when the main one is the entity / event detail.
  const isCommunityMode = clusterMode === 'community';
  const resolvedRail = resolveRailPanel({
    compareReady: !!compareNodes,
    inferredReviewOpen: inferredReviewOpen || !!selectedInferredId,
    aggregateLens: clusterMode !== 'node',
    hasSelectedNode: !!selectedNode,
  });
  // A cluster overview with nothing to draw yet (community analysis still
  // loading) leaves the rail closed instead of anchoring the widgets to air.
  const railMain = resolvedRail === 'cluster' && !clusteredGraph ? null : resolvedRail;
  const secondaryPanel = selectedNode ? activeSecondaryPanel(railMain, rightPanel) : null;
  const secondaryWidth = secondaryPanel ? SECONDARY_PANEL_WIDTH[secondaryPanel] : 0;
  // Shared right anchor for the bottom-right widget column (stats / mini-map / zoom):
  // reads the width the rail actually occupies instead of a hard-coded number.
  const bottomRightAnchor = `calc(${railWidth(railMain, secondaryPanel)}px + var(--space-5))`;

  let railName = '';
  if (railMain === 'compare') railName = t('v1.compare.title');
  else if (railMain === 'inferred') railName = t('panel.chainInferred');
  else if (railMain === 'cluster') railName = t('v1.cluster.overview');
  else if (railMain === 'entity') {
    railName = selectedNode?.type === 'event' ? t('panel.chainEvent') : t('panel.chainEntity');
  }

  const pairModeActive = !!pairState;

  return (
    <div className="kg-page">
      {/* Phase 5 exclusive mode: while entity-pair mode is active, the toolbar,
          lenses, legend, mini-map/stats, and right-side panels are all
          suspended (not rendered) rather than mutated — their own state is
          untouched, so exiting pair mode restores them for free. */}
      {!pairModeActive && (
        <GraphToolbar
          searchQuery={searchQuery}
          onSearchChange={(q) => {
            setSearchQuery(q);
            setSearchOpen(q.length > 0);
          }}
          onSearchFocus={() => searchQuery.length > 0 && setSearchOpen(true)}
          searchDropdown={
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
          }
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
      )}

      <div className="kg-stage">
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

        {!pairModeActive && (
          <>
            {/* Floating ribbon: positioned inside the stage, so it always sits
                right under the (variable-height) toolbar. */}
            <GuidanceRibbon surface="graph" float>
              <strong>{t('guide.prefix')}</strong>{' '}
              <Trans i18nKey="guide.body" ns="graph" components={{ strong: <strong /> }} />
            </GuidanceRibbon>

            {/* Bottom-left: orphan drawer above the Lens card — one shared bottom
                edge, the drawer opens upward. */}
            <div className="kg-bl">
              {clusterMode === 'node' && orphans.length > 0 && (
                <OrphanDrawer orphans={orphans} open={orphanOpen} onToggle={() => setOrphanOpen((v) => !v)} />
              )}
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
                  deepLinkChapter={deepLinkChapter}
                />
              )}
            </div>

            {/* Bottom-right: stats / mini-map / zoom share one right anchor that
                follows the rail's real width. */}
            <div className="kg-br" style={{ right: bottomRightAnchor }}>
              <div className="kg-stats">
                {isCommunityMode && factionData ? (
                  <>
                    <span>
                      <strong>{factionData.factions?.length ?? 0}</strong> {tStats('statsFactionLabel')}
                    </span>
                    <span className="kg-stats-sep">·</span>
                    <span>
                      <strong>{factionData.relations?.length ?? 0}</strong> {tStats('statsAggregatedEdgeLabel')}
                    </span>
                    <span className="kg-stats-sep">·</span>
                    <span>
                      <strong>{nodeCount}</strong> {tStats('statsUnderlyingNodeLabel')}
                    </span>
                  </>
                ) : (
                  <>
                    <span>
                      <strong>{nodeCount}</strong> {tStats('statsNodeLabel')}
                    </span>
                    <span className="kg-stats-sep">·</span>
                    <span>
                      <strong>{edgeCount}</strong> {tStats('statsEdgeLabel')}
                    </span>
                    {inferredCount > 0 && (
                      <>
                        <span className="kg-stats-sep">·</span>
                        <span className="kg-stats-inferred">{tStats('statsInferred', { n: inferredCount })}</span>
                      </>
                    )}
                  </>
                )}
              </div>

              {isCommunityMode && factionData ? (
                <MiniMap
                  nodes={factionMiniMapNodes}
                  edges={factionMiniMapEdges}
                  viewport={null}
                  onRecenter={() => {}}
                />
              ) : (
                viewportSnap && (
                  <MiniMap
                    nodes={viewportSnap.nodes}
                    edges={viewportSnap.edges}
                    viewport={viewportSnap.viewport}
                    onRecenter={(gx, gy) => canvasRef.current?.centerOn(gx, gy)}
                    onPanByGraph={(dx, dy) => canvasRef.current?.panByGraph(dx, dy)}
                  />
                )
              )}

              {/* Zoom drives cytoscape; the readout is its real zoom level. The
                  community lens is a fixed SVG with no zoom, so no strip there. */}
              {!isCommunityMode && (
                <div className="kg-zoom">
                  <button
                    type="button"
                    className="kg-zoom-btn"
                    aria-label="Zoom out"
                    onClick={() => canvasRef.current?.zoomBy(1 / ZOOM_STEP)}
                  >
                    <Minus size={12} />
                  </button>
                  <span className="kg-zoom-read">{Math.round((viewportSnap?.zoom ?? 1) * 100)}%</span>
                  <button
                    type="button"
                    className="kg-zoom-btn"
                    aria-label="Zoom in"
                    onClick={() => canvasRef.current?.zoomBy(ZOOM_STEP)}
                  >
                    <Plus size={12} />
                  </button>
                </div>
              )}
            </div>

            {/* Right rail — priority: compare > inferred review > cluster overview > entity.
                One shared container names whichever panel is showing. */}
            {railMain && bookId && (
              <GraphRightRail panel={railMain} name={railName} rightOffset={secondaryWidth}>
                {railMain === 'compare' && compareNodes && (
                  <EntityComparePanel
                    bookId={bookId}
                    a={compareNodes[0]}
                    b={compareNodes[1]}
                    onClose={() => setSelectedNodeIds([])}
                    onEnterPairMode={() =>
                      setPairState({
                        a: compareNodes[0],
                        b: compareNodes[1],
                        subMode: 'evo',
                        step: Math.max(pairTotalChapters, 1),
                      })
                    }
                  />
                )}

                {railMain === 'inferred' && (
                  <InferredEdgePanel
                    bookId={bookId}
                    focusInferredId={selectedInferredId}
                    onClose={() => {
                      setInferredReviewOpen(false);
                      setSelectedInferredId(null);
                    }}
                  />
                )}

                {railMain === 'cluster' && clusteredGraph && (
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
                )}

                {railMain === 'entity' && selectedNode &&
                  (selectedNode.type === 'event' ? (
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
                      relationCount={selectedRelationCount}
                      isBookmarked={bookmarkedIds.includes(selectedNode.id)}
                      onBookmarkToggle={() =>
                        bookmarkedIds.includes(selectedNode.id)
                          ? handleBookmarkRemove(selectedNode.id)
                          : handleBookmarkAdd(selectedNode.id)
                      }
                      onAddToCompare={handleAddToCompare}
                      isComparePending={compareArmed}
                      onClose={() => {
                        setSelectedNodeId(null);
                        setCompareArmed(false);
                        setRightPanel(null);
                      }}
                      onShowAnalysis={() => setRightPanel('analysis')}
                      onShowParagraphs={() => setRightPanel('paragraphs')}
                    />
                  ))}
              </GraphRightRail>
            )}

            {/* Secondary detail layer (analysis / paragraphs): stacked to the right
                of the main panel, one at a time, only beside the entity / event panel. */}
            {secondaryPanel && selectedNode && bookId && (
              <div className="kg-secondary" style={{ width: secondaryWidth }}>
                {secondaryPanel === 'analysis' ? (
                  <AnalysisPanel bookId={bookId} node={selectedNode} onClose={() => setRightPanel(null)} />
                ) : (
                  <ParagraphsPanel bookId={bookId} node={selectedNode} onClose={() => setRightPanel(null)} />
                )}
              </div>
            )}
          </>
        )}

        {/* Phase 5: entity-pair mode overlay (F1 evolution / F2 path tracing) */}
        {pairState && (
          <PairModeOverlay
            a={pairState.a}
            b={pairState.b}
            subMode={pairState.subMode}
            onSubModeChange={(subMode) => setPairState((prev) => (prev ? { ...prev, subMode } : prev))}
            onExit={() => setPairState(null)}
            totalChapters={pairTotalChapters}
            step={pairState.step}
            onStepChange={(step) => setPairState((prev) => (prev ? { ...prev, step } : prev))}
            steps={pairSteps}
            nodeById={pairNodeById}
            path={pairPath}
            insufficientChange={pairInsufficientChange}
          />
        )}
      </div>

      {/* Legend band: flush against the canvas's bottom edge, follows the lens. */}
      {!pairModeActive && <LegendCard clusterMode={clusterMode} />}

      {/* 強制重跑推論 — irreversible but free: danger styling, NO cost glyph.
          The body keeps the original wording verbatim (including 「重跡」). */}
      <ConfirmDialog
        open={forceConfirmOpen}
        title={t('inference.forceRerunTitle')}
        message={t('v1.inferred.review.rerunForceConfirm')}
        confirmLabel={t('v1.inferred.toolbar.menu.forceRerun')}
        danger
        onConfirm={() => {
          setForceConfirmOpen(false);
          forceRerunMutation.mutate();
        }}
        onCancel={() => setForceConfirmOpen(false)}
      />
    </div>
  );
}

// "未連結實體" drawer — degree-0 entities are hidden from the canvas (see
// `connectedElements` above); this surfaces them as a small popover instead
// of a floating grid next to the graph (brief §3-3). Lives in the bottom-left
// stack and opens upward, sharing the Lens card's bottom edge.
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
    <div className="kg-orphan">
      <button
        type="button"
        onClick={onToggle}
        aria-expanded={open}
        className="ss-btn ss-btn-sm ss-btn-secondary"
      >
        <Shapes size={13} />
        <span>{t('v1.orphan.button')}</span>
        <span className="kg-orphan-count">{orphans.length}</span>
        <ChevronUp size={12} style={open ? { transform: 'rotate(180deg)' } : undefined} />
      </button>
      {open && (
        <div className="kg-orphan-pop">
          <div className="kg-orphan-desc">{t('v1.orphan.description')}</div>
          <div className="kg-orphan-list">
            {orphans.map((o) => {
              const dotKey = ORPHAN_TYPE_KEY[o.type] ?? 'other';
              return (
                <span key={o.id} className="kg-orphan-item">
                  <span
                    className="kg-orphan-dot"
                    style={{
                      backgroundColor: `var(--graph-${dotKey}-fill)`,
                      border: `var(--line-weight) solid var(--graph-${dotKey}-stroke)`,
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
    queryKey: qk.entity.analysis(bookId, node.id),
    queryFn: () => fetchEntityAnalysis(bookId, node.id),
    retry: false,
    enabled: !isEvent,
  });

  const { data: eventAnalyses, isLoading: eventLoading } = useQuery({
    queryKey: qk.analysis.events(bookId),
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
    <div className="kg-panel">
      <div className="kg-panel-head" style={{ alignItems: 'flex-start' }}>
        <div className="flex flex-col" style={{ gap: 'var(--space-1)', minWidth: 0 }}>
          <h3 className="kg-panel-title">
            {isEvent ? t('analysisPanel.eventTitle', { name: node.name }) : t('analysisPanel.entityTitle', { name: node.name })}
          </h3>
          {entityAnalysis?.generatedAt && (
            <span className="kg-panel-sub">
              {t('entity.generated', { date: new Date(entityAnalysis.generatedAt).toLocaleDateString() })}
            </span>
          )}
        </div>
        <button type="button" onClick={onClose} className="kg-icon-btn" aria-label="Close">
          <X size={14} />
        </button>
      </div>
      <div className="kg-panel-body">
        {isLoading ? (
          <div className="kg-inline-load">
            <Loader size={12} className="animate-spin" />
            <span>{t('analysisPanel.loading')}</span>
          </div>
        ) : content ? (
          <MarkdownRenderer content={content} compact />
        ) : (
          <p className="kg-note">{isEvent ? t('analysisPanel.noEventAnalysis') : t('analysisPanel.noEntityAnalysis')}</p>
        )}
      </div>
    </div>
  );
}

function ParagraphsPanel({ bookId, node, onClose }: { bookId: string; node: GraphNode; onClose: () => void }) {
  const { t } = useTranslation('graph');
  const { data, isLoading } = useQuery({
    queryKey: qk.entity.chunks(bookId, node.id),
    queryFn: () => fetchEntityChunks(bookId, node.id),
  });

  const grouped = useMemo(() => {
    if (!data?.chunks) return [];
    const map = new Map<number, { chapterId: string; title: string | null | undefined; chunks: EntityChunkItem[] }>();
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
    <div className="kg-panel">
      <div className="kg-panel-head" style={{ alignItems: 'flex-start' }}>
        <div className="flex flex-col" style={{ gap: 'var(--space-1)', minWidth: 0 }}>
          <h3 className="kg-panel-title">{t('paragraphsPanel.title', { name: node.name })}</h3>
          {data && data.total > 0 && (
            <span className="kg-panel-sub">{t('paragraphsPanel.total', { count: data.total })}</span>
          )}
        </div>
        <button type="button" onClick={onClose} className="kg-icon-btn" aria-label="Close">
          <X size={14} />
        </button>
      </div>
      <div className="kg-panel-body">
        {isLoading ? (
          <div className="kg-inline-load">
            <Loader size={12} className="animate-spin" />
            <span>{t('paragraphsPanel.loading')}</span>
          </div>
        ) : data && data.total > 0 ? (
          grouped.map(([chapterNum, group]) => (
            <div key={chapterNum} className="kg-chunk" style={{ gap: 'var(--space-3)' }}>
              <span className="kg-label" style={{ color: 'var(--fg-secondary)' }}>
                {group.title || t('paragraphsPanel.chapterTitle', { chapter: chapterNum })}
              </span>
              {group.chunks.map((chunk) => (
                <div
                  key={chunk.id}
                  className="kg-serif"
                  style={{
                    fontSize: 'var(--font-size-2xs)',
                    lineHeight: 1.8,
                    padding: 'var(--space-3) var(--space-4)',
                    backgroundColor: 'var(--bg-secondary)',
                    borderRadius: 'var(--radius-sm)',
                    color: 'var(--fg-primary)',
                  }}
                >
                  <SegmentRenderer segments={chunk.segments} />
                </div>
              ))}
            </div>
          ))
        ) : (
          <p className="kg-note">{t('paragraphsPanel.noData')}</p>
        )}
      </div>
    </div>
  );
}
