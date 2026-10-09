import { useMemo, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { useNavigate } from 'react-router-dom';
import { Users } from 'lucide-react';
import { EmptyState } from '@/components/ui/EmptyState';
import type { AnalysisListResponse } from '@/api/types';
import { useFactions } from '@/hooks/useFactions';
import { useCharacterMetrics } from '@/hooks/useCharacterMetrics';
import { rankFactions } from '../characterModel';
import { QuadrantView } from './QuadrantView';
import { RankingView } from './RankingView';
import { applyFactionsAndMetrics, buildOverviewCharacters } from './types';

type LandingView = 'quadrant' | 'ranking';

interface CharacterOverviewLandingProps {
  bookId: string;
  charData: AnalysisListResponse;
  onSelectEntity: (id: string) => void;
  onGenerate: (id: string) => void;
  generatingId: string | null;
}

export function CharacterOverviewLanding({
  bookId,
  charData,
  onSelectEntity,
  onGenerate,
  generatingId,
}: Readonly<CharacterOverviewLandingProps>) {
  const { t } = useTranslation('analysis');
  const navigate = useNavigate();
  const [view, setView] = useState<LandingView>('quadrant');

  const { data: factions } = useFactions(bookId);
  const { data: metrics, isLoading: metricsLoading } = useCharacterMetrics(bookId);

  const characters = useMemo(() => {
    const base = buildOverviewCharacters(charData);
    return applyFactionsAndMetrics(base, factions, metrics);
  }, [charData, factions, metrics]);

  // 派系依人數排名配色（最多 5 色，第 6 名起併入「其他」）。象限泡泡、圖例與排行點共用。
  const rankedFactions = useMemo(() => rankFactions(factions?.factions ?? []), [factions]);

  const analyzedCount = charData.analyzed.length;
  const unanalyzedCount = charData.unanalyzed.length;
  const totalCount = analyzedCount + unanalyzedCount;

  // No characters at all is not "metrics unavailable": the cast comes from the
  // knowledge-graph extraction, so point at the build step instead of drawing
  // an empty chart and an empty ranking.
  if (totalCount === 0) {
    return (
      <EmptyState
        weight="prerequisite"
        icon={<Users size={26} aria-hidden="true" />}
        title={t('character.overview.empty.title')}
        description={t('character.overview.empty.description')}
        action={
          <button
            type="button"
            className="ss-btn ss-btn-md ss-btn-primary"
            onClick={() => navigate(`/books/${bookId}/unraveling`)}
          >
            {t('graph:onboarding.cta')}
          </button>
        }
      />
    );
  }

  return (
    <div className="ca-ov-landing">
      <div className="ca-ov-head">
        <div className="ca-ov-head-main">
          <h1 className="ca-ov-title">{t('character.overview.title')}</h1>
          <div className="ca-ov-meta">
            <span>
              <strong>{totalCount}</strong> {t('character.overview.metaTotal')}
            </span>
            <span className="ca-ov-meta-item">
              <span className="ca-item-dot" /> {t('character.overview.metaAnalyzed')} {analyzedCount}
            </span>
            <span className="ca-ov-meta-item">
              <span className="ca-item-dot empty" /> {t('character.overview.metaUnanalyzed')} {unanalyzedCount}
            </span>
          </div>
        </div>
        <div className="ca-ov-head-actions">
          {/* The batch buttons moved to the left-column panel (09·10); only the
              view switch is left, and it is a zero-cost mode switch (no LLM glyph). */}
          <div className="ss-seg">
            <button
              type="button"
              className={'ss-seg-item' + (view === 'quadrant' ? ' active' : '')}
              onClick={() => setView('quadrant')}
            >
              {t('character.overview.viewQuadrant')}
            </button>
            <button
              type="button"
              className={'ss-seg-item' + (view === 'ranking' ? ' active' : '')}
              onClick={() => setView('ranking')}
            >
              {t('character.overview.viewRanking')}
            </button>
          </div>
        </div>
      </div>

      {view === 'quadrant' ? (
        <QuadrantView
          characters={characters}
          factions={factions}
          rankedFactions={rankedFactions}
          metricsLoading={metricsLoading}
          onSelect={onSelectEntity}
        />
      ) : (
        <RankingView
          characters={characters}
          rankedFactions={rankedFactions}
          onSelect={onSelectEntity}
          onGenerate={onGenerate}
          generatingId={generatingId}
        />
      )}
    </div>
  );
}
