import { Sparkles, AlertCircle } from 'lucide-react';
import { useTranslation } from 'react-i18next';

interface Props {
  onGenerate: () => void;
  pending: boolean;
  error?: string | null;
}

export function InterpretationCta({ onGenerate, pending, error }: Props) {
  const { t } = useTranslation('analysis');
  return (
    <section className="sym-hero sym-hero-cta">
      <div className="sym-hero-cta-icon">
        <Sparkles size={20} />
      </div>
      <div>
        <h3 className="sym-hero-cta-title">{t('symbol.interpretation.ctaTitle')}</h3>
        <p className="sym-hero-cta-desc">{t('symbol.interpretation.ctaDesc')}</p>
        {error && (
          <div className="sym-hero-error" style={{ marginTop: 10 }}>
            <AlertCircle size={13} />
            {error}
          </div>
        )}
      </div>
      <button type="button" className="sym-btn-primary" onClick={onGenerate} disabled={pending}>
        <Sparkles size={13} /> {t('symbol.interpretation.ctaButton')}
      </button>
    </section>
  );
}
