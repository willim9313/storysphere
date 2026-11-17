import type { CSSProperties } from 'react';

/** 右欄面板與清單卡片的外框（同結果卡詳情的 panel）。 */
export const panelStyle: CSSProperties = {
  background: 'var(--bg-primary)',
  border: 'var(--card-border-width) var(--border-style) var(--border)',
  borderRadius: 'var(--card-radius)',
  boxShadow: 'var(--card-shadow)',
  padding: 'var(--space-5) var(--space-6)',
  display: 'flex',
  flexDirection: 'column',
  gap: 'var(--space-4)',
};
