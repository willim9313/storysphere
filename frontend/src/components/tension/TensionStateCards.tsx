import { useTranslation } from 'react-i18next';
import { Sparkles } from 'lucide-react';
import heroImage from '@/assets/splash/reading-hero.png';

/** "會呼叫 LLM、消耗 token" — stated wherever an action spends money. */
function TokenHint({ text }: { text: string }) {
  return (
    <span className="tn-token-hint">
      <Sparkles size={12} />
      {text}
    </span>
  );
}

export function TensionEmptyCard({ onStart }: { onStart: () => void }) {
  const { t } = useTranslation('analysis');
  return (
    <div className="tn-state-empty">
      <img src={heroImage} alt="" className="tn-state-hero" />
      <div className="tn-state-empty-title">{t('tension.state.emptyTitle')}</div>
      <p className="tn-state-empty-body">{t('tension.state.emptyBody')}</p>
      {/* One button only. The design also offered "一鍵生成全部", which would
          run all three steps without stopping at either review gate — exactly
          the path that produces a theme built from unreviewed lines. */}
      <button type="button" className="tn-state-cta" onClick={onStart}>
        <Sparkles size={14} />
        {t('tension.state.startStep1')}
      </button>
      <TokenHint text={t('tension.state.tokenHintLong')} />
    </div>
  );
}

export function TensionStep1Card({
  teuCount,
  chapterCounts,
  onGroup,
}: {
  teuCount: number;
  /** [chapter, count] in chapter order. */
  chapterCounts: [number, number][];
  onGroup: () => void;
}) {
  const { t } = useTranslation('analysis');
  return (
    <div className="tn-state-card">
      <div className="tn-state-title">{t('tension.state.step1Title', { count: teuCount })}</div>
      <div
        className="tn-density"
        style={{ gridTemplateColumns: `repeat(${Math.max(chapterCounts.length, 1)}, 1fr)` }}
      >
        {chapterCounts.map(([chapter, count]) => (
          <div key={chapter} className="tn-density-col">
            <i style={{ height: `${8 + count * 7}px` }} />
            <span>{t('tension.state.chapterShort', { n: chapter })}</span>
          </div>
        ))}
      </div>
      <p className="tn-state-body">{t('tension.state.step1Body')}</p>
      <div className="tn-state-actions">
        <button type="button" className="tn-state-cta sm" onClick={onGroup}>
          <Sparkles size={14} />
          {t('tension.state.runStep2')}
        </button>
        <TokenHint text={t('tension.state.tokenHintShort')} />
      </div>
    </div>
  );
}

export function TensionRunningCard({
  title,
  progress,
  stage,
}: {
  title: string;
  progress: number;
  stage: string | null;
}) {
  const { t } = useTranslation('analysis');
  return (
    <div className="tn-state-card">
      <div className="tn-state-row">
        <span className="tn-state-title sm">{title}</span>
        <span className="tn-state-pct">{Math.round(progress)}%</span>
      </div>
      <div className="tn-state-bar">
        <i style={{ width: `${progress}%` }} />
      </div>
      {stage && <div className="tn-state-stage">{stage}</div>}
      <TokenHint text={t('tension.state.runningHint')} />
    </div>
  );
}

export function TensionErrorCard({
  title,
  message,
  retryLabel,
  onRetry,
  meta,
}: {
  title: string;
  message: string;
  retryLabel: string;
  onRetry: () => void;
  meta?: string | null;
}) {
  return (
    <div className="tn-state-card error">
      <div className="tn-state-title sm error">{title}</div>
      <p className="tn-state-body">{message}</p>
      <div className="tn-state-actions">
        <button type="button" className="tn-state-cta sm" onClick={onRetry}>
          <Sparkles size={13} />
          {retryLabel}
        </button>
        {meta && <span className="tn-state-meta">{meta}</span>}
      </div>
    </div>
  );
}
