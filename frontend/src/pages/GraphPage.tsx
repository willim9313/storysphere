import { useState, useMemo, useCallback } from 'react';
import { useGraphData } from '@/hooks/useGraphData';
import { GraphCanvas } from '@/components/graph/GraphCanvas';
import { GraphToolbar } from '@/components/graph/GraphToolbar';
import { EntityDetailPanel } from '@/components/graph/EntityDetailPanel';
import { LoadingSpinner } from '@/components/ui/LoadingSpinner';
import { ErrorMessage } from '@/components/ui/ErrorMessage';

const ALL_TYPES = new Set(['character', 'location', 'object', 'event', 'concept', 'organization']);

export default function GraphPage() {
  const { data, isLoading, error } = useGraphData();
  const [selectedNodeId, setSelectedNodeId] = useState<string | null>(null);
  const [searchQuery, setSearchQuery] = useState('');
  const [visibleTypes, setVisibleTypes] = useState(new Set(ALL_TYPES));

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
  };

  const handleNodeTap = useCallback((nodeId: string) => {
    setSelectedNodeId(nodeId);
  }, []);

  const filteredElements = useMemo(() => {
    if (!data?.elements) return [];
    const lowerQ = searchQuery.toLowerCase();

    return data.elements.filter((el) => {
      if (el.group === 'edges') {
        // Keep edges where both endpoints are visible
        const sourceVisible = data.elements.some(
          (n) =>
            n.group === 'nodes' &&
            n.data.id === el.data.source &&
            visibleTypes.has(String(n.data.entityType ?? '')),
        );
        const targetVisible = data.elements.some(
          (n) =>
            n.group === 'nodes' &&
            n.data.id === el.data.target &&
            visibleTypes.has(String(n.data.entityType ?? '')),
        );
        return sourceVisible && targetVisible;
      }
      // Filter nodes
      if (!visibleTypes.has(String(el.data.entityType ?? ''))) return false;
      if (lowerQ && !String(el.data.label ?? '').toLowerCase().includes(lowerQ)) return false;
      return true;
    });
  }, [data?.elements, searchQuery, visibleTypes]);

  if (isLoading) return <LoadingSpinner />;
  if (error) return <ErrorMessage message={error.message} />;

  return (
    <div className="flex -mx-6 -mt-6" style={{ height: 'calc(100vh - 57px)' }}>
      {/* Toolbar */}
      <div
        className="w-56 flex-shrink-0 border-r overflow-y-auto"
        style={{ borderColor: 'var(--color-border)', backgroundColor: 'var(--color-surface)' }}
      >
        <GraphToolbar
          searchQuery={searchQuery}
          onSearchChange={setSearchQuery}
          visibleTypes={visibleTypes}
          onTypeToggle={handleTypeToggle}
          onReset={handleReset}
        />
      </div>

      {/* Canvas */}
      <div className="flex-1">
        <GraphCanvas elements={filteredElements} onNodeTap={handleNodeTap} />
      </div>

      {/* Detail panel */}
      {selectedNodeId && (
        <EntityDetailPanel
          entityId={selectedNodeId}
          onClose={() => setSelectedNodeId(null)}
        />
      )}
    </div>
  );
}
