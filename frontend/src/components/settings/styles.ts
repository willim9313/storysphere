import type { CSSProperties } from 'react';

// 設定頁各卡共用的行內樣式（只用 var(--*)）。
export const thStyle: CSSProperties = {
  textAlign: 'left',
  padding: 'var(--space-3) var(--space-4) var(--space-3) 0',
  fontSize: 'var(--font-size-2xs)',
  fontWeight: 600,
  color: 'var(--fg-muted)',
};

export const tdStyle: CSSProperties = {
  padding: 'var(--space-4) var(--space-4) var(--space-4) 0',
  verticalAlign: 'top',
};

export const rowBorder: CSSProperties = {
  borderTop: 'var(--border-width) var(--border-style) var(--border)',
};

export const inputStyle: CSSProperties = {
  fontFamily: 'var(--font-sans)',
  fontSize: 'var(--font-size-xs)',
  padding: 'var(--space-2) var(--space-4)',
  border: 'var(--input-border-width) solid var(--border)',
  borderRadius: 'var(--input-radius)',
  background: 'var(--input-bg)',
  color: 'var(--fg-primary)',
  minWidth: 0,
};

export const noteStyle: CSSProperties = {
  margin: 0,
  fontSize: 'var(--font-size-2xs)',
  color: 'var(--fg-muted)',
  lineHeight: 1.6,
};

export const errorStyle: CSSProperties = {
  margin: 0,
  padding: 'var(--space-3) var(--space-4)',
  background: 'var(--color-error-bg)',
  color: 'var(--color-error)',
  borderRadius: 'var(--radius-sm)',
  fontSize: 'var(--font-size-2xs)',
  lineHeight: 1.6,
  wordBreak: 'break-word',
};
