import type { CSSProperties } from 'react';
import type { EvidenceItem } from '@/api/evidence';
import { claimTypeLabel } from '@/components/views/labels';

const SOURCE: Record<string, string> = {
  extraction: '抽取',
  method: '方法',
  user: '使用者',
  agent: 'agent',
};

const th: CSSProperties = {
  textAlign: 'left',
  padding: 'var(--space-4) var(--space-3)',
  fontSize: 'var(--font-size-2xs)',
  fontWeight: 600,
  color: 'var(--fg-muted)',
};
const td: CSSProperties = { padding: 'var(--space-4) var(--space-3)', verticalAlign: 'top' };

/** 狀態欄只放一個徽章：拒絕／取代 > 依據已變動 > 審核狀態；第 1 層不審核，顯示「—」。 */
function statusBadge(item: EvidenceItem): { label: string; cls: string } {
  if (item.status === 'superseded') return { label: '已被取代', cls: 'ss-badge-neutral' };
  if (item.status === 'rejected' || item.reviewStatus === 'rejected') return { label: '已拒絕', cls: 'ss-badge-error' };
  if (item.basisChanged) return { label: '依據已變動', cls: 'ss-badge-warning' };
  if (item.level === 1) return { label: '—', cls: 'ss-badge-neutral' };
  if (item.reviewStatus === 'approved') return { label: '已確認', cls: 'ss-badge-success' };
  if (item.reviewStatus === 'modified') return { label: '已修改', cls: 'ss-badge-success' };
  return { label: '待審', cls: 'ss-badge-info' };
}

/** 證據列表（畫布的表格）；點一列在右欄開 EvidenceCard。 */
export function EvidenceTable({
  items,
  selectedId,
  onSelect,
}: Readonly<{ items: EvidenceItem[]; selectedId: string | null; onSelect: (id: string) => void }>) {
  return (
    <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: 'var(--font-size-xs)', minWidth: 720 }}>
      <thead>
        <tr style={{ background: 'var(--bg-secondary)' }}>
          <th scope="col" style={{ ...th, paddingLeft: 'var(--space-5)' }}>
            類型
          </th>
          <th scope="col" style={th}>
            層
          </th>
          <th scope="col" style={th}>
            章
          </th>
          <th scope="col" style={th}>
            摘要
          </th>
          <th scope="col" style={th}>
            來源
          </th>
          <th scope="col" style={{ ...th, textAlign: 'right' }}>
            信心
          </th>
          <th scope="col" style={{ ...th, paddingRight: 'var(--space-5)' }}>
            狀態
          </th>
        </tr>
      </thead>
      <tbody>
        {items.map((item) => {
          const selected = item.id === selectedId;
          const badge = statusBadge(item);
          return (
            <tr
              key={item.id}
              aria-selected={selected}
              onClick={() => onSelect(item.id)}
              style={{
                borderTop: 'var(--border-width) var(--border-style) var(--border)',
                background: selected ? 'var(--bg-secondary)' : 'transparent',
                cursor: 'pointer',
              }}
            >
              <td style={{ ...td, paddingLeft: 'var(--space-5)', fontFamily: 'var(--font-mono)', fontSize: 'var(--font-size-2xs)', color: 'var(--fg-secondary)' }}>
                {claimTypeLabel(item.claimType)}
              </td>
              <td style={td}>L{item.level}</td>
              <td style={{ ...td, fontVariantNumeric: 'tabular-nums' }}>{item.discourseChapter ?? '—'}</td>
              <td style={{ ...td, fontFamily: 'var(--font-serif)', lineHeight: 1.5 }}>
                {/* 鍵盤操作：摘要本身是按鈕。 */}
                <button
                  type="button"
                  onClick={(event) => {
                    event.stopPropagation();
                    onSelect(item.id);
                  }}
                  style={{ all: 'unset', cursor: 'pointer', color: selected ? 'var(--accent)' : 'inherit' }}
                >
                  {item.summary}
                </button>
              </td>
              <td style={{ ...td, color: 'var(--fg-secondary)', whiteSpace: 'nowrap' }}>{SOURCE[item.source] ?? item.source}</td>
              <td style={{ ...td, textAlign: 'right', fontVariantNumeric: 'tabular-nums' }}>{item.confidence.toFixed(2)}</td>
              <td style={{ ...td, paddingRight: 'var(--space-5)' }}>
                <span className={`ss-badge ${badge.cls}`}>{badge.label}</span>
              </td>
            </tr>
          );
        })}
      </tbody>
    </table>
  );
}
