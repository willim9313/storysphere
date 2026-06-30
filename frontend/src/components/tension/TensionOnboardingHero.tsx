import { useTranslation } from 'react-i18next';

export function TensionOnboardingHero() {
  const { t } = useTranslation('analysis');
  const layers: Array<{ n: string; key: 'teu' | 'line' | 'theme' }> = [
    { n: '01', key: 'teu' },
    { n: '02', key: 'line' },
    { n: '03', key: 'theme' },
  ];
  return (
    <div className="tn-hero tn-hero--onboarding">
      <div className="tn-hero-eyebrow">
        <span className="tn-hero-eyebrow-dot" />
        {t('tension.onboardingEyebrow')}
      </div>
      <p className="tn-hero-proposition tn-hero-proposition--empty">
        {t('tension.onboardingIntro')}
      </p>
      <div className="tn-hero-layers">
        {layers.map((l) => (
          <div key={l.n} className="tn-hero-layer">
            <div className="tn-hero-layer-num">{l.n}</div>
            <div className="tn-hero-layer-scope">{t(`tension.onboarding.${l.key}.scope`)}</div>
            <div className="tn-hero-layer-name">{t(`tension.onboarding.${l.key}.name`)}</div>
            <div className="tn-hero-layer-desc">{t(`tension.onboarding.${l.key}.desc`)}</div>
          </div>
        ))}
      </div>
    </div>
  );
}
