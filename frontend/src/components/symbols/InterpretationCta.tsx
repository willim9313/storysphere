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
  const block = signals.block;
  const strong = advice === 'recommended';
  // Blocked shares the muted treatment with discouraged: neither is an action
  // the page is asking for. They differ in why, which the copy carries.
  const weak = advice === 'discouraged' || advice === 'blocked';
  const front = signals.distribution.front;

  let buttonTitle: string | undefined;
  // Not `blockedTitle` — that key is the card heading, via `${advice}Title`.
  if (block)buttonTitle = t('symbol.interpretation.cta.blockedHint');
  else if (weak) buttonTitle = t('symbol.interpretation.cta.weakTitle');

  let desc: string;
  if (block){
    // provider_empty has no label to quote — the provider said nothing about why.
    const key =
      block.reason === 'provider_blocked'
        ? 'symbol.interpretation.cta.blockedDesc'
        : 'symbol.interpretation.cta.blockedEmptyDesc';
    desc = t(key, { detail: block.detail });
  } else {
    desc = t(`symbol.interpretation.cta.${advice}Desc`, {
      value: signals.load.toFixed(2),
      rank,
    });
  }

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
        //
        // Blocked stays clickable for the same reason plus a concrete one: a
        // refusal is recorded against the provider that gave it, and the retry
        // is how a symbol recovers once a working fallback exists. Disabling it
        // would make the record permanent.
        disabled={pending}
        title={buttonTitle}
      >
        <Sparkles size={13} /> {t(`symbol.interpretation.cta.${advice}Button`)}
      </button>
    </section>
  );
}
