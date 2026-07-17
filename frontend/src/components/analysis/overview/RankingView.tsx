import { useState } from 'react';
import { ChevronDown, ChevronRight, Sparkles } from 'lucide-react';
import { useTranslation } from 'react-i18next';
import { avatarStyle } from '@/components/analysis/entityAvatarStyle';
import { getFactionColor } from './factionColors';
import type { OverviewCharacter } from './types';

interface RankingViewProps {
  characters: OverviewCharacter[];
  onSelect: (entityId: string) => void;
  onGenerate: (entityId: string) => void;
  generatingId: string | null;
}

const DEFAULT_ROWS = 11;

export function RankingView({ characters, onSelect, onGenerate, generatingId }: RankingViewProps) {
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
      <div className="ca-ov-hero">
        <div className="ca-ov-hero-avatar-wrap">
          <div
            className={'ca-ov-hero-avatar' + (hero.analyzed ? '' : ' muted')}
            style={hero.analyzed ? avatarStyle(hero.name) : undefined}
          >
            {hero.name[0]}
          </div>
          <span className="ca-ov-hero-rank">#1</span>
        </div>
        <div className="ca-ov-hero-body">
          <div className="ca-ov-hero-title">
            <span className="ca-ov-hero-name">{hero.name}</span>
            <span className="ca-ov-hero-tag">{t('character.overview.ranking.heroTag')}</span>
          </div>
          <div className="ca-ov-hero-sub">
            {t('character.overview.ranking.heroSub', {
              mentions: hero.mentionCount,
              degree: hero.degree ?? 0,
            })}
          </div>
        </div>
        {hero.analyzed ? (
          <button type="button" className="ca-btn ca-btn-primary" onClick={() => onSelect(hero.entityId)}>
            {t('character.overview.ranking.viewAnalysis')}
          </button>
        ) : (
          <button
            type="button"
            className="ca-btn ca-btn-primary"
            onClick={() => onGenerate(hero.entityId)}
            disabled={generatingId === hero.entityId}
          >
            <Sparkles size={14} /> {t('character.overview.ranking.createHero')}
          </button>
        )}
      </div>

      <div className="ca-ov-rank-list">
        {shown.map((c, i) => {
          const [fill, stroke] = getFactionColor(c.factionIndex);
          return (
            <div
              key={c.entityId}
              className="ca-ov-rank-row"
              role="button"
              tabIndex={0}
              onClick={() => onSelect(c.entityId)}
              onKeyDown={(e) => {
                if (e.key === 'Enter' || e.key === ' ') {
                  e.preventDefault();
                  onSelect(c.entityId);
                }
              }}
            >
              <span className="ca-ov-rank-n">{i + 2}</span>
              <span
                className="ca-ov-rank-dot"
                style={{ background: c.factionIndex == null ? 'transparent' : fill, borderColor: stroke }}
              />
              <span className={'ca-ov-rank-name' + (c.analyzed ? '' : ' muted')}>{c.name}</span>
              {c.analyzed && <span className="ca-item-dot" />}
              <div className="ca-ov-rank-bar-track">
                <div
                  className={'ca-ov-rank-bar-fill' + (c.analyzed ? '' : ' muted')}
                  style={{ width: `${(c.mentionCount / maxMentions) * 100}%` }}
                />
              </div>
              <span className="ca-ov-rank-count">{c.mentionCount}</span>
              {!c.analyzed && (
                <button
                  type="button"
                  className="ca-item-mini-btn"
                  onClick={(e) => {
                    e.stopPropagation();
                    onGenerate(c.entityId);
                  }}
                  disabled={generatingId === c.entityId}
                >
                  {generatingId === c.entityId ? '…' : t('generate')}
                </button>
              )}
            </div>
          );
        })}
      </div>

      {rest.length > DEFAULT_ROWS && (
        <button type="button" className="ca-btn ca-ov-expand-btn" onClick={() => setExpanded((v) => !v)}>
          {expanded ? <ChevronDown size={13} /> : <ChevronRight size={13} />}
          {expanded
            ? t('character.overview.ranking.collapse')
            : t('character.overview.ranking.expand', { count: rest.length - DEFAULT_ROWS })}
        </button>
      )}
    </div>
  );
}
