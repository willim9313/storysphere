import type { ReactNode } from 'react';
import { X } from 'lucide-react';
import { ApiError } from '@/api/client';

const GRAPH_HEIGHT = 560;

const muted = { margin: 0, color: 'var(--fg-muted)', fontSize: 'var(--font-size-sm)' } as const;

/** 讀取中／錯誤／沒有資料；都不是就回 null。 */
export function GraphStatus({ isLoading, error, empty, emptyText }: Readonly<{
  isLoading: boolean;
  error: unknown;
  empty: boolean;
  emptyText: string;
}>) {
  if (isLoading) return <p style={muted}>讀取中…</p>;
  if (error) {
    return (
      <p role="alert" style={{ ...muted, color: 'var(--color-error)' }}>
        讀不到資料：{error instanceof ApiError ? error.detail : String(error)}
      </p>
    );
  }
  if (empty) return <p style={muted}>{emptyText}</p>;
  return null;
}

/** 圖上方一行：文字摘要（給讀屏與一眼看懂）＋右側控制項。 */
export function GraphHeader({ summary, children }: Readonly<{ summary: string; children?: ReactNode }>) {
  return (
    <div
      style={{
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'space-between',
        gap: 'var(--space-3)',
        flexWrap: 'wrap',
        marginBottom: 'var(--space-2)',
      }}
    >
      <p style={muted} aria-live="polite">
        {summary}
      </p>
      {children}
    </div>
  );
}

/** 點節點後浮在圖右上角的小詳情。 */
export function DetailPanel({ title, onClose, children }: Readonly<{
  title: string;
  onClose: () => void;
  children: ReactNode;
}>) {
  return (
    <aside
      aria-label={`${title} 的詳情`}
      style={{
        position: 'absolute',
        top: 'var(--space-3)',
        right: 'var(--space-3)',
        width: 'min(320px, calc(100% - 2 * var(--space-3)))',
        maxHeight: `calc(${GRAPH_HEIGHT}px - 2 * var(--space-3))`,
        overflowY: 'auto',
        background: 'var(--bg-primary)',
        border: 'var(--border-width) var(--border-style) var(--border)',
        borderRadius: 'var(--radius-md)',
        boxShadow: 'var(--shadow-md)',
        padding: 'var(--space-4)',
        display: 'flex',
        flexDirection: 'column',
        gap: 'var(--space-2)',
        fontSize: 'var(--font-size-sm)',
        color: 'var(--fg-primary)',
        lineHeight: 1.6,
      }}
    >
      <div style={{ display: 'flex', alignItems: 'flex-start', gap: 'var(--space-2)' }}>
        <h4 style={{ margin: 0, flex: 1, fontSize: 'var(--font-size-base)' }}>{title}</h4>
        <button
          type="button"
          onClick={onClose}
          aria-label="關閉詳情"
          style={{ all: 'unset', cursor: 'pointer', color: 'var(--fg-muted)', display: 'flex' }}
        >
          <X size={16} aria-hidden />
        </button>
      </div>
      {children}
    </aside>
  );
}

/** 詳情裡的一列「標籤：內容」。 */
export function DetailRow({ label, children }: Readonly<{ label: string; children: ReactNode }>) {
  return (
    <div>
      <div style={{ fontSize: 'var(--font-size-2xs)', color: 'var(--fg-muted)' }}>{label}</div>
      <div style={{ color: 'var(--fg-secondary)' }}>{children}</div>
    </div>
  );
}

/** 放 cytoscape 的框；children 是 cytoscape 容器與詳情。 */
export function GraphFrame({ children }: Readonly<{ children: ReactNode }>) {
  return <div style={frameStyle}>{children}</div>;
}

const frameStyle = {
  position: 'relative',
  height: GRAPH_HEIGHT,
  border: 'var(--border-width) var(--border-style) var(--border)',
  borderRadius: 'var(--radius-md)',
  background: 'var(--bg-secondary)',
  overflow: 'hidden',
} as const;
