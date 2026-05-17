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
      className="absolute top-4 right-4 z-10"
      style={{
        width: 180,
        backgroundColor: 'var(--bg-primary)',
        border: '1px solid var(--border)',
        borderRadius: 'var(--radius-lg)',
        boxShadow: 'var(--shadow-sm)',
        fontSize: 12,
      }}
    >
      <div
        className="px-3 py-2"
        style={{ borderBottom: '1px solid var(--border)' }}
      >
        <span
          className="text-[10px] font-semibold uppercase"
          style={{ color: 'var(--fg-muted)', letterSpacing: '0.06em' }}
        >
          {t('v1.legend.title')}
        </span>
      </div>
      <ul className="py-1">
        {LEGEND_TYPES.map((type) => {
          const dotKey = type === 'concept' ? 'con' : type === 'event' ? 'evt' : type === 'location' ? 'loc' : 'char';
          const visible = visibleTypes.has(type);
          return (
            <li key={type}>
              <button
                onClick={() => onTypeToggle(type)}
                className="w-full flex items-center gap-2 px-3 py-1.5"
                style={{
                  color: visible ? 'var(--fg-primary)' : 'var(--fg-muted)',
                  opacity: visible ? 1 : 0.5,
                  transition: 'opacity var(--transition-fast, 150ms) ease',
                }}
                onMouseEnter={(e) =>
                  (e.currentTarget.style.backgroundColor = 'var(--bg-secondary)')
                }
                onMouseLeave={(e) =>
                  (e.currentTarget.style.backgroundColor = 'transparent')
                }
              >
                <span
                  className="inline-block rounded-full flex-shrink-0"
                  style={{
                    width: 8,
                    height: 8,
                    backgroundColor: `var(--entity-${dotKey}-dot, var(--graph-${dotKey}-fill, var(--accent)))`,
                  }}
                />
                <span className="flex-1 text-left text-xs">
                  {t(`entityTypes.${type}`)}
                </span>
                <span
                  className="text-[11px] tabular-nums"
                  style={{ color: 'var(--fg-muted)' }}
                >
                  {typeCounts.get(type) ?? 0}
                </span>
              </button>
            </li>
          );
        })}
      </ul>
      {inferredCount > 0 && (
        <div style={{ borderTop: '1px solid var(--border)' }}>
          <button
            onClick={onInferredToggle}
            className="w-full flex items-center gap-2 px-3 py-1.5"
            style={{
              opacity: inferredVisible ? 1 : 0.5,
              transition: 'opacity var(--transition-fast, 150ms) ease',
            }}
            onMouseEnter={(e) =>
              (e.currentTarget.style.backgroundColor = 'var(--bg-secondary)')
            }
            onMouseLeave={(e) =>
              (e.currentTarget.style.backgroundColor = 'transparent')
            }
          >
            <span
              className="inline-block flex-shrink-0"
              style={{
                width: 14,
                height: 2,
                backgroundColor: 'var(--accent)',
              }}
            />
            <span
              className="flex-1 text-left text-xs"
              style={{ color: 'var(--fg-primary)' }}
            >
              {t('v1.legend.inferred')}
            </span>
            <span
              className="text-[11px] tabular-nums"
              style={{ color: 'var(--fg-muted)' }}
            >
              {inferredCount}
            </span>
          </button>
        </div>
      )}
    </div>
  );
}
