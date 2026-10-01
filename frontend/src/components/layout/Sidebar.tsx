import { useEffect, useRef, useState, type ReactNode } from 'react';
import { Link, useLocation, useMatch } from 'react-router-dom';
import {
  Home,
  Upload,
  BookOpen,
  Search,
  BarChart3,
  SlidersHorizontal,
  Loader,
  PanelLeft,
  PanelLeftClose,
  Ellipsis,
  type LucideIcon,
} from 'lucide-react';
import { useTranslation } from 'react-i18next';
import { Tooltip } from '@/components/ui/Tooltip';
import { BOOK_VIEWS } from './bookViews';

// 釘選狀態持久化。沿用既有的 'sidebar-expanded' 偏好（框架 §4）：舊版兩態的 true
// 就是推擠版面的 180px，語意等同新版的「釘選」，所以 key 與值都不必遷移。
const PINNED_KEY = 'sidebar-expanded';

// 浮層：游標停在收合鈕上這麼久才展開，掃過頂端不會誤觸。
const OVERLAY_HOVER_DELAY_MS = 200;

// 高度 < 632px 時，系統群（書庫除外）收進底部溢出選單。
const SHORT_VIEWPORT_QUERY = '(max-height: 631.98px)';

type RailMode = 'collapsed' | 'overlay' | 'pinned';

function readPinned(): boolean {
  try {
    return localStorage.getItem(PINNED_KEY) === 'true';
  } catch {
    return false;
  }
}

function useShortViewport(): boolean {
  const [short, setShort] = useState(
    () => typeof window.matchMedia === 'function' && window.matchMedia(SHORT_VIEWPORT_QUERY).matches,
  );
  useEffect(() => {
    if (typeof window.matchMedia !== 'function') return;
    const mq = window.matchMedia(SHORT_VIEWPORT_QUERY);
    const onChange = () => setShort(mq.matches);
    onChange();
    mq.addEventListener('change', onChange);
    return () => mq.removeEventListener('change', onChange);
  }, []);
  return short;
}

interface BookItem {
  path: string;
  icon: LucideIcon;
  label: string;
}

interface SystemItem {
  id: string;
  icon: LucideIcon;
  label: string;
  to?: string;
  active: boolean;
  onClick?: () => void;
  badge?: number;
}

interface SidebarProps {
  readonly tasksOpen: boolean;
  readonly activeCount: number;
  readonly onToggleTasks: () => void;
}

export function Sidebar({ tasksOpen, activeCount, onToggleTasks }: SidebarProps) {
  const location = useLocation();
  const { t } = useTranslation('nav');
  const bookMatch = useMatch('/books/:bookId/*');
  const bookId = bookMatch?.params.bookId;
  const short = useShortViewport();

  const [pinned, setPinned] = useState(readPinned);
  const [overlay, setOverlay] = useState(false);
  const [menuOpen, setMenuOpen] = useState(false);
  const hoverTimer = useRef<ReturnType<typeof setTimeout> | undefined>(undefined);
  const moreRef = useRef<HTMLDivElement>(null);

  const mode: RailMode = pinned ? 'pinned' : overlay ? 'overlay' : 'collapsed';
  const expanded = mode !== 'collapsed';

  useEffect(() => () => clearTimeout(hoverTimer.current), []);

  // 溢出選單：點外面關閉。
  useEffect(() => {
    if (!menuOpen) return;
    const onDown = (e: MouseEvent) => {
      if (!moreRef.current?.contains(e.target as Node)) setMenuOpen(false);
    };
    document.addEventListener('mousedown', onDown);
    return () => document.removeEventListener('mousedown', onDown);
  }, [menuOpen]);

  const overflowing = !!bookId && short;

  const closeTransient = () => {
    clearTimeout(hoverTimer.current);
    setOverlay(false);
    setMenuOpen(false);
  };

  // 收合 → 釘選（推擠）；浮層／釘選 → 收合。
  const onToggle = () => {
    clearTimeout(hoverTimer.current);
    setOverlay(false);
    const next = mode === 'collapsed';
    setPinned(next);
    try { localStorage.setItem(PINNED_KEY, String(next)); } catch { /* ignore */ }
  };

  const onToggleEnter = () => {
    if (pinned) return;
    clearTimeout(hoverTimer.current);
    hoverTimer.current = setTimeout(() => setOverlay(true), OVERLAY_HOVER_DELAY_MS);
  };

  const onNavLeave = () => {
    clearTimeout(hoverTimer.current);
    setOverlay(false);
  };

  const bookItems: BookItem[] = BOOK_VIEWS.map((v) => ({ path: v.path, icon: v.icon, label: t(v.labelKey) }));

  const startsWith = (to: string) => location.pathname.startsWith(to);
  const systemItems: SystemItem[] = [
    { id: 'library', icon: Home, label: t('library'), to: '/', active: location.pathname === '/' },
    { id: 'upload', icon: Upload, label: t('upload'), to: '/upload', active: startsWith('/upload') },
    { id: 'frameworks', icon: BookOpen, label: t('frameworks'), to: '/methodology', active: startsWith('/methodology') },
    { id: 'search', icon: Search, label: t('search'), to: '/search', active: startsWith('/search') },
    // 任務中心：全側欄唯一的 <button>。
    { id: 'tasks', icon: Loader, label: t('tasks'), active: tasksOpen, onClick: onToggleTasks, badge: activeCount },
    { id: 'tokenUsage', icon: BarChart3, label: t('tokenUsage'), to: '/token-usage', active: startsWith('/token-usage') },
    { id: 'settings', icon: SlidersHorizontal, label: t('settings'), to: '/settings', active: startsWith('/settings') },
  ];

  // asRow：標籤直接可見的列形態（側欄展開，或溢出選單內）。
  const renderItem = (item: SystemItem | (BookItem & { id: string; to: string; active: boolean }), asRow: boolean) => {
    const Icon = item.icon;
    const onClick = 'onClick' in item ? item.onClick : undefined;
    const badge = 'badge' in item ? (item.badge ?? 0) : 0;
    const to = 'to' in item ? item.to : undefined;
    const cls = ['ss-rail-item', asRow ? 'ss-rail-item-row' : '', item.active ? 'is-active' : '']
      .filter(Boolean)
      .join(' ');
    const inner: ReactNode = (
      <>
        <Icon size={18} strokeWidth={2} className="ss-rail-icon" />
        {asRow && <span className="ss-rail-label">{item.label}</span>}
        {badge > 0 && <span className="ss-rail-badge">{badge}</span>}
      </>
    );
    const el = to ? (
      <Link
        to={to}
        className={cls}
        aria-label={item.label}
        aria-current={item.active ? 'page' : undefined}
        onClick={closeTransient}
      >
        {inner}
      </Link>
    ) : (
      <button
        type="button"
        className={cls}
        aria-label={item.label}
        aria-pressed={item.active}
        onClick={() => {
          closeTransient();
          onClick?.();
        }}
      >
        {inner}
      </button>
    );
    return (
      <Tooltip key={item.id} label={item.label} placement="right" nowrap disabled={asRow}>
        {el}
      </Tooltip>
    );
  };

  const inRail = overflowing ? systemItems.filter((i) => i.id === 'library') : systemItems;
  const inMenu = overflowing ? systemItems.filter((i) => i.id !== 'library') : [];
  const settings = inRail.find((i) => i.id === 'settings');
  const upper = inRail.filter((i) => i.id !== 'settings');

  const toggleLabel = expanded ? t('collapseSidebar') : t('expandSidebar');

  return (
    <div className="ss-sidebar-slot" data-mode={mode}>
      <nav
        className="ss-sidebar"
        data-mode={mode}
        data-expanded={expanded}
        onMouseLeave={onNavLeave}
        onKeyDown={(e) => {
          if (e.key === 'Escape') closeTransient();
        }}
      >
        <Tooltip label={toggleLabel} placement="right" nowrap disabled={expanded}>
          <button
            type="button"
            onClick={onToggle}
            onMouseEnter={onToggleEnter}
            aria-label={toggleLabel}
            aria-expanded={expanded}
            className={`ss-rail-item${expanded ? ' ss-rail-item-row' : ''}`}
          >
            {expanded ? <PanelLeftClose size={18} strokeWidth={2} className="ss-rail-icon" /> : <PanelLeft size={18} strokeWidth={2} className="ss-rail-icon" />}
            {expanded && <span className="ss-rail-label">{t('collapseSidebar')}</span>}
          </button>
        </Tooltip>

        {bookId && (
          <>
            <div className="ss-rail-book">
              {bookItems.map((b) => {
                const base = `/books/${bookId}`;
                const to = `${base}${b.path}`;
                return renderItem(
                  { ...b, id: `book${b.path}`, to, active: location.pathname === to },
                  expanded,
                );
              })}
            </div>
            <div className="ss-rail-divider" />
          </>
        )}

        {upper.map((i) => renderItem(i, expanded))}

        <div className="ss-sidebar-spacer" />

        {inMenu.length > 0 && (
          <div className="ss-rail-more" ref={moreRef}>
            <Tooltip label={t('more')} placement="right" nowrap disabled={expanded || menuOpen}>
              <button
                type="button"
                className={`ss-rail-item${expanded ? ' ss-rail-item-row' : ''}${menuOpen ? ' is-active' : ''}`}
                aria-label={t('more')}
                aria-haspopup="menu"
                aria-expanded={menuOpen}
                onClick={() => setMenuOpen((v) => !v)}
              >
                <Ellipsis size={18} strokeWidth={2} className="ss-rail-icon" />
                {expanded && <span className="ss-rail-label">{t('more')}</span>}
              </button>
            </Tooltip>
            {menuOpen && (
              <div className="ss-rail-menu" role="menu">
                {inMenu.map((i) => renderItem(i, true))}
              </div>
            )}
          </div>
        )}

        {settings && renderItem(settings, expanded)}
      </nav>
    </div>
  );
}
