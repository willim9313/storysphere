import { useState, type ReactNode } from 'react';
import { useTranslation } from 'react-i18next';
import { AlertTriangle, ChevronRight, Unplug } from 'lucide-react';
import type { FailureKind } from '@/api/failureKind';

interface PageFailureProps {
  /** `page`: the app answered with its own JSON error. `backend`: nothing (or
   *  only a bare proxy status) came back. Pick it with `failureKind(err)`. */
  variant: FailureKind;
  /** {頁名} in the settled copy「無法載入{頁名}」— the rail / breadcrumb name. */
  pageName: string;
  onRetry: () => void;
  /** Replaces the page-variant title, e.g. 章節審閱's「提交失敗，請稍後再試。」 */
  title?: string;
  /** A second way out next to 重試 (page variant only). */
  secondaryAction?: ReactNode;
  /** Shown under the collapsible 技術細節 row, mono. */
  techDetail?: string;
}

/**
 * The two settled failure states (PROJECT_RULES · 已定案的共用文案). The page
 * keeps its sidebar and title; only the content area is replaced. No automatic
 * retry is promised — 重試 is the only way back.
 */
export function PageFailure({
  variant,
  pageName,
  onRetry,
  title,
  secondaryAction,
  techDetail,
}: Readonly<PageFailureProps>) {
  const { t } = useTranslation('common');
  const [open, setOpen] = useState(false);
  const isPage = variant === 'page';

  return (
    <div className="ss-state ss-state-stage" role="alert">
      <span className={isPage ? 'ss-state-icon ss-state-icon-error' : 'ss-state-icon'}>
        {isPage ? <AlertTriangle size={26} /> : <Unplug size={26} />}
      </span>
      <h4 className="ss-state-title">
        {isPage ? (title ?? t('failure.pageTitle', { page: pageName })) : t('failure.backendTitle')}
      </h4>
      <p className="ss-state-text">{isPage ? t('failure.pageBody') : t('failure.backendBody')}</p>
      <div className="ss-state-actions">
        <button type="button" className="ss-btn ss-btn-md ss-btn-primary" onClick={onRetry}>
          {t('retry')}
        </button>
        {isPage && secondaryAction}
      </div>
      {techDetail && (
        <div className="ss-state-detail">
          <button
            type="button"
            className="ss-state-detail-toggle"
            aria-expanded={open}
            onClick={() => setOpen((o) => !o)}
          >
            <ChevronRight size={12} className={open ? 'ss-state-chev-open' : undefined} />
            {t('failure.techDetail')}
          </button>
          {open && <code className="ss-state-code">{techDetail}</code>}
        </div>
      )}
    </div>
  );
}
