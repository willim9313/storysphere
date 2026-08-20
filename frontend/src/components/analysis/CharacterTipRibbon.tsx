import { useState } from 'react';
import { X } from 'lucide-react';
import { useTranslation, Trans } from 'react-i18next';

const STORAGE_KEY = 'storysphere:tip-dismissed:character-analysis';

export function CharacterTipRibbon() {
  const { t } = useTranslation('analysis');
  const [dismissed, setDismissed] = useState(
    () => typeof window !== 'undefined' && localStorage.getItem(STORAGE_KEY) === '1',
  );

  if (dismissed) return null;

  const handleDismiss = () => {
    // Safari private browsing reports a zero quota, so setItem throws. The
    // dismissal is a nicety; losing it must not take the component down.
    try {
      localStorage.setItem(STORAGE_KEY, '1');
    } catch {
      /* ignore quota / disabled storage */
    }
    setDismissed(true);
  };

  return (
    <div className="ca-tip">
      <div className="ca-tip-icon">i</div>
      <div className="ca-tip-body">
        <strong>{t('character.tip.prefix')}</strong>{' '}
        <Trans
          i18nKey="character.tip.body"
          ns="analysis"
          components={{ strong: <strong /> }}
        />
      </div>
      <button className="ca-tip-close" onClick={handleDismiss} aria-label="dismiss">
        <X size={14} />
      </button>
    </div>
  );
}
