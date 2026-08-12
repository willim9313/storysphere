// Unclassified events — what is missing, why it matters, and what can be done.
//
// Deliberately diverges from the design canvas, which made this block read-only
// on the grounds that judging an event needs its source passages. Reclassifying
// from the EEP cache needs no passages at all, and refinement is a per-event LLM
// call — both belong where the consequence is visible, which is here.
import { useTranslation } from 'react-i18next';
import { Link } from 'react-router-dom';
import { RefreshCw, Sparkles } from 'lucide-react';

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
}: UnclassifiedBlockProps) {
  const { t } = useTranslation('analysis');
  if (count === 0) return null;
  const busy = classifyRunning || refineRunning;

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
      {error && <div className="nl-unclass-error">{error}</div>}
      <div className="nl-unclass-actions">
        <button type="button" className="nl-jump-btn" onClick={onClassify} disabled={busy}>
          <RefreshCw size={13} />
          {classifyRunning ? t('narrative.unclassified.running', { progress }) : t('narrative.unclassified.classify')}
        </button>
        <button type="button" className="nl-jump-btn" onClick={onRefine} disabled={busy}>
          <Sparkles size={13} />
          {refineRunning ? t('narrative.unclassified.running', { progress }) : t('narrative.unclassified.refine', { n: count })}
        </button>
        <Link className="nl-unclass-jump" to={`/books/${bookId}/events`}>
          {t('narrative.unclassified.jump')}
        </Link>
      </div>
    </div>
  );
}
