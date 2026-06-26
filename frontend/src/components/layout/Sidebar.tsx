import { Fragment } from 'react';
import { Link, useLocation } from 'react-router-dom';
import { Home, Upload, BookOpen, Search, BarChart3, Settings, Loader, type LucideIcon } from 'lucide-react';
import { useTranslation } from 'react-i18next';

interface NavItem {
  to: string;
  icon: LucideIcon;
  label: string;
  disabled?: boolean;
}

interface SidebarProps {
  readonly tasksOpen: boolean;
  readonly activeCount: number;
  readonly onToggleTasks: () => void;
}

export function Sidebar({ tasksOpen, activeCount, onToggleTasks }: SidebarProps) {
  const location = useLocation();
  const { t } = useTranslation('nav');

  const items: NavItem[] = [
    { to: '/', icon: Home, label: t('library') },
    { to: '/upload', icon: Upload, label: t('upload') },
    { to: '/methodology', icon: BookOpen, label: t('frameworks') },
    { to: '/search', icon: Search, label: t('search') },
    { to: '/token-usage', icon: BarChart3, label: t('tokenUsage') },
  ];

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
          <Fragment key={to}>
            <Link
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

            {/* Task Center toggle — placed between Search and Token usage */}
            {to === '/search' && (
              <button
                type="button"
                onClick={onToggleTasks}
                title="任務中心"
                aria-label="任務中心"
                className="relative flex items-center justify-center rounded-md transition-colors"
                style={{
                  width: 36,
                  height: 36,
                  background: tasksOpen ? 'var(--bg-tertiary)' : 'transparent',
                  color: tasksOpen ? 'var(--accent)' : 'var(--fg-secondary)',
                  border: 0,
                  cursor: 'pointer',
                }}
              >
                <Loader size={18} />
                {activeCount > 0 && (
                  <span
                    className="absolute flex items-center justify-center"
                    style={{
                      top: 2,
                      right: 2,
                      minWidth: 14,
                      height: 14,
                      padding: '0 3px',
                      borderRadius: 999,
                      fontSize: 9,
                      lineHeight: 1,
                      background: 'var(--accent)',
                      color: 'var(--bg-primary)',
                    }}
                  >
                    {activeCount}
                  </span>
                )}
              </button>
            )}
          </Fragment>
        );
      })}

      <div className="flex-1" />

      <Link
        to="/settings"
        title={t('settings')}
        className="flex items-center justify-center rounded-md transition-colors"
        style={{
          width: 36,
          height: 36,
          backgroundColor: location.pathname.startsWith('/settings') ? 'var(--bg-tertiary)' : 'transparent',
          color: location.pathname.startsWith('/settings') ? 'var(--accent)' : 'var(--fg-secondary)',
        }}
      >
        <Settings size={18} />
      </Link>

    </nav>
  );
}
