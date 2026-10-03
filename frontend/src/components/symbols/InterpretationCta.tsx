import { AlertCircle, AlertTriangle } from 'lucide-react';
import { useTranslation } from 'react-i18next';

import { interpretationAdvice, type SymbolSignals } from './symbolSignals';

interface Props {
  signals: SymbolSignals;
  /** Position in the ranked list, or null for an unranked tail word. */
  rank: number | null;
  onGenerate: () => void;
  pending: boolean;
  /** A run that started and then failed, in the task's own words. */
  error?: string | null;
}

/**
 * Whether to spend tokens on this symbol, and why.
 *
 * One unconditional 「生成詮釋」 button treated every symbol as equally worth
 * interpreting, which is how a book ends up with an interpretation of a word that
 * occurs twice in its front matter. The four branches come from the same
 * `interpretationAdvice` the overview's recommendation cards use, so the map and
 * the detail view never disagree about whether a symbol is worth the money.
 *
 * The four tiers share one frame and one button size; they differ only in the
 * button variant and the sentence beside it (DS v3 · 11 F). Tier is never carried
 * by the size of the box — a small frame for 「證據不足」 would read as broken. The
 * only icon is the warning on the provider-refusal tier, and the LLM glyph lives
 * on the button alone.
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
  const refused = advice === 'blocked';
  // 與 InterpretationHero 同源：後端實際排除的筆數（B-101）。
  const front = signals.item.excluded_front_matter_count ?? 0;

  let desc: string;
  if (block) {
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

  // The caveat under the sentence. Discouraged, not forbidden: the reader may know
  // something the signals do not, so the button stays — it costs a caveat, not an
  // extra confirmation. A refusal stays clickable too: it is recorded against the
  // provider that gave it, and the retry is how a symbol recovers once a working
  // fallback exists. Disabling it would make the record permanent.
  let note: string | null = null;
  if (block) note = t('symbol.interpretation.cta.blockedHint');
  else if (advice === 'discouraged') note = t('symbol.interpretation.cta.weakTitle');

  return (
    <section className={'sym-cta' + (refused ? ' is-error' : '')}>
      <div className="sym-cta-text">
        <h3 className="sym-cta-title">
          {refused && <AlertTriangle size={16} aria-hidden="true" className="sym-cta-icon" />}
          {t(`symbol.interpretation.cta.${advice}Title`)}
        </h3>
        <p className="sym-cta-desc">{desc}</p>
        {front > 0 && (
          // Said before the money is spent, not only after. The evidence sent to
          // the model includes these — see the note in InterpretationHero.
          <p className="sym-hero-cta-warn">
            <AlertCircle size={12} aria-hidden="true" />
            {t('symbol.interpretation.cta.frontWarn', { count: front })}
          </p>
        )}
        {note && <span className="sym-cta-note">{note}</span>}
        {/* The refusal is the generation's, not the page's: signals, heatmap and
            triage are computed for free and never go through the provider. */}
        {refused && <span className="sym-cta-note">{t('symbol.error.blockedInline')}</span>}
        {error && (
          <div className="sym-hero-error">
            <AlertCircle size={13} />
            {error}
          </div>
        )}
      </div>
      <button
        type="button"
        className={
          'ss-btn ss-btn-md ss-btn-llm ' +
          (advice === 'recommended' ? 'ss-btn-primary' : 'ss-btn-secondary')
        }
        onClick={onGenerate}
        disabled={pending}
      >
        {t(`symbol.interpretation.cta.${advice}Button`)}
      </button>
    </section>
  );
}
