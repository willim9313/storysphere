import { useTranslation } from 'react-i18next';
import { useNavigate } from 'react-router-dom';

/**
 * Empty-state guide shown when a book has no timeline events yet. Mirrors the
 * tension page's onboarding hero: explains the pipeline (event extraction →
 * chronology → Genette) and points to the event-analysis page to get started.
 */
export function TimelineOnboardingHero({ bookId }: { readonly bookId: string }) {
  const { t } = useTranslation('analysis');
  const navigate = useNavigate();

  const steps: Array<{ n: string; key: 'events' | 'chrono' | 'genette' }> = [
    { n: '01', key: 'events' },
    { n: '02', key: 'chrono' },
    { n: '03', key: 'genette' },
  ];

  return (
    <div className="tl-hero">
      <div className="tl-hero-eyebrow">
        <span className="tl-hero-eyebrow-dot" />
        {t('timeline.onboarding.eyebrow')}
      </div>
      <p className="tl-hero-intro">{t('timeline.onboarding.intro')}</p>
      <div className="tl-hero-steps">
        {steps.map((s) => (
          <div key={s.n} className="tl-hero-step">
            <div className="tl-hero-step-num">{s.n}</div>
            <div className="tl-hero-step-scope">{t(`timeline.onboarding.${s.key}.scope`)}</div>
            <div className="tl-hero-step-name">{t(`timeline.onboarding.${s.key}.name`)}</div>
            <div className="tl-hero-step-desc">{t(`timeline.onboarding.${s.key}.desc`)}</div>
          </div>
        ))}
      </div>
      <button
        type="button"
        className="tl-btn tl-hero-cta"
        onClick={() => navigate(`/books/${bookId}/events`)}
      >
        {t('timeline.onboarding.cta')}
      </button>
    </div>
  );
}
