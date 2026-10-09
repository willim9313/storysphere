import { useTranslation } from 'react-i18next';
import { useNavigate } from 'react-router-dom';
import { Layers } from 'lucide-react';

/**
 * Empty-state guide shown when a book has no graph nodes yet. Unlike the
 * timeline (which has an in-page pipeline), the graph is an ingestion product,
 * so this is an explanatory card rather than a stepper. It points to 建構概覽,
 * where the knowledge-graph step is run — the book already exists, so sending
 * the reader back to upload was the wrong way.
 * The page renders no toolbar / lens / legend alongside it.
 */
export function GraphOnboardingHero({ bookId }: { readonly bookId: string }) {
  const { t } = useTranslation('graph');
  const navigate = useNavigate();

  return (
    <div className="kg-hero">
      <div className="kg-hero-card">
        <div className="kg-hero-eyebrow">{t('onboarding.eyebrow')}</div>
        <h3 className="kg-hero-title">{t('onboarding.title')}</h3>
        <p className="kg-hero-text">{t('onboarding.intro')}</p>
        <button
          type="button"
          onClick={() => navigate(`/books/${bookId}/unraveling`)}
          className="ss-btn ss-btn-md ss-btn-primary"
        >
          <Layers size={14} aria-hidden="true" />
          {t('onboarding.cta')}
        </button>
      </div>
    </div>
  );
}
