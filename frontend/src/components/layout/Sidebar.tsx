import { Fragment, useState, type CSSProperties } from 'react';
import { Link, useLocation } from 'react-router-dom';
import {
  Home,
  Upload,
  BookOpen,
  Search,
  BarChart3,
  Settings,
  Loader,
  PanelLeft,
  PanelLeftClose,
  type LucideIcon,
} from 'lucide-react';
import { useTranslation } from 'react-i18next';

const SIDEBAR_KEY = 'sidebar-expanded';

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
  const [expanded, setExpanded] = useState(() => {
    try { return localStorage.getItem(SIDEBAR_KEY) === 'true'; } catch { return false; }
  });

  const toggleExpanded = () =>
    setExpanded((v) => {
      const next = !v;
      try { localStorage.setItem(SIDEBAR_KEY, String(next)); } catch { /* ignore */ }
      return next;
    });

  const items: NavItem[] = [
    { to: '/', icon: Home, label: t('library') },
    { to: '/upload', icon: Upload, label: t('upload') },
    { to: '/methodology', icon: BookOpen, label: t('frameworks') },
    { to: '/search', icon: Search, label: t('search') },
    { to: '/token-usage', icon: BarChart3, label: t('tokenUsage') },
  ];

  // Shared row geometry — collapsed = 36×36 centered icon; expanded = full-width
  // left-aligned icon + label.
  const rowStyle = (active: boolean, extra?: CSSProperties): CSSProperties => ({
    width: expanded ? '100%' : 36,
    height: 36,
    paddingLeft: expanded ? 10 : 0,
    gap: expanded ? 10 : 0,
    justifyContent: expanded ? 'flex-start' : 'center',
    backgroundColor: active ? 'var(--bg-tertiary)' : 'transparent',
    color: active ? 'var(--accent)' : 'var(--fg-secondary)',
    ...extra,
  });

  const labelStyle: CSSProperties = {
    fontFamily: 'var(--font-sans)',
    fontSize: 13,
    whiteSpace: 'nowrap',
    overflow: 'hidden',
  };

  return (
    <nav
      className="flex flex-col gap-1 flex-shrink-0"
      style={{
        width: expanded ? 180 : 48,
        alignItems: expanded ? 'stretch' : 'center',
        padding: expanded ? '12px 8px' : '12px 6px',
        backgroundColor: 'var(--bg-secondary)',
        borderRight: '1px solid var(--border)',
        transition: 'width 0.15s ease',
      }}
    >
      <button
        type="button"
        onClick={toggleExpanded}
        title={expanded ? t('collapseSidebar') : t('expandSidebar')}
        aria-label={expanded ? t('collapseSidebar') : t('expandSidebar')}
        aria-expanded={expanded}
        className="flex items-center rounded-md transition-colors"
        style={rowStyle(false, { color: 'var(--fg-muted)', border: 0, cursor: 'pointer' })}
      >
        {expanded ? <PanelLeftClose size={18} /> : <PanelLeft size={18} />}
        {expanded && <span style={labelStyle}>{t('collapseSidebar')}</span>}
      </button>

      {items.map(({ to, icon: Icon, label, disabled }) => {
        const active = to === '/'
          ? location.pathname === '/'
          : location.pathname.startsWith(to);

        return (
          <Fragment key={to}>
            <Link
              to={disabled ? '#' : to}
              title={expanded ? undefined : label}
              className="flex items-center rounded-md transition-colors"
              style={rowStyle(active, {
                color: disabled
                  ? 'var(--fg-muted)'
                  : active
                    ? 'var(--accent)'
                    : 'var(--fg-secondary)',
                cursor: disabled ? 'default' : 'pointer',
                opacity: disabled ? 0.5 : 1,
              })}
              onClick={disabled ? (e) => e.preventDefault() : undefined}
            >
              <Icon size={18} className="flex-shrink-0" />
              {expanded && <span style={labelStyle}>{label}</span>}
            </Link>

            {/* Task Center toggle — placed between Search and Token usage */}
            {to === '/search' && (
              <button
                type="button"
                onClick={onToggleTasks}
                title={expanded ? undefined : t('tasks')}
                aria-label={t('tasks')}
                className="relative flex items-center rounded-md transition-colors"
                style={rowStyle(tasksOpen, {
                  color: tasksOpen ? 'var(--accent)' : 'var(--fg-secondary)',
                  border: 0,
                  cursor: 'pointer',
                })}
              >
                <Loader size={18} className="flex-shrink-0" />
                {expanded && <span style={labelStyle}>{t('tasks')}</span>}
                {activeCount > 0 && (
                  <span
                    className="absolute flex items-center justify-center"
                    style={{
                      top: expanded ? '50%' : 1,
                      right: expanded ? 8 : 1,
                      transform: expanded ? 'translateY(-50%)' : undefined,
                      minWidth: 15,
                      height: 15,
                      padding: '0 3px',
                      borderRadius: 8,
                      fontFamily: 'var(--font-mono)',
                      fontSize: 9,
                      fontWeight: 700,
                      lineHeight: 1,
                      background: 'var(--accent)',
                      color: '#fff',
                      border: '1.5px solid var(--bg-secondary)',
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
        title={expanded ? undefined : t('settings')}
        className="flex items-center rounded-md transition-colors"
        style={rowStyle(location.pathname.startsWith('/settings'), {
          color: location.pathname.startsWith('/settings') ? 'var(--accent)' : 'var(--fg-secondary)',
        })}
      >
        <Settings size={18} className="flex-shrink-0" />
        {expanded && <span style={labelStyle}>{t('settings')}</span>}
      </Link>

    </nav>
  );
}
