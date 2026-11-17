import { NavLink, Outlet, useMatch } from 'react-router-dom';
import {
  Activity,
  FileSearch,
  LayoutGrid,
  Library,
  MessageSquare,
  NotebookTabs,
  Settings,
  Workflow,
  type LucideIcon,
} from 'lucide-react';
import { useState } from 'react';
import { JobsDrawer } from './JobsDrawer';

interface RailLink {
  to: string;
  label: string;
  icon: LucideIcon;
  /** 只在路徑完全相符時算目前頁（總覽 `/books/:id` 不該在子頁也亮）。 */
  end?: boolean;
}

function RailItem({ to, label, icon: Icon, end }: Readonly<RailLink>) {
  return (
    <NavLink
      to={to}
      end={end}
      aria-label={label}
      title={label}
      className={({ isActive }) => `ss-rail-item${isActive ? ' is-active' : ''}`}
    >
      <Icon size={18} aria-hidden="true" />
    </NavLink>
  );
}

/** 外框：左側導覽列（畫布 Library／Main 的 `.ss-sidebar`）＋內容；書籍層的入口只在開著一本書時出現。 */
export function AppLayout() {
  const book = useMatch('/books/:bookId/*');
  const bookId = book?.params.bookId;
  const [jobsOpen, setJobsOpen] = useState(false);

  const bookLinks: RailLink[] = bookId
    ? [
        { to: `/books/${bookId}`, label: '總覽', icon: LayoutGrid, end: true },
        { to: `/books/${bookId}/agent`, label: 'Agent 工作區', icon: MessageSquare },
        { to: `/books/${bookId}/notes`, label: '筆記', icon: NotebookTabs },
        { to: `/books/${bookId}/evidence`, label: '證據瀏覽', icon: FileSearch },
      ]
    : [];

  return (
    <div style={{ display: 'flex', minHeight: '100vh', background: 'var(--bg-primary)' }}>
      <div className="ss-sidebar-slot">
        <nav className="ss-sidebar" aria-label="主導覽">
          <RailItem to="/" label="書庫" icon={Library} end />
          <div className="ss-rail-divider" />
          {bookLinks.length > 0 && (
            <>
              <div className="ss-rail-book">
                {bookLinks.map((link) => (
                  <RailItem key={link.to} {...link} />
                ))}
              </div>
              <div className="ss-rail-divider" />
            </>
          )}
          <RailItem to="/registry" label="方法目錄" icon={Workflow} />
          <div className="ss-sidebar-spacer" />
          <button
            type="button"
            className={`ss-rail-item${jobsOpen ? ' is-active' : ''}`}
            aria-label="工作中心"
            title="工作中心"
            aria-expanded={jobsOpen}
            onClick={() => setJobsOpen((open) => !open)}
          >
            <Activity size={18} aria-hidden="true" />
          </button>
          <RailItem to="/settings" label="設定" icon={Settings} />
        </nav>
      </div>
      <div className="ss-main">
        <Outlet />
      </div>
      {jobsOpen && <JobsDrawer onClose={() => setJobsOpen(false)} />}
    </div>
  );
}
