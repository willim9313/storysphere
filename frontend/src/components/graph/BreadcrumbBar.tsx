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
      className="absolute z-10 flex items-center"
      style={{
        top: 60,
        left: 12,
        gap: 6,
        padding: '5px 10px',
        backgroundColor: 'var(--bg-primary)',
        border: '1px solid var(--border)',
        borderRadius: 'var(--radius-md)',
        boxShadow: 'var(--shadow-sm)',
        fontSize: 'var(--font-size-2xs)',
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
