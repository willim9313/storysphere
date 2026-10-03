import { useMemo, useState } from 'react';
import { X } from 'lucide-react';
import { useTranslation } from 'react-i18next';
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
  onOpenBatchModal: (mode: 'top10' | 'all') => void;
  isBatchRunning: boolean;
  batchProgressLabel?: string;
  batchError?: string | null;
  onDismissBatchError?: () => void;
}

export function CharacterOverviewLanding({
  bookId,
  charData,
  onSelectEntity,
  onGenerate,
  generatingId,
  onOpenBatchModal,
  isBatchRunning,
  batchProgressLabel,
  batchError,
  onDismissBatchError,
}: Readonly<CharacterOverviewLandingProps>) {
  const { t } = useTranslation('analysis');
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

  return (
    <div className="ca-ov-landing">
      {batchError && (
        <div className="ca-inline-banner">
          <span>{batchError}</span>
          {onDismissBatchError && (
            <button type="button" className="ss-btn ss-btn-sm ss-btn-ghost" onClick={onDismissBatchError}>
              <X size={12} />
            </button>
          )}
        </div>
      )}
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
          {isBatchRunning && batchProgressLabel && (
            <span className="ca-ov-batch-progress">{batchProgressLabel}</span>
          )}
          {/* The two view buttons are mode switches (zero cost), so no LLM glyph. */}
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
          <button
            type="button"
            className="ss-btn ss-btn-sm ss-btn-secondary ss-btn-llm"
            onClick={() => onOpenBatchModal('top10')}
            disabled={isBatchRunning || unanalyzedCount === 0}
          >
            {t('character.overview.batchTop10')}
          </button>
          <button
            type="button"
            className="ss-btn ss-btn-sm ss-btn-primary ss-btn-llm"
            onClick={() => onOpenBatchModal('all')}
            disabled={isBatchRunning || unanalyzedCount === 0}
          >
            {t('character.overview.batchAll')}
          </button>
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
