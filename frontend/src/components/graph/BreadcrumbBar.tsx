import { ChevronRight } from 'lucide-react';

export interface BreadcrumbItem {
  label: string;
  onClick?: () => void;
}

interface BreadcrumbBarProps {
  items: BreadcrumbItem[];
}

export function BreadcrumbBar({ items }: BreadcrumbBarProps) {
  if (items.length === 0) return null;
  return (
    <div
      className="absolute top-4 left-1/2 -translate-x-1/2 z-10 flex items-center gap-1.5 px-3 py-1.5"
      style={{
        backgroundColor: 'var(--bg-primary)',
        border: '1px solid var(--border)',
        borderRadius: 'var(--radius-lg)',
        boxShadow: 'var(--shadow-sm)',
        fontSize: 12,
      }}
    >
      {items.map((item, idx) => {
        const last = idx === items.length - 1;
        return (
          <span key={`${idx}:${item.label}`} className="flex items-center gap-1.5">
            {item.onClick && !last ? (
              <button
                onClick={item.onClick}
                className="hover:underline"
                style={{ color: 'var(--fg-secondary)' }}
              >
                {item.label}
              </button>
            ) : (
              <span style={{ color: last ? 'var(--fg-primary)' : 'var(--fg-secondary)', fontWeight: last ? 600 : 400 }}>
                {item.label}
              </span>
            )}
            {!last && (
              <ChevronRight size={12} style={{ color: 'var(--fg-muted)' }} />
            )}
          </span>
        );
      })}
    </div>
  );
}
