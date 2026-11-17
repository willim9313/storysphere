import type { CSSProperties } from 'react';
import { useEvidence } from '@/api/evidence';
import { useRun } from '@/api/runs';

// 內容欄位的中文名（01 §5–§7 常見欄位）；沒列到的照 key 顯示。
const FIELD_LABEL: Record<string, string> = {
  readerVisible: '讀者看得到',
  isMisdirection: '誤導',
  clueSummary: '線索',
  statement: '真相',
  revealChapter: '揭曉章',
  verdict: '判定',
  phase: '階段',
  role: '角色',
  state: '狀態',
  relationType: '關係',
  polarity: '傾向',
  description: '說明',
  gapDescription: '缺口說明',
};
const value: CSSProperties = { fontSize: 'var(--font-size-xs)', textAlign: 'right', overflowWrap: 'anywhere' };

/** id 類欄位（xxxId、xxxIds）不列；它們在追溯裡看。 */
function isIdField(key: string) {
  return /Ids?$/.test(key);
}

function show(v: unknown): string | null {
  if (typeof v === 'boolean') return v ? '是' : '否';
  if (typeof v === 'number' || typeof v === 'string') return String(v);
  return null;
}

const VIA: Record<string, string> = { pipeline: '入庫', agent: 'agent', ui_run: '方法' };

function Production({ bookId, runId, producedVia }: Readonly<{ bookId: string; runId: string; producedVia: string }>) {
  const { data: run } = useRun(bookId, runId);
  const via = VIA[producedVia] ?? producedVia;
  const parts = [via, run?.code, run?.model?.split(':').pop(), run?.promptVersion ? `prompt ${run.promptVersion}` : null].filter(Boolean);
  return <span style={value}>{parts.join(' · ')}</span>;
}

/**
 * 證據瀏覽右欄的詳細資料（畫布 Evidence.dc.html 的 `ss-panel`）：內容欄位、每段引文的位置與是否對上原文、產生方式。
 * 審核與追溯在上面的證據卡。
 */
export function EvidenceFacts({ bookId, evidenceId }: Readonly<{ bookId: string; evidenceId: string }>) {
  const { data } = useEvidence(bookId, evidenceId);
  if (!data) return null;
  const content = (data.content ?? {}) as Record<string, unknown>;
  const rows = Object.entries(content)
    .filter(([k, v]) => !isIdField(k) && show(v) !== null && v !== data.summary)
    .map(([k, v]) => [FIELD_LABEL[k] ?? k, show(v)!] as const);

  return (
    <aside aria-labelledby="facts-h" className="ss-panel" style={{ border: 'var(--card-border-width) var(--border-style) var(--border)', borderRadius: 'var(--card-radius)' }}>
      <header className="ss-panel-head">
        <h3 id="facts-h">{data.claimType}</h3>
        <span className="ss-panel-meta">
          {[`L${data.level}`, data.discourseChapter !== null ? `第 ${data.discourseChapter} 章` : null, data.level === 1 ? '唯讀' : null].filter(Boolean).join(' · ')}
        </span>
      </header>
      <div className="ss-panel-body">
        {rows.map(([label, text]) => (
          <div key={label} className="ss-panel-row">
            <span className="ss-panel-meta">{label}</span>
            <span style={value}>{text}</span>
          </div>
        ))}
        {data.quotes.length > 0 && (
          <>
            {rows.length > 0 && <hr className="ss-panel-rule" />}
            <span className="ss-panel-meta">引文 · {data.quotes.length}</span>
            {data.quotes.map((q) => (
              <div key={q.seq} style={{ padding: 'var(--space-4)', background: 'var(--bg-primary)', borderRadius: 'var(--radius-md)', display: 'flex', flexDirection: 'column', gap: 'var(--space-2)' }}>
                <span style={{ fontFamily: 'var(--font-serif)', fontSize: 'var(--font-size-xs)', lineHeight: 1.6 }}>「{q.text}」</span>
                <span style={{ fontSize: 'var(--font-size-2xs)', color: q.verified ? 'var(--fg-muted)' : 'var(--color-warning)' }}>
                  字元 {q.start}–{q.end} · {q.verified ? '✓ 已對上原文' : '✕ 沒對上原文'}
                </span>
              </div>
            ))}
          </>
        )}
        <hr className="ss-panel-rule" />
        <div className="ss-panel-row">
          <span className="ss-panel-meta">產生方式</span>
          {data.runId ? (
            <Production bookId={bookId} runId={data.runId} producedVia={data.producedVia} />
          ) : (
            <span style={value}>{VIA[data.producedVia] ?? data.producedVia}</span>
          )}
        </div>
        {data.level === 1 && (
          <p style={{ margin: 0, fontSize: 'var(--font-size-2xs)', color: 'var(--fg-muted)', lineHeight: 1.6 }}>
            第 1 層錯誤的修正機制還沒定（契約 v2 待決）；原型只能看，不能改。
          </p>
        )}
      </div>
    </aside>
  );
}
