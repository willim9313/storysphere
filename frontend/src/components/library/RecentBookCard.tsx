import { Link } from 'react-router-dom';
import { useTranslation } from 'react-i18next';
import type { Book } from '@/api/types';

/**
 * 最近開啟 card (01 決議紀錄 C 區). The shortcut set follows `book.status` —
 * a recommended next step, not a fixed link row (§6). Every shortcut is
 * navigation, 觸發分析 included (it only opens the book page), so none carries
 * the LLM glyph (DS_V3_DESIGN_FEEDBACK 1-C).
 */
export function RecentBookCard({ book }: Readonly<{ book: Book }>) {
  const { t } = useTranslation('library');
  const base = `/books/${book.id}`;

  function statusShortcuts() {
    switch (book.status) {
      case 'analyzed':
        return [
          { label: t('shortcuts.continueReading'), to: base },
          { label: t('shortcuts.knowledgeGraph'), to: `${base}/graph` },
          { label: t('shortcuts.deepAnalysis'), to: `${base}/characters` },
        ];
      case 'ready':
        return [
          { label: t('shortcuts.startReading'), to: base },
          { label: t('shortcuts.triggerAnalysis'), to: base },
        ];
      case 'error':
        return [{ label: t('shortcuts.viewError'), to: '/upload' }];
    }
  }

  return (
    <div className="lib-recent-card">
      <div className="lib-recent-title">{book.title}</div>
      <div className="lib-recent-actions">
        {statusShortcuts().map(({ label, to }) => (
          <Link key={label} to={to} className="ss-btn ss-btn-sm ss-btn-secondary">
            {label}
          </Link>
        ))}
      </div>
    </div>
  );
}
