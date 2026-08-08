import { Sparkles, AlertCircle, Info } from 'lucide-react';
import { useTranslation } from 'react-i18next';

import { interpretationAdvice, type SymbolSignals } from './symbolSignals';

interface Props {
  signals: SymbolSignals;
  /** Position in the ranked list, or null for an unranked tail word. */
  rank: number | null;
  onGenerate: () => void;
  pending: boolean;
  error?: string | null;
}

/**
 * Whether to spend tokens on this symbol, and why.
 *
 * One unconditional 「生成詮釋」 button treated every symbol as equally worth
 * interpreting, which is how a book ends up with an interpretation of a word that
 * occurs twice in its front matter. The three branches come from the same
 * `interpretationAdvice` the overview's recommendation cards use, so the map and
 * the detail view never disagree about whether a symbol is worth the money.
 */
export function InterpretationCta({
  signals,
  rank,
  onGenerate,
  pending,
  error,
}: Readonly<Props>) {
  const { t } = useTranslation('analysis');
  const advice = interpretationAdvice(signals);
  const strong = advice === 'recommended';
  const weak = advice === 'discouraged';
  const front = signals.distribution.front;

  const desc = t(`symbol.interpretation.cta.${advice}Desc`, {
    value: signals.load.toFixed(2),
    rank,
  });

  return (
    <section
      className={'sym-hero sym-hero-cta' + (strong ? ' is-strong' : '') + (weak ? ' is-weak' : '')}
    >
      <div className="sym-hero-cta-icon">{weak ? <Info size={20} /> : <Sparkles size={20} />}</div>
      <div>
        <h3 className="sym-hero-cta-title">{t(`symbol.interpretation.cta.${advice}Title`)}</h3>
        <p className="sym-hero-cta-desc">{desc}</p>
        {front > 0 && (
          // Said before the money is spent, not only after. The evidence sent to
          // the model includes these — see the note in InterpretationHero.
          <p className="sym-hero-cta-warn">
            <AlertCircle size={12} aria-hidden="true" />
            {t('symbol.interpretation.cta.frontWarn', { count: front })}
          </p>
        )}
        {error && (
          <div className="sym-hero-error" style={{ marginTop: 10 }}>
            <AlertCircle size={13} />
            {error}
          </div>
        )}
      </div>
      <button
        type="button"
        className={weak ? 'sym-btn-ghost-large' : 'sym-btn-primary'}
        onClick={onGenerate}
        // Discouraged, not forbidden: the reader may know something the signals
        // do not. It costs an extra confirmation rather than being unavailable.
        disabled={pending}
        title={weak ? t('symbol.interpretation.cta.weakTitle') : undefined}
      >
        <Sparkles size={13} /> {t(`symbol.interpretation.cta.${advice}Button`)}
      </button>
    </section>
  );
}
