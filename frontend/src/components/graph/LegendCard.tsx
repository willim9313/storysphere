import { useMemo } from 'react';
import { useTranslation } from 'react-i18next';
import type { EntityType, GraphData } from '@/api/types';

const LEGEND_TYPES: EntityType[] = ['character', 'location', 'concept', 'event'];

interface LegendCardProps {
  graph: GraphData | undefined;
  visibleTypes: Set<string>;
  onTypeToggle: (type: EntityType) => void;
  inferredCount: number;
  inferredVisible: boolean;
  onInferredToggle: () => void;
}

export function LegendCard({
  graph,
  visibleTypes,
  onTypeToggle,
  inferredCount,
  inferredVisible,
  onInferredToggle,
}: LegendCardProps) {
  const { t } = useTranslation('graph');

  const typeCounts = useMemo(() => {
    const counts = new Map<EntityType, number>(LEGEND_TYPES.map((t) => [t, 0]));
    if (!graph) return counts;
    for (const n of graph.nodes) {
      if (counts.has(n.type as EntityType)) {
        counts.set(n.type as EntityType, (counts.get(n.type as EntityType) ?? 0) + 1);
      }
    }
    return counts;
  }, [graph]);

  return (
    <div
      style={{
        minWidth: 140,
        backgroundColor: 'var(--bg-primary)',
        border: '1px solid var(--border)',
        borderRadius: 'var(--radius-lg)',
        boxShadow: 'var(--shadow-sm)',
        padding: '8px 10px',
        display: 'flex',
        flexDirection: 'column',
        gap: 5,
      }}
    >
      <div
        className="font-semibold uppercase"
        style={{
          fontSize: 9,
          color: 'var(--fg-muted)',
          letterSpacing: '0.06em',
          paddingBottom: 4,
          borderBottom: '1px solid var(--border)',
        }}
      >
        {t('v1.legend.title')}
      </div>
      {LEGEND_TYPES.map((type) => {
        const dotKey = type === 'concept' ? 'con' : type === 'event' ? 'evt' : type === 'location' ? 'loc' : 'char';
        const visible = visibleTypes.has(type);
        return (
          <button
            key={type}
            onClick={() => onTypeToggle(type)}
            className="flex items-center w-full text-left"
            style={{
              gap: 6,
              fontSize: 11,
              color: visible ? 'var(--fg-secondary)' : 'var(--fg-muted)',
              opacity: visible ? 1 : 0.5,
              textDecoration: visible ? 'none' : 'line-through',
              transition: 'opacity var(--transition-fast, 150ms) ease',
            }}
          >
            <span
              className="inline-block rounded-full flex-shrink-0"
              style={{
                width: 9,
                height: 9,
                backgroundColor: `var(--entity-${dotKey}-dot, var(--graph-${dotKey}-fill, var(--accent)))`,
              }}
            />
            <span className="flex-1">{t(`entityTypes.${type}`)}</span>
            <span
              className="tabular-nums"
              style={{ fontSize: 10, color: 'var(--fg-muted)' }}
            >
              {typeCounts.get(type) ?? 0}
            </span>
          </button>
        );
      })}
      {inferredCount > 0 && (
        <button
          onClick={onInferredToggle}
          className="flex items-center w-full text-left"
          style={{
            gap: 6,
            fontSize: 11,
            color: 'var(--fg-secondary)',
            marginTop: 4,
            paddingTop: 4,
            borderTop: '1px solid var(--border)',
            opacity: inferredVisible ? 1 : 0.5,
            transition: 'opacity var(--transition-fast, 150ms) ease',
          }}
        >
          <span
            className="flex-shrink-0"
            style={{
              width: 16,
              height: 6,
              display: 'inline-flex',
              alignItems: 'center',
            }}
          >
            <span
              style={{
                width: 16,
                height: 1.5,
                backgroundColor: 'var(--accent)',
                opacity: 0.6,
              }}
            />
          </span>
          <span className="flex-1">{t('v1.legend.inferred')}</span>
          <span
            className="tabular-nums"
            style={{ fontSize: 10, color: 'var(--fg-muted)' }}
          >
            {inferredCount}
          </span>
        </button>
      )}
    </div>
  );
}
