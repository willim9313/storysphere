import { useTranslation } from 'react-i18next';
import type { EntityType } from '@/api/types';
import type { ClusterMode } from './GraphToolbar';

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
//
/**
 * The graph's block-level legend (B-065, layer 2 of 3).
 *
 * **Lens-dependent, because the marks are.** The card used to be a constant,
 * and three of its entries were therefore wrong in two of the three lenses:
 *
 * - `圓圈大小＝登場頻率` holds only under 個別, where node diameter is
 *   `mapSize(chunkCount)`. Under 類型 a bubble is a super-node sized by
 *   `clusterSize(count)` — how many members it holds — and under 社群 the hull
 *   radius is `factionRadius(memberIds.length)`. Same channel, different number.
 * - The 合作 / 敵對 / 一般 relation colours come from `relationEdgeStylesheet`
 *   in GraphPage, whose selectors are `edge[label = "ally"][!inferred]` and so
 *   on. Aggregated edges carry a weight count as their label, so none of those
 *   selectors match and every edge under 類型 renders `--fg-muted`. A legend
 *   naming four edge colours against a canvas that draws one is not a help.
 * - Thickness had no entry at all, and it is the one channel that *does* carry
 *   a number under 類型 / 社群 (measured on the seed book: 244 edges all at
 *   1.20px under 個別, 1.60–6.00 under 類型).
 *
 * So each lens gets the entries that are true of what it draws, and nothing
 * else. The entity-type row is dropped under 社群 for the same reason: the
 * hulls there are factions, not types.
 *
 * Not dismissible — this is layer 2. See `docs/UI_SPEC.md` §4.2.
 */
export function LegendCard({ clusterMode = 'node' }: Readonly<{ clusterMode?: ClusterMode }>) {
  const { t } = useTranslation('graph');
  const isAggregated = clusterMode === 'type' || clusterMode === 'community';

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
      {/* Row 1: entity types. Dropped under 社群, where the bubbles are
          factions drawn by FactionCanvas and carry no entity-type fill. */}
      {clusterMode !== 'community' && (
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
      )}

      {/* Row 2: what the edges and the circle sizes mean in THIS lens. */}
      <div
        className="flex items-center flex-wrap"
        style={{
          gap: 14,
          rowGap: 4,
          paddingTop: clusterMode === 'community' ? 0 : 6,
          borderTop: clusterMode === 'community' ? 'none' : '1px solid var(--border)',
        }}
      >
        {clusterMode === 'node' && (
          <>
            <EdgeSwatch color="var(--color-success)" label={t('v1.legend.edgeCooperative')} />
            <EdgeSwatch color="var(--color-error)" label={t('v1.legend.edgeHostile')} />
            <EdgeSwatch color="var(--fg-muted)" label={t('v1.legend.edgeNeutral')} />
            <EdgeSwatch color="var(--color-warning)" label={t('v1.legend.edgeInferred')} dashed />
          </>
        )}
        {/* FactionCanvas draws rivalry as a red dashed line and cooperation as
            a plain muted one; only the rivalry mark needs naming. */}
        {clusterMode === 'community' && (
          <EdgeSwatch color="var(--color-error)" label={t('v1.legend.edgeHostile')} dashed />
        )}
        {isAggregated && (
          <WidthSwatch
            label={t(
              clusterMode === 'community'
                ? 'v1.legend.edgeWidthFaction'
                : 'v1.legend.edgeWidthAggregated',
            )}
          />
        )}
        <SizeSwatch
          label={t(isAggregated ? 'v1.legend.circleSizeMembers' : 'v1.legend.circleSizeHint')}
        />
      </div>
    </div>
  );
}

/**
 * Two lines, thin above thick — the mark for "width carries a number here".
 *
 * Drawn in `--fg-muted` rather than a semantic colour on purpose: thickness is
 * a shape channel, and shape is the only channel that survives the ink theme,
 * which flattens every semantic colour to the same near-black (tokens.css:
 * 「Status — 單一單色處理；狀態由 icon 字形承載」).
 */
function WidthSwatch({ label }: { readonly label: string }) {
  return (
    <span
      className="inline-flex items-center"
      style={{ gap: 6, fontSize: 'var(--font-size-2xs)', color: 'var(--fg-secondary)' }}
    >
      <span className="inline-flex flex-col flex-shrink-0" style={{ gap: 3 }}>
        <span style={{ width: 20, height: 1, backgroundColor: 'var(--fg-muted)' }} />
        <span style={{ width: 20, height: 5, backgroundColor: 'var(--fg-muted)', borderRadius: 2 }} />
      </span>
      {label}
    </span>
  );
}

/** Two circles, small and large — the mark for "diameter carries a number". */
function SizeSwatch({ label }: { readonly label: string }) {
  return (
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
      {label}
    </span>
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
