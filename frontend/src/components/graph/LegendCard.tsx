import { useMemo } from 'react';
import { useTranslation } from 'react-i18next';
import type { EntityType, GraphData } from '@/api/types';

// 設計 contract（README「Graph legend covers all 7 types」）：圖例必須涵蓋
// 完整 7 類，不得只列 4 類 demo 子集。
const LEGEND_TYPES: EntityType[] = ['character', 'location', 'organization', 'object', 'concept', 'event', 'other'];

const TYPE_KEY: Record<EntityType, string> = {
  character: 'char',
  location: 'loc',
  organization: 'org',
  object: 'obj',
  concept: 'con',
  event: 'evt',
  other: 'other',
};

interface LegendCardProps {
  readonly graph: GraphData | undefined;
}

// C6 裁決：圖例不再是型別開關（唯一入口移至工具列 filter chips），改為
// 純說明卡 — 7 型別 swatch + 計數、邊語意配色、節點大小示意。
export function LegendCard({ graph }: LegendCardProps) {
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
        minWidth: 150,
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
          fontSize: 'var(--font-size-2xs)',
          color: 'var(--fg-muted)',
          letterSpacing: '0.06em',
          paddingBottom: 4,
          borderBottom: '1px solid var(--border)',
        }}
      >
        {t('v1.legend.title')}
      </div>
      {LEGEND_TYPES.map((type) => {
        const dotKey = TYPE_KEY[type];
        return (
          <div
            key={type}
            className="flex items-center w-full"
            style={{ gap: 6, fontSize: 'var(--font-size-2xs)', color: 'var(--fg-secondary)' }}
          >
            <span
              className="inline-block rounded-full flex-shrink-0"
              style={{
                width: 12,
                height: 12,
                backgroundColor: `var(--graph-${dotKey}-fill)`,
                border: `var(--line-weight) solid var(--graph-${dotKey}-stroke)`,
              }}
            />
            <span className="flex-1">{t(`entityTypes.${type}`)}</span>
            <span
              className="tabular-nums"
              style={{ fontSize: 'var(--font-size-2xs)', color: 'var(--fg-muted)' }}
            >
              {typeCounts.get(type) ?? 0}
            </span>
          </div>
        );
      })}

      {/* 邊語意 */}
      <div
        style={{
          marginTop: 4,
          paddingTop: 6,
          borderTop: '1px solid var(--border)',
          display: 'flex',
          flexDirection: 'column',
          gap: 5,
        }}
      >
        <div
          className="uppercase"
          style={{ fontSize: 'var(--font-size-2xs)', color: 'var(--fg-muted)', letterSpacing: '0.06em' }}
        >
          {t('v1.legend.edgeSemantics')}
        </div>
        <EdgeSwatchRow color="var(--color-success)" label={t('v1.legend.edgeCooperative')} />
        <EdgeSwatchRow color="var(--color-error)" label={t('v1.legend.edgeHostile')} />
        <EdgeSwatchRow color="var(--fg-muted)" label={t('v1.legend.edgeNeutral')} />
        <EdgeSwatchRow color="var(--color-warning)" label={t('v1.legend.edgeInferred')} dashed />
      </div>

      {/* 節點大小示意 */}
      <div
        className="flex items-center"
        style={{
          gap: 6,
          marginTop: 4,
          paddingTop: 6,
          borderTop: '1px solid var(--border)',
          fontSize: 'var(--font-size-2xs)',
          color: 'var(--fg-secondary)',
        }}
      >
        <span
          className="inline-block rounded-full flex-shrink-0"
          style={{ width: 8, height: 8, border: '1.5px solid var(--fg-muted)' }}
        />
        <span
          className="inline-block rounded-full flex-shrink-0"
          style={{ width: 15, height: 15, border: '1.5px solid var(--fg-muted)' }}
        />
        <span>{t('v1.legend.circleSizeHint')}</span>
      </div>
    </div>
  );
}

function EdgeSwatchRow({ color, label, dashed }: { readonly color: string; readonly label: string; readonly dashed?: boolean }) {
  return (
    <div className="flex items-center" style={{ gap: 6, fontSize: 'var(--font-size-2xs)', color: 'var(--fg-secondary)' }}>
      <span
        className="flex-shrink-0"
        style={
          dashed
            ? { width: 20, height: 0, borderTop: `2px dashed ${color}` }
            : { width: 20, height: 2, backgroundColor: color, borderRadius: 2 }
        }
      />
      <span>{label}</span>
    </div>
  );
}
