import { useState, useMemo, useCallback } from 'react';
import { useParams } from 'react-router-dom';
import { Plus, Minus } from 'lucide-react';
import { useGraphData } from '@/hooks/useGraphData';
import { toCytoscapeElements } from '@/lib/graphTransform';
import { GraphCanvas } from '@/components/graph/GraphCanvas';
import { GraphToolbar } from '@/components/graph/GraphToolbar';
import { EntityDetailPanel } from '@/components/graph/EntityDetailPanel';
import { LoadingSpinner } from '@/components/ui/LoadingSpinner';
import { ErrorMessage } from '@/components/ui/ErrorMessage';
import type { GraphNode } from '@/api/types';

const ALL_TYPES = new Set(['character', 'location', 'concept', 'event']);

export default function GraphPage() {
  const { bookId } = useParams<{ bookId: string }>();
  const { data, isLoading, error } = useGraphData(bookId);
  const [selectedNodeId, setSelectedNodeId] = useState<string | null>(null);
  const [searchQuery, setSearchQuery] = useState('');
  const [visibleTypes, setVisibleTypes] = useState(new Set(ALL_TYPES));
  const [showParagraphPanel, setShowParagraphPanel] = useState(false);

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
    setShowParagraphPanel(false);
  };

  const handleNodeTap = useCallback((nodeId: string) => {
    setSelectedNodeId(nodeId);
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

  return (
    <div className="flex h-full relative">
      {/* Graph area */}
      <div className="flex-1 relative">
        <GraphCanvas elements={filteredElements} onNodeTap={handleNodeTap} />

        {/* Floating toolbar */}
        <GraphToolbar
          searchQuery={searchQuery}
          onSearchChange={setSearchQuery}
          visibleTypes={visibleTypes}
          onTypeToggle={handleTypeToggle}
          onReset={handleReset}
        />

        {/* Zoom controls */}
        <div className="absolute bottom-4 left-4 flex flex-col gap-1">
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

        {/* Stats */}
        <div
          className="absolute bottom-4 right-4 text-xs px-2 py-1 rounded"
          style={{ backgroundColor: 'white', border: '1px solid var(--border)', color: 'var(--fg-muted)' }}
        >
          {nodeCount} 節點 · {edgeCount} 關係
        </div>
      </div>

      {/* Detail panel */}
      {selectedNode && bookId && (
        <EntityDetailPanel
          node={selectedNode}
          bookId={bookId}
          onClose={() => {
            setSelectedNodeId(null);
            setShowParagraphPanel(false);
          }}
          onShowParagraphs={() => setShowParagraphPanel(true)}
        />
      )}

      {/* Paragraph panel placeholder */}
      {showParagraphPanel && selectedNode && (
        <div
          className="flex-shrink-0 h-full overflow-y-auto p-4"
          style={{
            width: 300,
            backgroundColor: 'var(--bg-primary)',
            borderLeft: '1px solid var(--border)',
          }}
        >
          <h3 className="text-sm font-semibold mb-3" style={{ color: 'var(--fg-primary)' }}>
            {selectedNode.name} — 相關段落
          </h3>
          <p className="text-xs" style={{ color: 'var(--fg-muted)' }}>
            段落面板（待後端 API 對接後實作）
          </p>
        </div>
      )}
    </div>
  );
}
