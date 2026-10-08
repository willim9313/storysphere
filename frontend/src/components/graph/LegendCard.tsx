import { useTranslation } from 'react-i18next';
import type { EntityType } from '@/api/types';
import type { ClusterMode } from './GraphToolbar';
import { NODE_SHAPES } from '@/lib/cytoscapeConfig';

type NodeShape = (typeof NODE_SHAPES)[keyof typeof NODE_SHAPES];

/** 12px drawings of the cytoscape node shapes, so the legend reads the way the
 *  canvas does (shape first, colour second). 「其他」 is the smaller circle. */
const SHAPE_MARK: Record<NodeShape, (small: boolean) => React.ReactNode> = {
  ellipse: (small) => <circle cx="6" cy="6" r={small ? 3.8 : 5} />,
  'round-rectangle': () => <rect x="1" y="1" width="10" height="10" rx="3" />,
  hexagon: () => <polygon points="3,1 9,1 11.5,6 9,11 3,11 0.5,6" />,
  diamond: () => <polygon points="6,0.5 11.5,6 6,11.5 0.5,6" />,
  'round-triangle': () => <polygon points="6,1 11,10.5 1,10.5" strokeLinejoin="round" />,
  rectangle: () => <rect x="1.5" y="1.5" width="9" height="9" />,
};

// 設計 contract（README「Graph legend covers all 7 types」）：圖例必須涵蓋
// 完整 7 類，不得只列 4 類 demo 子集——數量為 0 的類型也照列。
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

const MODE_KEY: Record<ClusterMode, string> = {
  node: 'v1.cluster.mode.node',
  type: 'v1.cluster.mode.type',
  community: 'v1.cluster.mode.community',
};

// C6 裁決：圖例不再是型別開關（唯一入口移至工具列 filter chips），改為純說明。
//
/**
 * The graph's block-level legend (B-065, layer 2 of 3) — a band flush against
 * the canvas's bottom edge, headed 「目前鏡頭 · {mode}」 so that "the legend
 * follows the lens" is visible on one screen instead of after two clicks.
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
 *   naming four edge colours against a canvas that draws one is not a help —
 *   so under 類型 the whole relation-colour group is absent, not "just muted".
 * - Thickness had no entry at all, and it is the one channel that *does* carry
 *   a number under 類型 / 社群 (measured on the seed book: 244 edges all at
 *   1.20px under 個別, 1.60–6.00 under 類型).
 *
 * So each lens gets the entries that are true of what it draws, and nothing
 * else. The entity-type row is dropped under 社群 for the same reason (the hulls
 * there are factions, not types) and so is the 「型別開關在上方工具列」 pointer —
 * it would point at a control with nothing to switch.
 *
 * Read-only: the band is not clickable and the cursor does not change.
 * Not dismissible — this is layer 2. See `docs/UI_SPEC.md` §3.6.
 */
export function LegendCard({ clusterMode = 'node' }: Readonly<{ clusterMode?: ClusterMode }>) {
  const { t } = useTranslation('graph');
  const isAggregated = clusterMode === 'type' || clusterMode === 'community';
  const showTypes = clusterMode !== 'community';

  return (
    <div className="kg-legend">
      <div className="kg-legend-head">
        <span className="kg-legend-lens">{t('legend.currentLens', { mode: t(MODE_KEY[clusterMode]) })}</span>
        {showTypes ? (
          <div className="kg-legend-types">
            {LEGEND_TYPES.map((type) => {
              const dotKey = TYPE_KEY[type];
              return (
                <span key={type} className="kg-legend-type">
                  <svg
                    width="12"
                    height="12"
                    viewBox="0 0 12 12"
                    aria-hidden="true"
                    className="flex-shrink-0"
                    style={{ fill: `var(--graph-${dotKey}-fill)`, stroke: `var(--graph-${dotKey}-stroke)`, strokeWidth: 1.2 }}
                  >
                    {SHAPE_MARK[NODE_SHAPES[type]](type === 'other')}
                  </svg>
                  {t(`entityTypes.${type}`)}
                </span>
              );
            })}
          </div>
        ) : (
          <span style={{ flex: 1 }} />
        )}
        {showTypes && <span className="kg-legend-hint">{t('legend.typeToggleHint')}</span>}
      </div>

      {/* What the edges and the circle sizes mean in THIS lens. */}
      <div className="kg-legend-row">
        {clusterMode === 'node' && (
          <>
            <EdgeSwatch color="var(--color-success)" label={t('v1.legend.edgeCooperative')} weight={2.5} />
            <EdgeSwatch color="var(--color-error)" label={t('v1.legend.edgeHostile')} lineStyle="dashed" />
            <EdgeSwatch color="var(--fg-muted)" label={t('v1.legend.edgeNeutral')} weight={1} />
            <EdgeSwatch color="var(--color-warning)" label={t('v1.legend.edgeInferred')} lineStyle="dotted" />
          </>
        )}
        {/* FactionCanvas draws rivalry as a red dashed line and cooperation as
            a plain muted one; only the rivalry mark needs naming. */}
        {clusterMode === 'community' && (
          <EdgeSwatch color="var(--color-error)" label={t('v1.legend.edgeHostile')} lineStyle="dashed" />
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
    <span className="kg-legend-item">
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
    <span className="kg-legend-item">
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

/** Line style matches the canvas: 合作 solid (heavier), 敵對 dashed, 推測 dotted
 *  — the style, not the colour, is what survives the Ink theme. */
function EdgeSwatch({
  color,
  label,
  lineStyle = 'solid',
  weight = 2,
}: {
  readonly color: string;
  readonly label: string;
  readonly lineStyle?: 'solid' | 'dashed' | 'dotted';
  readonly weight?: number;
}) {
  return (
    <span className="kg-legend-item">
      <span
        className="flex-shrink-0"
        style={{ width: 20, height: 0, borderTop: `${weight}px ${lineStyle} ${color}` }}
      />
      {label}
    </span>
  );
}
