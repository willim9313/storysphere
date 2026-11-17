import type { CSSProperties } from 'react';
import type { MethodSummary } from '@/api/registry';
import { implKindLabel, layerLabel } from './labels';

const th: CSSProperties = {
  textAlign: 'left',
  padding: 'var(--space-4) var(--space-5)',
  fontWeight: 600,
  fontSize: 'var(--font-size-2xs)',
  color: 'var(--fg-muted)',
};
const td: CSSProperties = { padding: 'var(--space-4) var(--space-5)', verticalAlign: 'top' };

/** 實作欄：`implemented=false` 標「尚未支援」。 */
export function ImplementedBadge({ implemented }: Readonly<{ implemented: boolean }>) {
  return <span className={`ss-badge ${implemented ? 'ss-badge-success' : 'ss-badge-neutral'}`}>{implemented ? '已實作' : '尚未支援'}</span>;
}

export function PriorityBadge({ priority }: Readonly<{ priority: string | null }>) {
  if (!priority) return null;
  return <span className={`ss-badge ${priority === 'P0' ? 'ss-badge-success' : 'ss-badge-neutral'}`}>{priority}</span>;
}

/** 方法清單（N-07a，畫布 Registry.dc.html 的表格）；點一列在右欄開宣告。 */
export function MethodTable({
  methods,
  selectedId,
  onSelect,
}: Readonly<{ methods: MethodSummary[]; selectedId: string | null; onSelect: (id: string) => void }>) {
  return (
    <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: 'var(--font-size-xs)', minWidth: 760 }}>
      <thead>
        <tr style={{ background: 'var(--bg-secondary)' }}>
          <th scope="col" style={th}>代碼</th>
          <th scope="col" style={th}>問題</th>
          <th scope="col" style={th}>讀 → 產出</th>
          <th scope="col" style={th}>做法</th>
          <th scope="col" style={th}>優先</th>
          <th scope="col" style={th}>實作</th>
        </tr>
      </thead>
      <tbody>
        {methods.map((m) => {
          const selected = m.id === selectedId;
          return (
            <tr
              key={m.id}
              aria-selected={selected}
              onClick={() => onSelect(m.id)}
              style={{
                borderTop: 'var(--border-width) var(--border-style) var(--border)',
                background: selected ? 'var(--bg-secondary)' : 'transparent',
                cursor: 'pointer',
              }}
            >
              <td style={td}>
                <button
                  type="button"
                  onClick={(event) => {
                    event.stopPropagation();
                    onSelect(m.id);
                  }}
                  style={{ all: 'unset', cursor: 'pointer', fontFamily: 'var(--font-mono)', fontWeight: 500, color: selected ? 'var(--accent)' : 'inherit' }}
                >
                  {m.code}
                </button>
                <br />
                <span style={{ fontSize: 'var(--font-size-2xs)', color: 'var(--fg-muted)' }}>
                  {layerLabel(m.layer)} · {m.mechanism}
                </span>
              </td>
              <td style={td}>
                <div style={{ fontFamily: 'var(--font-serif)', fontSize: 'var(--font-size-sm)' }}>{m.question}</div>
                <div style={{ fontSize: 'var(--font-size-2xs)', color: 'var(--fg-muted)', marginTop: 'var(--space-1)' }}>
                  {m.grade} · {m.basis}
                </div>
              </td>
              <td style={{ ...td, fontFamily: 'var(--font-mono)', fontSize: 'var(--font-size-2xs)', color: 'var(--fg-secondary)', lineHeight: 1.6 }}>
                {m.requires.map((r) => (r.optional ? `(${r.claimType})` : r.claimType)).join(', ')} → {m.produces}
              </td>
              <td style={{ ...td, color: 'var(--fg-secondary)' }}>{implKindLabel(m.implKind)}</td>
              <td style={td}>
                <PriorityBadge priority={m.priority} />
              </td>
              <td style={td}>
                <ImplementedBadge implemented={m.implemented} />
              </td>
            </tr>
          );
        })}
      </tbody>
    </table>
  );
}
