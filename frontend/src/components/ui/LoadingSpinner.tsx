import { Loader } from 'lucide-react';
import { useTranslation } from 'react-i18next';

/** 共用載入態（loading-states 規格卡）：Lucide Loader 1s linear＋說明字。
 *  預設說明字「載入中」；後端回報階段名稱時傳 `label` 取代（不並列）。 */
export function LoadingSpinner({ className = '', label }: { className?: string; label?: string }) {
  const { t } = useTranslation('common');
  return (
    <div className={`ss-spinner ${className}`} role="status">
      <Loader className="ss-spinner-icon" size={22} strokeWidth={1.5} aria-hidden="true" />
      <span className="ss-spinner-label">{label ?? t('loadingCaption')}</span>
    </div>
  );
}
