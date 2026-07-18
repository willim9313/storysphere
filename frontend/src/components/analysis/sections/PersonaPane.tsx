import { useTranslation } from 'react-i18next';
import { ChevronRight, RefreshCw } from 'lucide-react';
import type { CharacterAnalysisDetail } from '@/api/types';
import { useSourceJump } from '@/hooks/useSourceJump';
import { SourceJumpText } from '../SourceJumpText';

type Framework = 'jung' | 'schmidt';

interface Props {
  data: CharacterAnalysisDetail;
  bookId: string;
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

/** Splits a "term：description" trait string (canvas uses the fullwidth
 * colon; also accepts the halfwidth ":") into [term, description]. Falls
 * back to treating the whole string as the term when no colon is found. */
function splitTrait(raw: string): [string, string | null] {
  const idx = raw.includes('：') ? raw.indexOf('：') : raw.indexOf(':');
  if (idx <= 0 || idx >= raw.length - 1) return [raw, null];
  return [raw.slice(0, idx), raw.slice(idx + 1)];
}

export function PersonaPane({
  data,
  bookId,
  framework,
  onOpenCompare,
  onRegenerate,
  isRegenerating,
}: Props) {
  const { t } = useTranslation('analysis');
  const { jump, pendingKey } = useSourceJump(bookId);
  const archetype = data.archetypes.find((a) => a.framework === framework);
  const pct = archetype ? Math.round(archetype.confidence * 100) : 0;
  // Distinguish "generation failed (retryable)" from "not yet generated".
  const failed = (data.failedParts ?? []).includes(`archetype:${framework}`);
  const placeholderName = t(
    failed ? 'character.persona.archetypeFailed' : 'character.persona.archetypeNotGenerated',
  );
  const archetypeTitle = archetype
    ? framework === 'jung'
      ? t('character.persona.archetypeLabelJung', { name: archetype.primary })
      : t('character.persona.archetypeLabelSchmidt', { name: archetype.primary })
    : framework === 'jung'
      ? t('character.persona.archetypeLabelJung', { name: placeholderName })
      : t('character.persona.archetypeLabelSchmidt', { name: placeholderName });

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
          <p className="ca-persona-profile-text">{data.profileSummary || t('character.noData')}</p>
        </div>
      </section>

      {/* Archetype */}
      <section className="ca-section">
        <header className="ca-section-head">
          <h3 className="ca-section-title">{archetypeTitle}</h3>
        </header>
        <div className="ca-section-body">
          {archetype ? (
            <>
              <div className="ca-persona-arc-row">
                <div className="ca-persona-arc-field">
                  <span className="ca-persona-arc-field-label">
                    {t('character.primaryArchetype')}
                  </span>
                  <span className="ca-persona-arc-primary">{archetype.primary}</span>
                </div>
                {archetype.secondary && (
                  <div className="ca-persona-arc-field">
                    <span className="ca-persona-arc-field-label">
                      {t('character.secondaryArchetype')}
                    </span>
                    <span className="ca-persona-arc-secondary">{archetype.secondary}</span>
                  </div>
                )}
                <div className="ca-persona-arc-field ca-persona-arc-conf">
                  <span className="ca-persona-arc-field-label">{t('character.confidence')}</span>
                  <div className="ca-conf-track">
                    <div className="ca-conf-fill" style={{ width: `${pct}%` }} />
                  </div>
                  <span className="ca-conf-pct">
                    {confidenceLabel(pct, t)} · {pct}%
                  </span>
                </div>
                <button type="button" className="ca-persona-switch-link" onClick={onOpenCompare}>
                  {t('character.compare.switchTo')} <ChevronRight size={11} />
                </button>
              </div>
              <div className="ca-evidence-heading">{t('character.persona.evidenceHeading')}</div>
              <div className="ca-evidence-list">
                {archetype.evidence.length === 0 ? (
                  <p>{t('character.noData')}</p>
                ) : (
                  archetype.evidence.map((e, i) => {
                    const key = `evidence-${i}`;
                    return (
                      <div key={key} className="ca-evidence-item">
                        <span className="ca-evidence-num">{i + 1}</span>
                        <SourceJumpText
                          text={e}
                          pending={pendingKey === key}
                          onJump={() => void jump(key, e)}
                        />
                      </div>
                    );
                  })
                )}
              </div>
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
            <div className="ca-trait-grid">
              {traits.map((tr, i) => {
                const [term, desc] = splitTrait(tr);
                return (
                  <div key={i} className="ca-trait-card">
                    <div className="ca-trait-term">{term}</div>
                    {desc && <div className="ca-trait-desc">{desc}</div>}
                  </div>
                );
              })}
            </div>
          )}
        </div>
      </section>
    </>
  );
}
