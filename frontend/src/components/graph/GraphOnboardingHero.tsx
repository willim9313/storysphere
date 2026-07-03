import type { CSSProperties } from 'react';
import { useTranslation } from 'react-i18next';
import { useNavigate } from 'react-router-dom';
import { Waypoints } from 'lucide-react';

/**
 * Empty-state guide shown when a book has no graph nodes yet. Unlike the
 * timeline (which has an in-page pipeline), the graph is an ingestion product,
 * so this is an explanatory card pointing back to upload rather than a stepper.
 */
export function GraphOnboardingHero() {
  const { t } = useTranslation('graph');
  const navigate = useNavigate();

  const card: CSSProperties = {
    maxWidth: 440,
    textAlign: 'center',
    background: 'var(--bg-primary)',
    border: '1px solid var(--border)',
    borderRadius: 'var(--radius-lg)',
    padding: '32px 36px',
    boxShadow: 'var(--shadow-sm)',
  };

  return (
    <div
      style={{
        width: '100%',
        height: '100%',
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'center',
        padding: 24,
        background: 'var(--bg-primary)',
      }}
    >
      <div style={card}>
        <div
          style={{
            width: 48,
            height: 48,
            borderRadius: '50%',
            background: 'var(--bg-secondary)',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            margin: '0 auto 16px',
            color: 'var(--accent)',
          }}
        >
          <Waypoints size={22} />
        </div>
        <div
          style={{
            fontSize: 'var(--font-size-2xs)',
            color: 'var(--fg-muted)',
            textTransform: 'uppercase',
            letterSpacing: '0.14em',
            marginBottom: 8,
          }}
        >
          {t('onboarding.eyebrow')}
        </div>
        <h3
          style={{
            fontFamily: 'var(--font-serif)',
            fontSize: 'var(--font-size-xl)',
            color: 'var(--fg-primary)',
            margin: '0 0 10px',
          }}
        >
          {t('onboarding.title')}
        </h3>
        <p
          style={{
            fontSize: 'var(--font-size-sm)',
            color: 'var(--fg-secondary)',
            lineHeight: 1.6,
            margin: '0 0 20px',
          }}
        >
          {t('onboarding.intro')}
        </p>
        <button
          type="button"
          onClick={() => navigate('/upload')}
          style={{
            padding: '8px 16px',
            borderRadius: 6,
            border: 'none',
            background: 'var(--accent)',
            color: 'white',
            fontFamily: 'var(--font-sans)',
            fontSize: 'var(--font-size-xs)',
            cursor: 'pointer',
          }}
        >
          {t('onboarding.cta')}
        </button>
      </div>
    </div>
  );
}
