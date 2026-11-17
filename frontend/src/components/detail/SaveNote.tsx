import { useState, type CSSProperties } from 'react';
import { useNavigate } from 'react-router-dom';
import { ApiError } from '@/api/client';
import type { EvidenceItem } from '@/api/evidence';
import { useCreateNote } from '@/api/notes';

const small: CSSProperties = { margin: 0, fontSize: 'var(--font-size-2xs)', color: 'var(--fg-muted)', lineHeight: 1.6 };
const field: CSSProperties = {
  font: 'inherit',
  fontSize: 'var(--font-size-sm)',
  color: 'var(--fg-primary)',
  background: 'var(--bg-primary)',
  border: 'var(--border-width) var(--border-style) var(--border)',
  borderRadius: 'var(--radius-md)',
  padding: 'var(--space-3)',
};

/**
 * 「存成筆記」（05 §3.2、N-06c `origin=run`）：按下確認＝人工審核。
 * 預設引用這個 run 所有 current、沒被拒絕的證據；第 1 層不在這裡（結果卡只列第 2 層以上）。
 */
export function SaveNote({
  bookId,
  runId,
  question,
  evidence,
  open,
  onOpenChange,
}: Readonly<{ bookId: string; runId: string; question: string; evidence: EvidenceItem[]; open: boolean; onOpenChange: (open: boolean) => void }>) {
  const navigate = useNavigate();
  const create = useCreateNote(bookId);
  const citable = evidence.filter((e) => e.level >= 2 && e.status === 'current');
  const [title, setTitle] = useState(question);
  const [conclusion, setConclusion] = useState('');

  return (
    <section
      id="save-note"
      aria-labelledby="save-h"
      style={{
        background: 'var(--bg-secondary)',
        borderRadius: 'var(--card-radius)',
        padding: 'var(--space-5) var(--space-6)',
        display: 'flex',
        flexDirection: 'column',
        gap: 'var(--space-4)',
      }}
    >
      <div style={{ display: 'flex', flexWrap: 'wrap', justifyContent: 'space-between', alignItems: 'center', gap: 'var(--space-4)' }}>
        <div style={{ display: 'flex', flexDirection: 'column', gap: 'var(--space-1)' }}>
          <span id="save-h" style={{ fontFamily: 'var(--font-serif)', fontSize: 'var(--font-size-base)', fontWeight: 600 }}>
            把這次結果存成筆記
          </span>
          <span style={small}>
            按下確認＝人工審核；引用的證據都要是第 2 層以上。筆記不會被之後的重跑取代，依據變動時會標示。
          </span>
        </div>
        {!open && (
          <button type="button" className="ss-btn ss-btn-md ss-btn-primary" disabled={citable.length === 0} onClick={() => onOpenChange(true)}>
            存成筆記
          </button>
        )}
      </div>
      {open && (
        <>
          <label style={{ display: 'flex', flexDirection: 'column', gap: 'var(--space-2)', fontSize: 'var(--font-size-xs)', color: 'var(--fg-secondary)' }}>
            標題
            <input value={title} onChange={(e) => setTitle(e.target.value)} style={field} />
          </label>
          <label style={{ display: 'flex', flexDirection: 'column', gap: 'var(--space-2)', fontSize: 'var(--font-size-xs)', color: 'var(--fg-secondary)' }}>
            結論（可用 markdown）
            <textarea rows={4} value={conclusion} onChange={(e) => setConclusion(e.target.value)} style={field} />
          </label>
          <span style={small}>會引用這次結果的 {citable.length} 筆證據。</span>
          {create.error && (
            <p role="alert" style={{ ...small, color: 'var(--color-error)' }}>
              {create.error instanceof ApiError ? create.error.detail : String(create.error)}
            </p>
          )}
          <div style={{ display: 'flex', gap: 'var(--space-3)' }}>
            <button
              type="button"
              className="ss-btn ss-btn-md ss-btn-primary"
              disabled={!title.trim() || !conclusion.trim() || create.isPending}
              onClick={() =>
                create.mutate(
                  { fromRunId: runId, title: title.trim(), conclusion: conclusion.trim(), citedEvidenceIds: citable.map((e) => e.id) },
                  { onSuccess: (data) => navigate(`/books/${bookId}/notes?note=${data.note.id}`) },
                )
              }
            >
              確認存成筆記
            </button>
            <button type="button" className="ss-btn ss-btn-md ss-btn-ghost" onClick={() => onOpenChange(false)}>
              取消
            </button>
          </div>
        </>
      )}
    </section>
  );
}
