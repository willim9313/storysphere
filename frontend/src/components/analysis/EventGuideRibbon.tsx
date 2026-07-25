import { useState } from 'react';
import { X } from 'lucide-react';
import { Trans, useTranslation } from 'react-i18next';

/** Dismissal is remembered per surface, like CharacterTipRibbon — the overview
 *  and the detail page explain different things, so closing one should not
 *  hide the other. */
type Surface = 'overview' | 'detail';

const STORAGE_KEY: Record<Surface, string> = {
  overview: 'storysphere:tip-dismissed:event-overview',
  detail: 'storysphere:tip-dismissed:event-detail',
};

export function EventGuideRibbon({ surface }: Readonly<{ surface: Surface }>) {
  const { t } = useTranslation('analysis');
  const key = STORAGE_KEY[surface];
  const [dismissed, setDismissed] = useState(
    () => typeof window !== 'undefined' && localStorage.getItem(key) === '1',
  );

  if (dismissed) return null;

  const handleDismiss = () => {
    localStorage.setItem(key, '1');
    setDismissed(true);
  };

  return (
    <div className="ea-guide">
      <div className="ea-guide-body">
        <strong>{t('event.guide.prefix')}</strong>{' '}
        <Trans
          i18nKey={`event.guide.${surface}`}
          ns="analysis"
          components={{ strong: <strong /> }}
        />
      </div>
      <button
        type="button"
        className="ea-guide-close"
        onClick={handleDismiss}
        aria-label={t('event.guide.dismiss')}
      >
        <X size={14} />
      </button>
    </div>
  );
}
