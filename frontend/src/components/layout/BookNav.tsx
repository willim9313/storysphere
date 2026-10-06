import { Link, useLocation } from 'react-router-dom';
import { ArrowLeft, Info } from 'lucide-react';
import { useTranslation } from 'react-i18next';
import { reopenGuidance, useReopenableSurfaces } from '@/components/ui/guidanceStore';
import { BOOK_VIEWS } from './bookViews';

interface BookNavProps {
  bookId: string;
  bookTitle: string;
}

/**
 * 28px book title bar (DS v3 · framework §4): `← 書庫 | 書名 › 目前功能`.
 * Navigation between the nine views lives in the rail's book group; this bar
 * only says where you are, so the top edge stays quiet.
 */
export function BookNav({ bookId, bookTitle }: BookNavProps) {
  const location = useLocation();
  const { t } = useTranslation('nav');
  const { t: tSettings } = useTranslation('settings');
  // Surfaces whose ribbon is on screen but dismissed — a page with two ribbons
  // (event overview / detail) only ever mounts one, so this is at most one.
  const reopenable = useReopenableSurfaces();
  const base = `/books/${bookId}`;
  const current = BOOK_VIEWS.find((v) => location.pathname === `${base}${v.path}`);

  return (
    <div className="ss-booknav">
      <Link to="/" className="ss-booknav-back">
        <ArrowLeft size={12} />
        {t('library')}
      </Link>
      <span className="ss-booknav-sep" aria-hidden="true">|</span>
      <span className="ss-booknav-title">{bookTitle}</span>
      {current && (
        <>
          <span className="ss-booknav-chev" aria-hidden="true">›</span>
          <span className="ss-booknav-view" aria-current="page">{t(current.labelKey)}</span>
        </>
      )}
      {reopenable.length > 0 && (
        <button
          type="button"
          className="gd-reopen"
          onClick={() => reopenGuidance(reopenable)}
        >
          <Info size={12} aria-hidden="true" />
          {tSettings('guidance.title')}
        </button>
      )}
    </div>
  );
}
