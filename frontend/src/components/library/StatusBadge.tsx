import type { BookStatus } from '@/api/types';

const statusConfig: Record<BookStatus, { label: string; bg: string; fg: string }> = {
  analyzed: { label: '已分析', bg: '#dcfce7', fg: '#166534' },
  ready: { label: '已就緒', bg: '#dbeafe', fg: '#1e40af' },
  processing: { label: '處理中', bg: '#fef9c3', fg: '#854d0e' },
  error: { label: '錯誤', bg: '#fee2e2', fg: '#991b1b' },
};

export function StatusBadge({ status }: { status: BookStatus }) {
  const cfg = statusConfig[status];
  return (
    <span
      className="inline-flex items-center text-xs px-1.5 py-0.5 rounded-full font-medium"
      style={{ backgroundColor: cfg.bg, color: cfg.fg }}
    >
      {cfg.label}
    </span>
  );
}
