import { useEffect, useRef, type CSSProperties } from 'react';
import { X } from 'lucide-react';
import { ApiError } from '@/api/client';
import { useParagraph, type ParagraphView } from '@/api/evidence';
import type { SourceRef } from './EvidenceCard';

type Paragraph = ParagraphView['paragraph'];
type Highlight = ParagraphView['highlights'][number];

const para: CSSProperties = { margin: 0, fontFamily: 'var(--font-serif)', fontSize: 'var(--font-size-sm)', lineHeight: 1.9 };

/** 把引文偏移標成 <mark>；偏移缺漏（引文未對上原文）就不標。 */
function marked(text: string, highlights: Highlight[]) {
  const spans = highlights
    .filter((h) => h.start !== null && h.end !== null)
    .sort((a, b) => (a.start ?? 0) - (b.start ?? 0));
  const parts: (string | { text: string; key: number })[] = [];
  let cursor = 0;
  spans.forEach((h, i) => {
    const start = Math.max(h.start ?? 0, cursor);
    const end = h.end ?? start;
    if (start > cursor) parts.push(text.slice(cursor, start));
    if (end > start) parts.push({ text: text.slice(start, end), key: i });
    cursor = Math.max(cursor, end);
  });
  parts.push(text.slice(cursor));
  return parts.map((part, i) =>
    typeof part === 'string' ? (
      <span key={`t${i}`}>{part}</span>
    ) : (
      <mark key={`m${part.key}`} style={{ background: 'var(--color-warning-bg)', color: 'inherit' }}>
        {part.text}
      </mark>
    ),
  );
}

function Context({ rows }: Readonly<{ rows: Paragraph[] }>) {
  return (
    <>
      {rows.map((row) => (
        <p key={row.id} style={{ ...para, color: 'var(--fg-muted)' }}>
          {row.text}
        </p>
      ))}
    </>
  );
}

/** 「↗原文」側板（05 §3.2）：N-05d，前後各一段，高亮引文；引文未對上原文時標示。 */
export function SourcePanel({ bookId, source, onClose }: Readonly<{ bookId: string; source: SourceRef; onClose: () => void }>) {
  const { data, isLoading, error } = useParagraph(bookId, source.paragraphId, source.evidenceId);
  const ref = useRef<HTMLElement>(null);
  // 側板在右欄最下面，開新的原文時捲到看得見。
  useEffect(() => {
    ref.current?.scrollIntoView({ behavior: 'smooth', block: 'nearest' });
  }, [source.paragraphId, source.evidenceId]);
  const verified = data ? data.highlights.length > 0 && data.highlights.every((h) => h.verified) : false;
  return (
    <section
      ref={ref}
      aria-labelledby="src-h"
      style={{
        background: 'var(--bg-primary)',
        border: 'var(--card-border-width) var(--border-style) var(--border)',
        borderRadius: 'var(--card-radius)',
        boxShadow: 'var(--card-shadow)',
        padding: 'var(--space-5) var(--space-6)',
        display: 'flex',
        flexDirection: 'column',
        gap: 'var(--space-4)',
      }}
    >
      <div style={{ display: 'flex', alignItems: 'center', gap: 'var(--space-4)' }}>
        <h2 id="src-h" style={{ margin: 0, fontFamily: 'var(--font-serif)', fontSize: 'var(--font-size-lg)', fontWeight: 600 }}>
          原文{data ? ` · 第 ${data.paragraph.chapterNumber} 章 ¶ ${data.paragraph.position + 1}` : ''}
        </h2>
        {data && (
          <span className={`ss-badge ${verified ? 'ss-badge-success' : 'ss-badge-warning'}`}>
            {verified ? '引文已對上原文' : '引文未對上原文'}
          </span>
        )}
        <button
          type="button"
          aria-label="關閉原文"
          onClick={onClose}
          style={{ marginLeft: 'auto', background: 'none', border: 'none', cursor: 'pointer', color: 'var(--fg-muted)', padding: 'var(--space-2)' }}
        >
          <X size={16} aria-hidden="true" />
        </button>
      </div>
      {isLoading && <p style={{ margin: 0, color: 'var(--fg-muted)' }}>讀取中…</p>}
      {error && (
        <p role="alert" style={{ margin: 0, color: 'var(--color-error)' }}>
          讀不到原文：{error instanceof ApiError ? error.detail : String(error)}
        </p>
      )}
      {data && (
        <div style={{ display: 'flex', flexDirection: 'column', gap: 'var(--space-4)', maxHeight: 420, overflowY: 'auto' }}>
          <Context rows={data.before} />
          <p style={para}>{marked(data.paragraph.text, data.highlights)}</p>
          <Context rows={data.after} />
        </div>
      )}
    </section>
  );
}
