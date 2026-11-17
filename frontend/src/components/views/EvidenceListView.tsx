import { ApiError } from '@/api/client';
import { useViewData } from '@/api/runs';
import { claimTypeLabel } from './labels';
import type { ViewProps } from './types';

/** `evidence_list`：通用的證據列表＋引文（05 §4.1）。 */
export function EvidenceListView({ bookId, runId, evidenceIds, onSelectEvidence }: Readonly<ViewProps>) {
  const { data, isLoading, error } = useViewData(bookId, 'evidence_list', evidenceIds ? { evidenceIds } : { runId });
  if (isLoading) return <p style={{ margin: 0, color: 'var(--fg-muted)' }}>讀取中…</p>;
  if (error) {
    return (
      <p role="alert" style={{ margin: 0, color: 'var(--color-error)' }}>
        讀不到資料：{error instanceof ApiError ? error.detail : String(error)}
      </p>
    );
  }
  const items = data?.primary ?? [];
  if (items.length === 0) return <p style={{ margin: 0, color: 'var(--fg-muted)' }}>沒有證據。</p>;
  return (
    <ul style={{ listStyle: 'none', margin: 0, padding: 0, display: 'flex', flexDirection: 'column' }}>
      {items.map((item) => (
        <li key={item.id} style={{ borderBottom: 'var(--border-width) var(--border-style) var(--border)' }}>
          <button
            type="button"
            onClick={() => onSelectEvidence?.(item.id)}
            style={{
              all: 'unset',
              boxSizing: 'border-box',
              width: '100%',
              cursor: onSelectEvidence ? 'pointer' : 'default',
              padding: 'var(--space-4) var(--space-2)',
              display: 'flex',
              flexDirection: 'column',
              gap: 'var(--space-2)',
            }}
          >
            <span style={{ display: 'flex', gap: 'var(--space-3)', fontSize: 'var(--font-size-2xs)', color: 'var(--fg-muted)' }}>
              <span>{claimTypeLabel(item.claimType)}</span>
              <span>L{item.level}</span>
              {item.discourseChapter !== null && <span>第 {item.discourseChapter} 章</span>}
            </span>
            <span style={{ fontSize: 'var(--font-size-sm)', color: 'var(--fg-primary)', lineHeight: 1.5 }}>{item.summary}</span>
            {item.quotes[0] && (
              <span style={{ fontFamily: 'var(--font-serif)', fontSize: 'var(--font-size-xs)', color: 'var(--fg-secondary)' }}>
                「{item.quotes[0].text.slice(0, 120)}」
              </span>
            )}
          </button>
        </li>
      ))}
    </ul>
  );
}
