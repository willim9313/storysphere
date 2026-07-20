import { useTranslation } from 'react-i18next';
import type { EntityType } from '@/api/types';

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

// C6 裁決：圖例不再是型別開關（唯一入口移至工具列 filter chips），改為純說明。
// 2026-07-20：依設計稿改為底部橫條（兩列），移除型別計數與標題。
export function LegendCard() {
  const { t } = useTranslation('graph');

  return (
    <div
      style={{
        backgroundColor: 'var(--bg-primary)',
        border: '1px solid var(--border)',
        borderRadius: 'var(--radius-lg)',
        boxShadow: 'var(--shadow-sm)',
        padding: '8px 14px',
        display: 'flex',
        flexDirection: 'column',
        gap: 6,
      }}
    >
      {/* Row 1: entity types */}
      <div className="flex items-center flex-wrap" style={{ gap: 14, rowGap: 4 }}>
        {LEGEND_TYPES.map((type) => {
          const dotKey = TYPE_KEY[type];
          return (
            <span
              key={type}
              className="inline-flex items-center"
              style={{ gap: 5, fontSize: 'var(--font-size-2xs)', color: 'var(--fg-secondary)' }}
            >
              <span
                className="inline-block rounded-full flex-shrink-0"
                style={{
                  width: 11,
                  height: 11,
                  backgroundColor: `var(--graph-${dotKey}-fill)`,
                  border: `var(--line-weight) solid var(--graph-${dotKey}-stroke)`,
                }}
              />
              {t(`entityTypes.${type}`)}
            </span>
          );
        })}
      </div>

      {/* Row 2: edge semantics + node-size key */}
      <div
        className="flex items-center flex-wrap"
        style={{ gap: 14, rowGap: 4, paddingTop: 6, borderTop: '1px solid var(--border)' }}
      >
        <EdgeSwatch color="var(--color-success)" label={t('v1.legend.edgeCooperative')} />
        <EdgeSwatch color="var(--color-error)" label={t('v1.legend.edgeHostile')} />
        <EdgeSwatch color="var(--fg-muted)" label={t('v1.legend.edgeNeutral')} />
        <EdgeSwatch color="var(--color-warning)" label={t('v1.legend.edgeInferred')} dashed />
        <span
          className="inline-flex items-center"
          style={{ gap: 6, fontSize: 'var(--font-size-2xs)', color: 'var(--fg-secondary)' }}
        >
          <span
            className="inline-block rounded-full flex-shrink-0"
            style={{ width: 8, height: 8, border: '1.5px solid var(--fg-muted)' }}
          />
          <span
            className="inline-block rounded-full flex-shrink-0"
            style={{ width: 15, height: 15, border: '1.5px solid var(--fg-muted)' }}
          />
          {t('v1.legend.circleSizeHint')}
        </span>
      </div>
    </div>
  );
}

function EdgeSwatch({ color, label, dashed }: { readonly color: string; readonly label: string; readonly dashed?: boolean }) {
  return (
    <span
      className="inline-flex items-center"
      style={{ gap: 6, fontSize: 'var(--font-size-2xs)', color: 'var(--fg-secondary)' }}
    >
      <span
        className="flex-shrink-0"
        style={
          dashed
            ? { width: 20, height: 0, borderTop: `2px dashed ${color}` }
            : { width: 20, height: 2, backgroundColor: color, borderRadius: 2 }
        }
      />
      {label}
    </span>
  );
}
