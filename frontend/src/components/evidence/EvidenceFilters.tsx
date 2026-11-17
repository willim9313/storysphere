import { useState, type CSSProperties, type FormEvent } from 'react';
import { claimTypeLabel } from '@/components/views/labels';
import type { EvidenceFilter } from './useEvidenceBrowse';

const field: CSSProperties = { display: 'flex', flexDirection: 'column', gap: 'var(--space-2)' };
const label: CSSProperties = { fontSize: 'var(--font-size-2xs)', color: 'var(--fg-muted)' };
const control: CSSProperties = {
  fontFamily: 'var(--font-sans)',
  fontSize: 'var(--font-size-xs)',
  padding: 'var(--space-3) var(--space-5)',
  border: 'var(--input-border-width) solid var(--border)',
  borderRadius: 'var(--input-radius)',
  background: 'var(--input-bg)',
  color: 'var(--fg-primary)',
};

export interface ClaimTypeOption {
  id: string;
  level: number | null;
}

/** 證據瀏覽的篩選列（畫布 Evidence.dc.html 的灰底列）：搜尋、類型、層級、審核、狀態、章節範圍。 */
export function EvidenceFilters({
  filter,
  onChange,
  claimTypes,
  levels,
  chapterCount,
}: Readonly<{
  filter: EvidenceFilter;
  onChange: (patch: Partial<EvidenceFilter>) => void;
  claimTypes: ClaimTypeOption[];
  levels: number[];
  chapterCount: number;
}>) {
  // 搜尋字按 Enter 或離開欄位才送，不是每打一個字就查。
  const [q, setQ] = useState(filter.q);
  const [lastQ, setLastQ] = useState(filter.q);
  if (filter.q !== lastQ) {
    setLastQ(filter.q);
    setQ(filter.q);
  }
  const submit = (event?: FormEvent) => {
    event?.preventDefault();
    if (q.trim() !== filter.q) onChange({ q: q.trim() });
  };
  const chapters = Array.from({ length: chapterCount }, (_, i) => i + 1);
  return (
    <form
      role="search"
      onSubmit={submit}
      style={{
        display: 'flex',
        flexWrap: 'wrap',
        gap: 'var(--space-4)',
        alignItems: 'flex-end',
        padding: 'var(--space-4) var(--space-5)',
        background: 'var(--bg-secondary)',
        border: 'var(--border-width) var(--border-style) var(--border)',
        borderRadius: 'var(--radius-md)',
      }}
    >
      <div style={{ ...field, flex: '2 1 240px' }}>
        <label htmlFor="ev-q" style={label}>
          搜尋摘要與引文
        </label>
        <input id="ev-q" type="search" value={q} placeholder="例如：木腿" onChange={(e) => setQ(e.target.value)} onBlur={() => submit()} style={control} />
      </div>
      <div style={{ ...field, flex: '1 1 160px' }}>
        <label htmlFor="ev-type" style={label}>
          類型
        </label>
        <select id="ev-type" value={filter.type} onChange={(e) => onChange({ type: e.target.value })} style={control}>
          <option value="">全部 {claimTypes.length} 種</option>
          {claimTypes.map((t) => (
            <option key={t.id} value={t.id}>
              {claimTypeLabel(t.id) === t.id ? t.id : `${claimTypeLabel(t.id)}（${t.id}）`}
            </option>
          ))}
        </select>
      </div>
      <div style={{ ...field, flex: '1 1 110px' }}>
        <label htmlFor="ev-level" style={label}>
          層級
        </label>
        <select id="ev-level" value={filter.level} onChange={(e) => onChange({ level: e.target.value })} style={control}>
          <option value="">全部</option>
          {levels.map((level) => (
            <option key={level} value={String(level)}>
              第 {level} 層
            </option>
          ))}
        </select>
      </div>
      <div style={{ ...field, flex: '1 1 110px' }}>
        <label htmlFor="ev-status" style={label}>
          狀態
        </label>
        <select id="ev-status" value={filter.status} onChange={(e) => onChange({ status: e.target.value })} style={control}>
          <option value="">現行</option>
          <option value="superseded">已被取代</option>
          <option value="rejected">已拒絕</option>
        </select>
      </div>
      <div style={{ ...field, flex: '1 1 110px' }}>
        <label htmlFor="ev-review" style={label}>
          審核
        </label>
        <select
          id="ev-review"
          value={filter.status === 'rejected' ? '' : filter.review}
          disabled={filter.status === 'rejected'}
          onChange={(e) => onChange({ review: e.target.value })}
          style={control}
        >
          <option value="">全部</option>
          <option value="pending">待審</option>
          <option value="approved">已確認</option>
          <option value="modified">已修改</option>
        </select>
      </div>
      <fieldset style={{ ...field, border: 'none', margin: 0, padding: 0, flex: '1 1 200px' }}>
        <legend style={{ ...label, padding: 0, marginBottom: 'var(--space-2)' }}>章節</legend>
        <div style={{ display: 'flex', alignItems: 'center', gap: 'var(--space-2)' }}>
          <select aria-label="起始章" value={filter.from} onChange={(e) => onChange({ from: e.target.value })} style={{ ...control, flex: 1 }}>
            <option value="">第 1 章</option>
            {chapters.map((n) => (
              <option key={n} value={String(n)}>
                第 {n} 章
              </option>
            ))}
          </select>
          <span style={label}>–</span>
          <select aria-label="結束章" value={filter.to} onChange={(e) => onChange({ to: e.target.value })} style={{ ...control, flex: 1 }}>
            <option value="">最後一章</option>
            {chapters.map((n) => (
              <option key={n} value={String(n)}>
                第 {n} 章
              </option>
            ))}
          </select>
        </div>
      </fieldset>
    </form>
  );
}
