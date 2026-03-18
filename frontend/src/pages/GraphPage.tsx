import { useState, useMemo, useCallback } from 'react';
import { useParams } from 'react-router-dom';
import { Plus, Minus, X, Loader } from 'lucide-react';
import { useQuery } from '@tanstack/react-query';
import { useGraphData } from '@/hooks/useGraphData';
import { toCytoscapeElements } from '@/lib/graphTransform';
import { GraphCanvas } from '@/components/graph/GraphCanvas';
import { GraphToolbar } from '@/components/graph/GraphToolbar';
import { EntityDetailPanel } from '@/components/graph/EntityDetailPanel';
import { LoadingSpinner } from '@/components/ui/LoadingSpinner';
import { ErrorMessage } from '@/components/ui/ErrorMessage';
import { MarkdownRenderer } from '@/components/ui/MarkdownRenderer';
import { fetchEntityAnalysis } from '@/api/analysis';
import type { GraphNode } from '@/api/types';

const ALL_TYPES = new Set(['character', 'location', 'concept', 'event']);

type RightPanel = 'analysis' | 'paragraphs' | null;

const RIGHT_PANEL_WIDTH: Record<NonNullable<RightPanel>, number> = {
  analysis: 360,
  paragraphs: 300,
};

export default function GraphPage() {
  const { bookId } = useParams<{ bookId: string }>();
  const { data, isLoading, error } = useGraphData(bookId);
  const [selectedNodeId, setSelectedNodeId] = useState<string | null>(null);
  const [searchQuery, setSearchQuery] = useState('');
  const [visibleTypes, setVisibleTypes] = useState(new Set(ALL_TYPES));
  const [rightPanel, setRightPanel] = useState<RightPanel>(null);

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
    return elements.filter((el) => {
      if (el.group === 'edges') {
        const srcVisible = elements.some(
          (n) => n.group === 'nodes' && n.data.id === el.data.source && visibleTypes.has(String(n.data.entityType ?? '')),
        );
        const tgtVisible = elements.some(
          (n) => n.group === 'nodes' && n.data.id === el.data.target && visibleTypes.has(String(n.data.entityType ?? '')),
        );
        return srcVisible && tgtVisible;
      }
      if (!visibleTypes.has(String(el.data.entityType ?? ''))) return false;
      if (lowerQ && !String(el.data.label ?? '').toLowerCase().includes(lowerQ)) return false;
      return true;
    });
  }, [elements, searchQuery, visibleTypes]);

  const selectedNode: GraphNode | null = useMemo(() => {
    if (!selectedNodeId || !data) return null;
    return data.nodes.find((n) => n.id === selectedNodeId) ?? null;
  }, [selectedNodeId, data]);

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
      <GraphCanvas elements={filteredElements} onNodeTap={handleNodeTap} />

      {/* Floating toolbar (top-left) */}
      <GraphToolbar
        searchQuery={searchQuery}
        onSearchChange={setSearchQuery}
        visibleTypes={visibleTypes}
        onTypeToggle={handleTypeToggle}
        onReset={handleReset}
      />

      {/* Zoom controls (bottom-left) */}
      <div className="absolute bottom-4 left-4 flex flex-col gap-1 z-10">
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
        {nodeCount} 節點 · {edgeCount} 關係
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
          <EntityDetailPanel
            node={selectedNode}
            bookId={bookId}
            onClose={() => {
              setSelectedNodeId(null);
              setRightPanel(null);
            }}
            onShowAnalysis={() => setRightPanel('analysis')}
            onShowParagraphs={() => setRightPanel('paragraphs')}
          />
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
  const { data: analysis, isLoading } = useQuery({
    queryKey: ['books', bookId, 'entities', node.id, 'analysis'],
    queryFn: () => fetchEntityAnalysis(bookId, node.id),
    retry: false,
  });

  return (
    <div className="flex flex-col h-full overflow-hidden">
      <div
        className="flex items-center justify-between p-3 flex-shrink-0"
        style={{ borderBottom: '1px solid var(--border)' }}
      >
        <h3 className="text-sm font-semibold" style={{ fontFamily: 'var(--font-serif)', color: 'var(--fg-primary)' }}>
          {node.name} — 深度分析
        </h3>
        <button onClick={onClose} style={{ color: 'var(--fg-muted)' }}>
          <X size={16} />
        </button>
      </div>
      <div className="flex-1 overflow-y-auto p-4">
        {isLoading ? (
          <div className="flex items-center gap-2">
            <Loader size={12} className="animate-spin" style={{ color: 'var(--fg-muted)' }} />
            <span className="text-xs" style={{ color: 'var(--fg-muted)' }}>載入中...</span>
          </div>
        ) : analysis ? (
          <MarkdownRenderer content={analysis.content} compact />
        ) : (
          <p className="text-xs" style={{ color: 'var(--fg-muted)' }}>尚無深度分析資料。</p>
        )}
      </div>
    </div>
  );
}

function ParagraphsPanel({ node, onClose }: { node: GraphNode; onClose: () => void }) {
  return (
    <div className="flex flex-col h-full overflow-hidden">
      <div
        className="flex items-center justify-between p-3 flex-shrink-0"
        style={{ borderBottom: '1px solid var(--border)' }}
      >
        <h3 className="text-sm font-semibold" style={{ fontFamily: 'var(--font-serif)', color: 'var(--fg-primary)' }}>
          {node.name} — 相關段落
        </h3>
        <button onClick={onClose} style={{ color: 'var(--fg-muted)' }}>
          <X size={16} />
        </button>
      </div>
      <div className="flex-1 overflow-y-auto p-4">
        <p className="text-xs" style={{ color: 'var(--fg-muted)' }}>
          段落面板（待後端 API 對接後實作）
        </p>
      </div>
    </div>
  );
}
