import { useTranslation } from 'react-i18next';
import { ChevronRight } from 'lucide-react';
import type { CharacterAnalysisDetail } from '@/api/types';
import { useSourceJump } from '@/hooks/useSourceJump';
import { SourceJumpText } from '../SourceJumpText';
import { ConfidenceMeter } from '../ConfidenceMeter';
import { archetypeDisplayName, archetypeState } from '../characterModel';

type Framework = 'jung' | 'schmidt';

interface Props {
  data: CharacterAnalysisDetail;
  bookId: string;
  framework: Framework;
  onOpenCompare: () => void;
  /** 「未生成」走重生成（成功才覆蓋，失敗時舊結果仍在）。 */
  onRegenerate?: () => void;
  isRegenerating?: boolean;
  /** 「生成失敗」走重試失敗部分（沿用既有 CEP 快取、只重跑失敗段）。 */
  onRetryFailed?: () => void;
  isRetrying?: boolean;
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
  onRetryFailed,
  isRetrying,
}: Readonly<Props>) {
  const { t, i18n } = useTranslation('analysis');
  const { jump, pendingKey } = useSourceJump(bookId);
  const archetype = data.archetypes.find((a) => a.framework === framework);
  // #7a names are in the book's language; show them in the interface language.
  const primaryName = archetypeDisplayName(framework, archetype?.primary, i18n.language);
  const secondaryName = archetypeDisplayName(framework, archetype?.secondary, i18n.language);
  const pct = archetype ? Math.round(archetype.confidence * 100) : 0;
  // 「未生成」（還沒做）與「生成失敗」（做了但壞了）是兩件事，由 failedParts 決定。
  const state = archetypeState(data, framework);
  const placeholderName = t(
    state === 'failed' ? 'character.persona.archetypeFailed' : 'character.persona.archetypeNotGenerated',
  );
  const labelKey =
    framework === 'jung' ? 'character.persona.archetypeLabelJung' : 'character.persona.archetypeLabelSchmidt';
  const archetypeTitle = t(labelKey, { name: archetype ? primaryName : placeholderName });

  const traits = data.cep?.traits ?? [];

  return (
    <>
      {/* Profile summary */}
      <section className="ca-section">
        <header className="ca-section-head">
          <div>
            <h3 className="ca-section-title">{t('character.sections.profile')}</h3>
            <div className="ca-section-sub">{t('character.persona.profileSub')}</div>
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
          {archetype && (
            <button type="button" className="ca-persona-switch-link" onClick={onOpenCompare}>
              {t('character.compare.switchTo')} <ChevronRight size={11} />
            </button>
          )}
        </header>
        <div className="ca-section-body">
          {archetype ? (
            <>
              <div className="ca-persona-arc-rows">
                <div className="ca-persona-arc-field">
                  <span className="ca-persona-arc-field-label">{t('character.primaryArchetype')}</span>
                  <span className="ca-persona-arc-primary">{primaryName}</span>
                </div>
                {archetype.secondary && (
                  <div className="ca-persona-arc-field">
                    <span className="ca-persona-arc-field-label">{t('character.secondaryArchetype')}</span>
                    <span className="ca-persona-arc-secondary">{secondaryName}</span>
                  </div>
                )}
                <div className="ca-persona-arc-field">
                  <span className="ca-persona-arc-field-label">{t('character.confidence')}</span>
                  <ConfidenceMeter pct={pct} />
                </div>
                <span className="ca-persona-threshold">{t('character.persona.confidenceThreshold')}</span>
              </div>
              <div className="ca-evidence-block">
                <div className="ca-evidence-heading">{t('character.persona.evidenceHeading')}</div>
                <div className="ca-evidence-list">
                  {archetype.evidence.length === 0 ? (
                    <p>{t('character.noData')}</p>
                  ) : (
                    archetype.evidence.map((e, i) => {
                      const key = `evidence-${i}`;
                      return (
                        <div key={key} className="ca-evidence-item">
                          <span className="ca-evidence-num">{`[${i + 1}]`}</span>
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
              </div>
            </>
          ) : state === 'failed' ? (
            <div className="ca-archetype-state failed">
              <span className="ss-badge ss-badge-error">{t('character.persona.archetypeFailed')}</span>
              {onRetryFailed && (
                <button
                  type="button"
                  className="ss-btn ss-btn-sm ss-btn-secondary ss-btn-llm"
                  onClick={onRetryFailed}
                  disabled={isRetrying}
                >
                  {t('character.persona.retryFailed')}
                </button>
              )}
            </div>
          ) : (
            <div className="ca-archetype-state">
              <span className="ss-badge">{t('character.persona.archetypeNotGenerated')}</span>
              <p className="ca-archetype-missing">{t('character.archetypeMissing')}</p>
              {onRegenerate && (
                <button
                  type="button"
                  className="ss-btn ss-btn-sm ss-btn-secondary ss-btn-llm"
                  onClick={onRegenerate}
                  disabled={isRegenerating}
                >
                  {t('regenerate')}
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
            <div className="ca-section-sub">{t('character.persona.traitsCount', { count: traits.length })}</div>
          </div>
        </header>
        <div className="ca-section-body">
          {traits.length === 0 ? (
            <p>{t('character.noData')}</p>
          ) : (
            <div className="ca-trait-grid">
              {traits.map((tr) => {
                const [term, desc] = splitTrait(tr);
                return (
                  <div key={tr} className="ca-trait-card">
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
