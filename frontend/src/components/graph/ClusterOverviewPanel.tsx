import { useMemo, useState } from 'react';
import { X, ChevronRight, ArrowUpDown } from 'lucide-react';
import { useTranslation } from 'react-i18next';
import type { EntityType, GraphNode } from '@/api/types';
import type { ClusteredGraph } from '@/services/kgClustering';

interface ClusterOverviewPanelProps {
  clustered: ClusteredGraph;
  graphNodes: GraphNode[];
  drillInType: EntityType | null;
  onClose: () => void;
  onDrillIn: (type: EntityType) => void;
  onExitDrillIn: () => void;
  onMemberSelect?: (id: string) => void;
}

type SortKey = 'importance' | 'name';

export function ClusterOverviewPanel({
  clustered,
  graphNodes,
  drillInType,
  onClose,
  onDrillIn,
  onExitDrillIn,
  onMemberSelect,
}: ClusterOverviewPanelProps) {
  const { t } = useTranslation('graph');
  const [sortKey, setSortKey] = useState<SortKey>('importance');

  const nodeMap = useMemo(() => new Map(graphNodes.map((n) => [n.id, n])), [graphNodes]);

  if (drillInType) {
    const cluster = clustered.superNodes.find((c) => c.clusterType === drillInType);
    if (!cluster) return null;
    const members = cluster.memberIds
      .map((id) => nodeMap.get(id))
      .filter((n): n is GraphNode => !!n);
    const sorted = [...members].sort((a, b) => {
      if (sortKey === 'importance') return b.chunkCount - a.chunkCount;
      return a.name.localeCompare(b.name);
    });

    return (
      <PanelShell
        title={t('v1.cluster.drillInTitle', {
          typeName: t(`entityTypes.${drillInType}`),
          n: cluster.count,
        })}
        onClose={onClose}
        onBack={onExitDrillIn}
      >
        <div className="flex items-center justify-between mb-2">
          <span className="text-[11px]" style={{ color: 'var(--fg-muted)' }}>
            {t('v1.cluster.members', { n: cluster.count })}
          </span>
          <button
            onClick={() => setSortKey((k) => (k === 'importance' ? 'name' : 'importance'))}
            className="flex items-center gap-1 text-[11px]"
            style={{ color: 'var(--fg-secondary)' }}
          >
            <ArrowUpDown size={11} />
            {sortKey === 'importance'
              ? t('v1.cluster.sortImportance')
              : t('v1.cluster.sortName')}
          </button>
        </div>
        <ul className="space-y-1">
          {sorted.map((n) => (
            <li key={n.id}>
              <button
                onClick={() => onMemberSelect?.(n.id)}
                className="w-full flex items-center justify-between gap-2 px-2 py-1.5 rounded text-xs"
                style={{ color: 'var(--fg-primary)' }}
                onMouseEnter={(e) =>
                  (e.currentTarget.style.backgroundColor = 'var(--bg-secondary)')
                }
                onMouseLeave={(e) =>
                  (e.currentTarget.style.backgroundColor = 'transparent')
                }
              >
                <span className="truncate text-left flex-1">{n.name}</span>
                <span
                  className="tabular-nums text-[10px]"
                  style={{ color: 'var(--fg-muted)' }}
                >
                  {n.chunkCount}
                </span>
              </button>
            </li>
          ))}
        </ul>
      </PanelShell>
    );
  }

  return (
    <PanelShell title={t('v1.cluster.overview')} onClose={onClose}>
      <ul className="space-y-2">
        {clustered.superNodes.map((c) => {
          const dotKey = c.clusterType === 'concept' ? 'con' : c.clusterType === 'event' ? 'evt' : c.clusterType === 'location' ? 'loc' : 'char';
          return (
            <li key={c.id}>
              <button
                onClick={() => onDrillIn(c.clusterType as EntityType)}
                className="w-full text-left rounded-md p-2.5"
                style={{
                  border: '1px solid var(--border)',
                  backgroundColor: 'var(--bg-primary)',
                  transition: 'background-color var(--transition-fast, 150ms) ease',
                }}
                onMouseEnter={(e) =>
                  (e.currentTarget.style.backgroundColor = 'var(--bg-secondary)')
                }
                onMouseLeave={(e) =>
                  (e.currentTarget.style.backgroundColor = 'var(--bg-primary)')
                }
              >
                <div className="flex items-center justify-between mb-1">
                  <div className="flex items-center gap-2">
                    <span
                      className="inline-block rounded-full"
                      style={{
                        width: 8,
                        height: 8,
                        backgroundColor: `var(--entity-${dotKey}-dot, var(--graph-${dotKey}-fill, var(--accent)))`,
                      }}
                    />
                    <span
                      className="text-xs font-semibold"
                      style={{ color: 'var(--fg-primary)' }}
                    >
                      {t(`entityTypes.${c.clusterType}`)}
                    </span>
                    <span
                      className="text-[10px] tabular-nums"
                      style={{ color: 'var(--fg-muted)' }}
                    >
                      {t('v1.cluster.memberCount', { n: c.count })}
                    </span>
                  </div>
                  <ChevronRight size={12} style={{ color: 'var(--fg-muted)' }} />
                </div>
                <div className="text-[11px] truncate" style={{ color: 'var(--fg-secondary)' }}>
                  {c.topMembers.map((m) => m.name).join(' · ') ||
                    t('v1.cluster.noTopMembers')}
                </div>
              </button>
            </li>
          );
        })}
      </ul>
    </PanelShell>
  );
}

interface PanelShellProps {
  title: string;
  onClose: () => void;
  onBack?: () => void;
  children: React.ReactNode;
}

function PanelShell({ title, onClose, onBack, children }: PanelShellProps) {
  const { t } = useTranslation('graph');
  return (
    <div className="flex flex-col h-full overflow-hidden">
      <div
        className="flex items-center justify-between p-3 flex-shrink-0"
        style={{ borderBottom: '1px solid var(--border)' }}
      >
        <div className="flex items-center gap-2">
          {onBack && (
            <button
              onClick={onBack}
              className="text-[11px]"
              style={{ color: 'var(--fg-muted)' }}
            >
              ← {t('v1.cluster.back')}
            </button>
          )}
          <h3
            className="text-sm font-semibold"
            style={{ fontFamily: 'var(--font-serif)', color: 'var(--fg-primary)' }}
          >
            {title}
          </h3>
        </div>
        <button onClick={onClose} style={{ color: 'var(--fg-muted)' }}>
          <X size={16} />
        </button>
      </div>
      <div className="flex-1 overflow-y-auto p-3">{children}</div>
    </div>
  );
}
