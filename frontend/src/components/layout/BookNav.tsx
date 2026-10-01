import { Link, useLocation } from 'react-router-dom';
import { ArrowLeft } from 'lucide-react';
import { useTranslation } from 'react-i18next';
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
    </div>
  );
}
