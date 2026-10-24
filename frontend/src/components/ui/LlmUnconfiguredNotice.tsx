import { Link } from 'react-router-dom';
import { useTranslation } from 'react-i18next';
import { LLM_SETTINGS_PATH } from '@/api/failureKind';

/**
 * In-place state for the app's own 503 "no LLM provider configured" (see
 * `isLlmUnconfigured`). It is a feature state, not a failure of the page: the
 * surrounding content stays, this small box sits where the LLM action's result
 * would have appeared and points to the LLM settings panel. No retry — nothing
 * changes until a provider is set up.
 */
export function LlmUnconfiguredNotice() {
  const { t } = useTranslation('common');
  return (
    <div className="ss-state ss-state-filtered" role="status">
      <span className="ss-state-title">{t('failure.llmUnconfigured')}</span>
      <Link to={LLM_SETTINGS_PATH} className="ss-btn ss-btn-md ss-btn-secondary">
        {t('failure.llmSettings')}
      </Link>
    </div>
  );
}
