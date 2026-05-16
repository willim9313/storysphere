import { useTranslation } from 'react-i18next';
import { GitCompare, RefreshCw } from 'lucide-react';
import type { CharacterAnalysisDetail } from '@/api/types';

type Framework = 'jung' | 'schmidt';

interface Props {
  data: CharacterAnalysisDetail;
  framework: Framework;
  onOpenCompare: () => void;
  onRegenerate?: () => void;
  isRegenerating?: boolean;
}

function confidenceLabel(pct: number, t: (k: string) => string): string {
  if (pct >= 80) return t('character.confidenceHigh');
  if (pct >= 50) return t('character.confidenceMid');
  return t('character.confidenceLow');
}

export function PersonaPane({
  data,
  framework,
  onOpenCompare,
  onRegenerate,
  isRegenerating,
}: Props) {
  const { t } = useTranslation('analysis');
  const archetype = data.archetypes.find((a) => a.framework === framework);
  const pct = archetype ? Math.round(archetype.confidence * 100) : 0;
  const archetypeTitle = archetype
    ? framework === 'jung'
      ? t('character.persona.archetypeLabelJung', { name: archetype.primary })
      : t('character.persona.archetypeLabelSchmidt', { name: archetype.primary })
    : framework === 'jung'
      ? t('character.persona.archetypeLabelJung', { name: t('character.persona.archetypeNotGenerated') })
      : t('character.persona.archetypeLabelSchmidt', { name: t('character.persona.archetypeNotGenerated') });

  const traits = data.cep?.traits ?? [];

  return (
    <>
      {/* Profile summary */}
      <section className="ca-section">
        <header className="ca-section-head">
          <div>
            <h3 className="ca-section-title">{t('character.sections.profile')}</h3>
            <div className="ca-section-sub" style={{ marginTop: 2 }}>
              {t('character.persona.profileSub')}
            </div>
          </div>
        </header>
        <div className="ca-section-body">
          <p>{data.profileSummary || t('character.noData')}</p>
        </div>
      </section>

      {/* Archetype */}
      <section className="ca-section">
        <header className="ca-section-head">
          <div>
            <h3 className="ca-section-title">{archetypeTitle}</h3>
            {archetype?.secondary && (
              <div className="ca-section-sub" style={{ marginTop: 2 }}>
                {t('character.persona.secondaryLabel' as never, { name: archetype.secondary, defaultValue: `次：${archetype.secondary}` })}
              </div>
            )}
          </div>
          {archetype && (
            <div style={{ display: 'flex', gap: 8, alignItems: 'center' }}>
              <span className="ca-title-badge">
                {t('character.confidence')} {confidenceLabel(pct, t)} · {pct}%
              </span>
              <button
                type="button"
                className="ca-btn ca-btn-ghost"
                onClick={onOpenCompare}
              >
                <GitCompare size={11} /> {t('compare.switchTo')}
              </button>
            </div>
          )}
        </header>
        <div className="ca-section-body">
          {archetype ? (
            <>
              <div style={{ display: 'flex', alignItems: 'center', gap: 12, marginBottom: 14 }}>
                <div className="ca-conf-track" style={{ flex: 1, maxWidth: 320 }}>
                  <div className="ca-conf-fill" style={{ width: `${pct}%` }} />
                </div>
                <span className="ca-conf-pct" style={{ minWidth: 36 }}>{pct}%</span>
              </div>
              <h4
                style={{
                  margin: '12px 0 6px',
                  fontFamily: 'var(--font-sans)',
                  fontSize: 10.5,
                  letterSpacing: '0.08em',
                  textTransform: 'uppercase',
                  color: 'var(--fg-muted)',
                  fontWeight: 600,
                }}
              >
                {t('character.persona.evidenceHeading')}
              </h4>
              <ul>
                {archetype.evidence.length === 0 ? (
                  <li>{t('character.noData')}</li>
                ) : (
                  archetype.evidence.map((e, i) => <li key={i}>{e}</li>)
                )}
              </ul>
            </>
          ) : (
            <div className="ca-inline-banner">
              <span>{t('character.archetypeMissing')}</span>
              {onRegenerate && (
                <button
                  type="button"
                  className="ca-btn"
                  onClick={onRegenerate}
                  disabled={isRegenerating}
                >
                  <RefreshCw size={11} /> {t('regenerate')}
                </button>
              )}
            </div>
          )}
        </div>
      </section>

      {/* Traits */}
      <section className="ca-section">
        <header className="ca-section-head">
          <div>
            <h3 className="ca-section-title">{t('character.sections.traits')}</h3>
            <div className="ca-section-sub" style={{ marginTop: 2 }}>
              {t('character.persona.traitsCount', { count: traits.length })}
            </div>
          </div>
        </header>
        <div className="ca-section-body">
          {traits.length === 0 ? (
            <p>{t('character.noData')}</p>
          ) : (
            <div className="ca-tag-grid">
              {traits.map((tr, i) => (
                <span key={i} className="ca-tag">{tr}</span>
              ))}
            </div>
          )}
        </div>
      </section>
    </>
  );
}
