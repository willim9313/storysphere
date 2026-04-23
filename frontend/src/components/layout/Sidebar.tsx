import { Link, useLocation } from 'react-router-dom';
import { Home, Upload, BookOpen, Search, BarChart3, Settings, Globe } from 'lucide-react';
import { useTranslation } from 'react-i18next';

export function Sidebar() {
  const location = useLocation();
  const { t, i18n } = useTranslation('nav');

  const items = [
    { to: '/', icon: Home, label: t('library') },
    { to: '/upload', icon: Upload, label: t('upload') },
    { to: '/frameworks', icon: BookOpen, label: t('frameworks') },
    { to: '#', icon: Search, label: t('search'), disabled: true },
    { to: '/token-usage', icon: BarChart3, label: t('tokenUsage') },
    { to: '/settings', icon: Settings, label: t('settings') },
  ];

  const toggleLang = () => {
    i18n.changeLanguage(i18n.language === 'zh-TW' ? 'en' : 'zh-TW');
  };

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
            key={to}
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

      <div className="flex-1" />

      <button
        onClick={toggleLang}
        title={i18n.language === 'zh-TW' ? 'Switch to English' : '切換至繁體中文'}
        className="flex items-center justify-center rounded-md transition-colors"
        style={{
          width: 36,
          height: 36,
          backgroundColor: 'transparent',
          color: 'var(--fg-secondary)',
          cursor: 'pointer',
          border: 'none',
          fontSize: 10,
          fontWeight: 600,
          letterSpacing: 0,
        }}
      >
        <Globe size={16} />
      </button>
    </nav>
  );
}
