import { useMemo, useState } from 'react';
import { Sparkles, Target, BarChart3, X } from 'lucide-react';
import { useTranslation } from 'react-i18next';
import type { AnalysisListResponse } from '@/api/types';
import { useFactions } from '@/hooks/useFactions';
import { useCharacterMetrics } from '@/hooks/useCharacterMetrics';
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
}: CharacterOverviewLandingProps) {
  const { t } = useTranslation('analysis');
  const [view, setView] = useState<LandingView>('quadrant');

  const { data: factions } = useFactions(bookId);
  const { data: metrics } = useCharacterMetrics(bookId);

  const characters = useMemo(() => {
    const base = buildOverviewCharacters(charData);
    return applyFactionsAndMetrics(base, factions, metrics);
  }, [charData, factions, metrics]);

  const analyzedCount = charData.analyzed.length;
  const unanalyzedCount = charData.unanalyzed.length;
  const totalCount = analyzedCount + unanalyzedCount;

  return (
    <div className="ca-ov-landing">
      {batchError && (
        <div className="ca-inline-banner">
          <span>{batchError}</span>
          {onDismissBatchError && (
            <button type="button" className="ca-btn ca-btn-ghost" onClick={onDismissBatchError}>
              <X size={12} />
            </button>
          )}
        </div>
      )}
      <div className="ca-ov-head">
        <div>
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
          <button
            type="button"
            className="ca-btn"
            onClick={() => onOpenBatchModal('top10')}
            disabled={isBatchRunning || unanalyzedCount === 0}
          >
            <Sparkles size={14} /> {t('character.overview.batchTop10')}
          </button>
          <button
            type="button"
            className="ca-btn ca-btn-primary"
            onClick={() => onOpenBatchModal('all')}
            disabled={isBatchRunning || unanalyzedCount === 0}
          >
            {t('character.overview.batchAll')}
          </button>
        </div>
      </div>

      <div className="ca-ov-toggle-row">
        <div className="ca-ov-toggle">
          <button
            type="button"
            className={'ca-ov-toggle-btn' + (view === 'quadrant' ? ' active' : '')}
            onClick={() => setView('quadrant')}
          >
            <Target size={14} /> {t('character.overview.viewQuadrant')}
          </button>
          <button
            type="button"
            className={'ca-ov-toggle-btn' + (view === 'ranking' ? ' active' : '')}
            onClick={() => setView('ranking')}
          >
            <BarChart3 size={14} /> {t('character.overview.viewRanking')}
          </button>
        </div>
        <span className="ca-ov-toggle-caption">
          {view === 'quadrant'
            ? t('character.overview.quadrantCaption')
            : t('character.overview.rankingCaption')}
        </span>
      </div>

      {view === 'quadrant' ? (
        <QuadrantView characters={characters} factions={factions} onSelect={onSelectEntity} />
      ) : (
        <RankingView
          characters={characters}
          onSelect={onSelectEntity}
          onGenerate={onGenerate}
          generatingId={generatingId}
        />
      )}
    </div>
  );
}
