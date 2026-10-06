// Unclassified events — what is missing, why it matters, and what can be done.
//
// Deliberately diverges from the older design canvas, which made this block
// read-only. Reclassifying from the EEP cache needs no passages at all, and
// refinement is a per-event LLM call — both belong where the consequence is
// visible, which is here.
//
// The two buttons sit on different axes: reclassify writes data (confirm dialog,
// no glyph, no danger colour — it costs nothing and is re-runnable); refine
// spends tokens (glyph + confirm dialog). A 409 has exactly one way out — the
// event analysis page — and deliberately no "run anyway".
import { useTranslation } from 'react-i18next';
import { Link } from 'react-router-dom';
import { LlmUnconfiguredNotice } from '@/components/ui/LlmUnconfiguredNotice';

interface UnclassifiedBlockProps {
  count: number;
  eepDone: number;
  eepTotal: number;
  bookId: string;
  onClassify: () => void;
  onRefine: () => void;
  classifyRunning: boolean;
  refineRunning: boolean;
  progress: number;
  error: string | null;
  /** The server refused with 409; the localized reason, counts included. */
  refusedMessage: string | null;
  /** The refine trigger was answered with the app's own 503 (no LLM provider). */
  llmBlocked: boolean;
}

export function UnclassifiedBlock({
  count,
  eepDone,
  eepTotal,
  bookId,
  onClassify,
  onRefine,
  classifyRunning,
  refineRunning,
  progress,
  error,
  refusedMessage,
  llmBlocked,
}: Readonly<UnclassifiedBlockProps>) {
  const { t } = useTranslation('analysis');
  if (count === 0) return null;
  const busy = classifyRunning || refineRunning;
  const eventsPath = `/books/${bookId}/events`;

  const facts = [
    { k: t('narrative.unclassified.whyLabel'), v: t('narrative.unclassified.whyBody', { done: eepDone, total: eepTotal }) },
    { k: t('narrative.unclassified.affectLabel'), v: t('narrative.unclassified.affectBody') },
    { k: t('narrative.unclassified.doLabel'), v: t('narrative.unclassified.doBody') },
  ];

  return (
    <div className="nl-unclass">
      <div className="nl-unclass-head">
        <span className="nl-unclass-n">{count}</span>
        <span className="nl-unclass-title">{t('narrative.unclassified.title')}</span>
      </div>
      <div className="nl-unclass-facts">
        {facts.map((f) => (
          <div key={f.k} className="nl-unclass-fact">
            <div className="nl-unclass-fact-k">{f.k}</div>
            <div className="nl-unclass-fact-v">{f.v}</div>
          </div>
        ))}
      </div>
      {refusedMessage && (
        <div className="nl-unclass-error" role="alert">
          <span>{refusedMessage}</span>
          <Link className="nl-unclass-jump" to={eventsPath}>
            {t('narrative.unclassified.jump')}
          </Link>
        </div>
      )}
      {!refusedMessage && error && (
        <div className="nl-unclass-error" role="alert">
          {error}
        </div>
      )}
      {llmBlocked && <LlmUnconfiguredNotice />}
      <div className="nl-unclass-actions">
        <button type="button" className="ss-btn ss-btn-md ss-btn-secondary" onClick={onClassify} disabled={busy}>
          {classifyRunning ? t('narrative.unclassified.running', { progress }) : t('narrative.unclassified.classify')}
        </button>
        <span className="nl-unclass-hint">{t('narrative.unclassified.classifyCost')}</span>
        <button type="button" className="ss-btn ss-btn-md ss-btn-secondary ss-btn-llm" onClick={onRefine} disabled={busy}>
          {refineRunning ? t('narrative.unclassified.running', { progress }) : t('narrative.unclassified.refine', { n: count })}
        </button>
        <span className="nl-unclass-hint">{t('tension.state.tokenHintShort')}</span>
        {!refusedMessage && (
          <Link className="nl-unclass-jump" to={eventsPath}>
            {t('narrative.unclassified.jump')}
          </Link>
        )}
      </div>
    </div>
  );
}
