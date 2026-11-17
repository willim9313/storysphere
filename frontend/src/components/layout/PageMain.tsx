import type { ReactNode } from 'react';

/** 各頁的內容欄：最寬 1280px、畫布的內距（`<main>` 那一層）。 */
export function PageMain({ children }: Readonly<{ children: ReactNode }>) {
  return (
    <main
      style={{
        width: '100%',
        maxWidth: 1280,
        boxSizing: 'border-box',
        padding: 'var(--space-7) var(--space-7) var(--space-8)',
        display: 'flex',
        flexDirection: 'column',
        gap: 'var(--space-6)',
      }}
    >
      {children}
    </main>
  );
}

/** 頁首：serif 大標＋一行灰字說明，右側放動作。 */
export function PageHeader({
  title,
  meta,
  actions,
}: Readonly<{ title: string; meta?: ReactNode; actions?: ReactNode }>) {
  return (
    <div
      style={{
        display: 'flex',
        flexWrap: 'wrap',
        alignItems: 'flex-end',
        justifyContent: 'space-between',
        gap: 'var(--space-5)',
      }}
    >
      <div style={{ display: 'flex', flexDirection: 'column', gap: 'var(--space-2)' }}>
        <h1
          style={{
            margin: 0,
            fontFamily: 'var(--font-serif)',
            fontSize: 'var(--font-size-3xl)',
            fontWeight: 700,
            lineHeight: 1.2,
          }}
        >
          {title}
        </h1>
        {meta && (
          <p
            style={{
              margin: 0,
              fontSize: 'var(--font-size-xs)',
              color: 'var(--fg-muted)',
              fontVariantNumeric: 'tabular-nums',
            }}
          >
            {meta}
          </p>
        )}
      </div>
      {actions && <div style={{ display: 'flex', gap: 'var(--space-4)', alignItems: 'center' }}>{actions}</div>}
    </div>
  );
}
