import { useState } from 'react';
import { useTranslation } from 'react-i18next';
import {
  toggleFactionSelection,
  type CategoricalToken,
  type FactionLegendModel,
  type FactionSelection,
  type RankedFaction,
} from '../characterModel';

/** 類別色票。無派系（null）只描邊、不填色。 */
export function FactionSwatch({ token }: Readonly<{ token: CategoricalToken | null }>) {
  return (
    <span
      className={'ca-swatch' + (token ? '' : ' none')}
      style={token ? { background: `var(--ca-${token}-bg)` } : undefined}
    />
  );
}

interface FactionLegendProps {
  legend: FactionLegendModel;
  hasFactions: boolean;
  unaffiliatedCount: number;
  selection: FactionSelection;
  onSelectionChange: (next: FactionSelection) => void;
}

/**
 * 派系圖例（類別色 Categorical · 規則 1–7）。
 * 前 5 名各拿一色；第 6 名起併成「其他」，可展開列出被併入的派系名。
 * 點任一項單獨亮出該派系（其餘泡泡降到 0.3），再點同一項取消。
 * 0 個派系時整組不出現，只留「此書未抽出派系」。
 */
export function FactionLegend({
  legend,
  hasFactions,
  unaffiliatedCount,
  selection,
  onSelectionChange,
}: Readonly<FactionLegendProps>) {
  const { t } = useTranslation('analysis');
  const [otherOpen, setOtherOpen] = useState(false);
  const pick = (next: Exclude<FactionSelection, null>) =>
    onSelectionChange(toggleFactionSelection(selection, next));

  const isOn = (f: RankedFaction) => selection?.kind === 'faction' && selection.index === f.index;
  const otherOn = selection?.kind === 'other';

  return (
    <aside className="ca-ov-legend">
      {hasFactions ? (
        <>
          <div className="ca-ov-legend-head">{t('character.overview.quadrant.legendHead')}</div>
          {legend.slotted.map((f) => {
            const names = f.topMemberNames;
            const label =
              names.length > 0
                ? t('character.overview.quadrant.legendRow', {
                    names: names.slice(0, 2).join('、'),
                    count: f.memberCount,
                  })
                : f.label;
            return (
              <button
                key={f.id}
                type="button"
                className={'ca-ov-legend-row' + (isOn(f) ? ' on' : '')}
                aria-pressed={isOn(f)}
                onClick={() => pick({ kind: 'faction', index: f.index })}
              >
                <FactionSwatch token={`cat-${(f.slot ?? 0) + 1}` as CategoricalToken} />
                <span className="ca-ov-legend-label">{label}</span>
              </button>
            );
          })}
          {legend.merged.length > 0 && (
            <div className="ca-ov-legend-other">
              <div className="ca-ov-legend-other-head">
                <button
                  type="button"
                  className={'ca-ov-legend-row' + (otherOn ? ' on' : '')}
                  aria-pressed={otherOn}
                  onClick={() => pick({ kind: 'other' })}
                >
                  <FactionSwatch token="cat-other" />
                  <span className="ca-ov-legend-label">
                    {t('character.overview.quadrant.legendOther', {
                      n: legend.merged.length,
                      m: legend.mergedMemberCount,
                    })}
                  </span>
                </button>
                <button
                  type="button"
                  className="ca-ov-legend-toggle"
                  aria-expanded={otherOpen}
                  onClick={() => setOtherOpen((v) => !v)}
                >
                  {otherOpen
                    ? t('character.overview.quadrant.legendCollapse')
                    : t('character.overview.quadrant.legendExpand')}
                </button>
              </div>
              {otherOpen && (
                <div className="ca-ov-legend-merged">
                  {legend.merged.map((f) => (
                    <button
                      key={f.id}
                      type="button"
                      className={'ca-ov-legend-row sub' + (isOn(f) ? ' on' : '')}
                      aria-pressed={isOn(f)}
                      onClick={() => pick({ kind: 'faction', index: f.index })}
                    >
                      <FactionSwatch token="cat-other" />
                      <span className="ca-ov-legend-label">{`${f.label} ${f.memberCount}`}</span>
                    </button>
                  ))}
                </div>
              )}
            </div>
          )}
          <div className="ca-ov-legend-row static muted">
            <FactionSwatch token={null} />
            <span className="ca-ov-legend-label">
              {t('character.overview.quadrant.unaffiliated', { count: unaffiliatedCount })}
            </span>
          </div>
        </>
      ) : (
        <p className="ca-ov-legend-empty">{t('character.overview.quadrant.legendEmpty')}</p>
      )}
      <div className="ca-ov-legend-row static muted ca-ov-legend-ring">
        <span className="ca-swatch is-ring" />
        <span className="ca-ov-legend-label">{t('character.overview.quadrant.legendAnalyzedRing')}</span>
      </div>
      {hasFactions && <p className="ca-ov-legend-note">{t('character.overview.quadrant.legendNote')}</p>}
    </aside>
  );
}
