import { Link, useLocation } from 'react-router-dom';
import { Home, Upload, BookOpen, Search, BarChart3 } from 'lucide-react';

const items = [
  { to: '/', icon: Home, label: '書庫' },
  { to: '/upload', icon: Upload, label: '上傳' },
  { to: '/frameworks', icon: BookOpen, label: '框架索引' },
  { to: '#', icon: Search, label: '搜尋', disabled: true },
  { to: '/token-usage', icon: BarChart3, label: 'Token 用量' },
];

export function Sidebar() {
  const location = useLocation();

  return (
    <nav
      className="flex flex-col items-center py-3 gap-1 flex-shrink-0"
      style={{
        width: 48,
        backgroundColor: 'var(--bg-secondary)',
        borderRight: '1px solid var(--border)',
      }}
    >
      {items.map(({ to, icon: Icon, label, disabled }) => {
        const active = to === '/'
          ? location.pathname === '/'
          : location.pathname.startsWith(to);

        return (
          <Link
            key={label}
            to={disabled ? '#' : to}
            title={label}
            className="flex items-center justify-center rounded-md transition-colors"
            style={{
              width: 36,
              height: 36,
              backgroundColor: active ? 'var(--bg-tertiary)' : 'transparent',
              color: disabled
                ? 'var(--fg-muted)'
                : active
                  ? 'var(--accent)'
                  : 'var(--fg-secondary)',
              cursor: disabled ? 'default' : 'pointer',
              opacity: disabled ? 0.5 : 1,
            }}
            onClick={disabled ? (e) => e.preventDefault() : undefined}
          >
            <Icon size={18} />
          </Link>
        );
      })}
    </nav>
  );
}
