import { useTranslation } from 'react-i18next';
import type { BookStatus } from '@/api/types';

const statusStyle: Record<BookStatus, { bg: string; fg: string }> = {
  analyzed: { bg: 'var(--color-success-bg)', fg: 'var(--color-success)' },
  ready: { bg: 'var(--color-info-bg)', fg: 'var(--color-info)' },
  processing: { bg: 'var(--color-warning-bg)', fg: 'var(--color-warning)' },
  error: { bg: 'var(--color-error-bg)', fg: 'var(--color-error)' },
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
