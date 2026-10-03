import { useState } from 'react';
import { ChevronDown, ChevronRight } from 'lucide-react';
import { useTranslation } from 'react-i18next';
import { factionToken, type RankedFaction } from '../characterModel';
import { FactionSwatch } from './FactionLegend';
import type { OverviewCharacter } from './types';

interface RankingViewProps {
  characters: OverviewCharacter[];
  rankedFactions: RankedFaction[];
  onSelect: (entityId: string) => void;
  onGenerate: (entityId: string) => void;
  generatingId: string | null;
}

const DEFAULT_ROWS = 11;

export function RankingView({
  characters,
  rankedFactions,
  onSelect,
  onGenerate,
  generatingId,
}: Readonly<RankingViewProps>) {
  const { t } = useTranslation('analysis');
  const [expanded, setExpanded] = useState(false);

  const sorted = [...characters].sort((a, b) => b.mentionCount - a.mentionCount);
  const hero = sorted[0];
  const rest = sorted.slice(1);
  const shown = expanded ? rest : rest.slice(0, DEFAULT_ROWS);
  const maxMentions = hero?.mentionCount ?? 1;

  if (!hero) return null;

  return (
    <div className="ca-ov-ranking">
      <div className="ca-ov-ranking-head">
        <h3 className="ca-ov-ranking-title">{t('character.overview.viewRanking')}</h3>
        <span className="ca-ov-caption">{t('character.overview.rankingCaption')}</span>
      </div>

      <div className="ca-ov-hero">
        <span className={'ca-ov-hero-avatar' + (hero.analyzed ? '' : ' muted')}>{hero.name[0]}</span>
        <div className="ca-ov-hero-body">
          <div className="ca-ov-hero-title">
            <span className="ca-ov-hero-rank">#1</span>
            <span className="ca-ov-hero-name">{hero.name}</span>
          </div>
          <span className="ca-ov-hero-tag">{t('character.overview.ranking.heroTag')}</span>
          <span className="ca-ov-hero-sub">
            {t('character.overview.ranking.heroSub', {
              mentions: hero.mentionCount,
              degree: hero.degree ?? 0,
            })}
          </span>
        </div>
        {hero.analyzed ? (
          <button type="button" className="ss-btn ss-btn-sm ss-btn-secondary" onClick={() => onSelect(hero.entityId)}>
            {t('character.overview.ranking.viewAnalysis')}
          </button>
        ) : (
          <button
            type="button"
            className="ss-btn ss-btn-sm ss-btn-primary ss-btn-llm"
            onClick={() => onGenerate(hero.entityId)}
            disabled={generatingId === hero.entityId}
          >
            {t('character.overview.ranking.createHero')}
          </button>
        )}
      </div>

      <div className="ca-ov-rank-list">
        {shown.map((c, i) => (
          <div
            key={c.entityId}
            className="ca-ov-rank-row"
            role="button"
            tabIndex={0}
            onClick={() => onSelect(c.entityId)}
            onKeyDown={(e) => {
              if (e.target !== e.currentTarget) return;
              if (e.key === 'Enter' || e.key === ' ') {
                e.preventDefault();
                onSelect(c.entityId);
              }
            }}
          >
            <span className="ca-ov-rank-n">{`#${i + 2}`}</span>
            <FactionSwatch token={factionToken(c.factionIndex, rankedFactions)} />
            <span className={'ca-ov-rank-name' + (c.analyzed ? '' : ' muted')}>{c.name}</span>
            <span className={'ca-ov-rank-dot' + (c.analyzed ? ' on' : '')} />
            <div className="ca-ov-rank-bar-track">
              <div
                className={'ca-ov-rank-bar-fill' + (c.analyzed ? '' : ' muted')}
                style={{ width: `${(c.mentionCount / maxMentions) * 100}%` }}
              />
            </div>
            <span className="ca-ov-rank-count">{c.mentionCount}</span>
            <span className="ca-ov-rank-action">
              {!c.analyzed && (
                <button
                  type="button"
                  className="ss-btn ss-btn-sm ss-btn-ghost ss-btn-llm"
                  onClick={(e) => {
                    e.stopPropagation();
                    onGenerate(c.entityId);
                  }}
                  disabled={generatingId === c.entityId}
                >
                  {generatingId === c.entityId ? '…' : t('character.list.createBtn')}
                </button>
              )}
            </span>
          </div>
        ))}
      </div>

      {rest.length > DEFAULT_ROWS && (
        <button type="button" className="ca-ov-expand-btn" onClick={() => setExpanded((v) => !v)}>
          {expanded ? <ChevronDown size={13} /> : <ChevronRight size={13} />}
          {expanded
            ? t('character.overview.ranking.collapse')
            : t('character.overview.ranking.expand', { count: rest.length - DEFAULT_ROWS })}
        </button>
      )}
    </div>
  );
}
