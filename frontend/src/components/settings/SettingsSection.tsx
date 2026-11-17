import type { ReactNode } from 'react';

/** 設定頁的一張卡：serif 小標＋右側動作。 */
export function SettingsSection({
  id,
  title,
  actions,
  children,
}: Readonly<{ id: string; title: string; actions?: ReactNode; children: ReactNode }>) {
  return (
    <section
      aria-labelledby={id}
      style={{
        background: 'var(--bg-primary)',
        border: 'var(--card-border-width) var(--border-style) var(--border)',
        borderRadius: 'var(--card-radius)',
        boxShadow: 'var(--card-shadow)',
        padding: 'var(--space-5) var(--space-6)',
        display: 'flex',
        flexDirection: 'column',
        gap: 'var(--space-4)',
        minWidth: 0,
      }}
    >
      <div
        style={{
          display: 'flex',
          justifyContent: 'space-between',
          alignItems: 'baseline',
          gap: 'var(--space-4)',
        }}
      >
        <h2
          id={id}
          style={{
            margin: 0,
            fontFamily: 'var(--font-serif)',
            fontSize: 'var(--font-size-lg)',
            fontWeight: 600,
          }}
        >
          {title}
        </h2>
        {actions && <div style={{ display: 'flex', gap: 'var(--space-3)' }}>{actions}</div>}
      </div>
      {children}
    </section>
  );
}
