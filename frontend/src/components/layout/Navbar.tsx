import { Link, useLocation } from 'react-router-dom';
import { ThemeToggle } from './ThemeToggle';

const navLinks = [
  { to: '/', label: 'Library' },
  { to: '/upload', label: 'Upload' },
  { to: '/graph', label: 'Graph' },
];

export function Navbar() {
  const location = useLocation();

  return (
    <nav
      className="flex items-center justify-between px-6 py-3 border-b"
      style={{
        borderColor: 'var(--color-border)',
        backgroundColor: 'var(--color-surface)',
      }}
    >
      <div className="flex items-center gap-8">
        <Link
          to="/"
          className="text-xl font-bold"
          style={{ fontFamily: 'var(--font-serif)', color: 'var(--color-accent)' }}
        >
          StorySphere
        </Link>
        <div className="flex gap-1">
          {navLinks.map(({ to, label }) => {
            const active =
              to === '/' ? location.pathname === '/' : location.pathname.startsWith(to);
            return (
              <Link
                key={to}
                to={to}
                className="px-3 py-1.5 rounded-md text-sm font-medium transition-colors"
                style={{
                  backgroundColor: active ? 'var(--color-accent-subtle)' : 'transparent',
                  color: active ? 'var(--color-accent)' : 'var(--color-text-secondary)',
                }}
              >
                {label}
              </Link>
            );
          })}
        </div>
      </div>
      <ThemeToggle />
    </nav>
  );
}
