import { useTranslation } from 'react-i18next';
import type { BookStatus } from '@/api/types';

const statusStyle: Record<BookStatus, { bg: string; fg: string }> = {
  analyzed: { bg: '#dcfce7', fg: '#166534' },
  ready: { bg: '#dbeafe', fg: '#1e40af' },
  processing: { bg: '#fef9c3', fg: '#854d0e' },
  error: { bg: '#fee2e2', fg: '#991b1b' },
};

export function StatusBadge({ status }: { status: BookStatus }) {
  const { t } = useTranslation('common');
  const style = statusStyle[status];
  return (
    <span
      className="inline-flex items-center text-xs px-1.5 py-0.5 rounded-full font-medium"
      style={{ backgroundColor: style.bg, color: style.fg }}
    >
      {t(`status.${status}`)}
    </span>
  );
}
