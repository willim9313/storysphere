import { useEffect } from 'react';
import { X } from 'lucide-react';
import { useTranslation } from 'react-i18next';
import type { ArchetypeDetail, CharacterAnalysisDetail } from '@/api/types';

interface Props {
  open: boolean;
  data: CharacterAnalysisDetail | undefined;
  onClose: () => void;
}

export function FrameworkCompareDrawer({ open, data, onClose }: Props) {
  const { t } = useTranslation('analysis');

  useEffect(() => {
    if (!open) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') onClose();
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [open, onClose]);

  if (!open || !data) return null;

  const jung = data.archetypes.find((a) => a.framework === 'jung');
  const schmidt = data.archetypes.find((a) => a.framework === 'schmidt');

  return (
    <>
      <div className="ca-compare-backdrop" onClick={onClose} />
      <aside className="ca-compare-drawer" role="dialog" aria-modal="true">
        <header className="ca-compare-head">
          <h3>{t('character.compare.title', { name: data.entityName })}</h3>
          <button className="ca-btn ca-btn-ghost" onClick={onClose}>
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
  const { t } = useTranslation('analysis');

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
      <div className="ca-compare-primary">{archetype.primary}</div>
      {archetype.secondary && (
        <div className="ca-compare-secondary">
          {t('character.compare.secondaryLabel', { name: archetype.secondary })}
        </div>
      )}
      <div className="ca-compare-conf-row">
        <div className="ca-conf-track">
          <div className="ca-conf-fill" style={{ width: `${pct}%` }} />
        </div>
        <span className="ca-compare-conf-pct">{t('character.compare.confidencePct', { pct })}</span>
      </div>
      <p className="ca-compare-evidence-label">{t('character.compare.evidenceLabel')}</p>
      <div className="ca-compare-evidence-list">
        {archetype.evidence.map((e, i) => (
          <div key={i} className="ca-compare-evidence-item">
            {e}
          </div>
        ))}
      </div>
    </div>
  );
}
