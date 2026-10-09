import { X } from 'lucide-react';
import { useTranslation } from 'react-i18next';
import type { ArchetypeDetail, CharacterAnalysisDetail } from '@/api/types';
import { useEscapeKey } from '@/hooks/useEscapeKey';
import { ConfidenceMeter } from './ConfidenceMeter';
import { archetypeDisplayName } from './characterModel';

interface Props {
  open: boolean;
  data: CharacterAnalysisDetail | undefined;
  onClose: () => void;
}

export function FrameworkCompareDrawer({ open, data, onClose }: Props) {
  const { t } = useTranslation('analysis');

  useEscapeKey(open, onClose);

  if (!open || !data) return null;

  const jung = data.archetypes.find((a) => a.framework === 'jung');
  const schmidt = data.archetypes.find((a) => a.framework === 'schmidt');

  return (
    <>
      <div className="ca-compare-backdrop" onClick={onClose} />
      <aside className="ca-compare-drawer" role="dialog" aria-modal="true">
        <header className="ca-compare-head">
          <h3>{t('character.compare.title', { name: data.entityName })}</h3>
          <button type="button" className="ss-btn ss-btn-sm ss-btn-ghost" onClick={onClose}>
            <X size={14} /> {t('character.compare.close')}
          </button>
        </header>
        <div className="ca-compare-body">
          <CompareColumn title="Jung 12" archetype={jung} />
          <CompareColumn title="Schmidt 45" archetype={schmidt} />
        </div>
      </aside>
    </>
  );
}

function CompareColumn({
  title,
  archetype,
}: {
  title: string;
  archetype: ArchetypeDetail | undefined;
}) {
  const { t, i18n } = useTranslation('analysis');

  if (!archetype) {
    return (
      <div className="ca-compare-col">
        <div className="ca-compare-col-head">
          <h4>{title}</h4>
        </div>
        <p className="ca-compare-empty">{t('character.compare.notGenerated')}</p>
      </div>
    );
  }

  const pct = Math.round(archetype.confidence * 100);
  return (
    <div className="ca-compare-col">
      <div className="ca-compare-col-head">
        <h4>{title}</h4>
      </div>
      <div className="ca-compare-row">
        <span className="ca-compare-row-label">{t('character.primaryArchetype')}</span>
        <span className="ca-compare-primary">
          {archetypeDisplayName(archetype.framework, archetype.primary, i18n.language)}
        </span>
      </div>
      {archetype.secondary && (
        <div className="ca-compare-secondary">
          {t('character.compare.secondaryLabel', { name: archetypeDisplayName(archetype.framework, archetype.secondary, i18n.language) })}
        </div>
      )}
      {/* 信心度三件套在抽屜兩側都齊備：Ink 下長條會塌成單色，文字與數字是必要的冗餘。 */}
      <div className="ca-compare-row is-center">
        <span className="ca-compare-row-label">{t('character.confidence')}</span>
        <ConfidenceMeter pct={pct} />
      </div>
      <p className="ca-compare-evidence-label">{t('character.compare.evidenceLabel')}</p>
      <div className="ca-compare-evidence-list">
        {archetype.evidence.map((e, i) => (
          <div key={e} className="ca-compare-evidence-item">
            <span className="ca-evidence-num">{`[${i + 1}]`}</span>
            <span>{e}</span>
          </div>
        ))}
      </div>
    </div>
  );
}
