import { useEffect, useRef, useState, type CSSProperties, type ReactNode } from 'react';
import { ApiError } from '@/api/client';
import { useCancelTurn, useResolveApproval, useSendMessage, type TraceItem } from '@/api/agent';
import { useDevView } from '@/hooks/useDevView';
import { Prose } from '@/components/Prose';
import { CALL_STATUS, callDetail, hasResult, resultTitle, type Turn } from './turns';

const small: CSSProperties = { margin: 0, fontSize: 'var(--font-size-2xs)', color: 'var(--fg-muted)', lineHeight: 1.6 };
const mono: CSSProperties = { fontFamily: 'var(--font-mono)' };
// 設計稿 Agent.dc.html 的對話卡。
const pane: CSSProperties = {
  background: 'var(--bg-primary)',
  border: 'var(--card-border-width) var(--border-style) var(--border)',
  borderRadius: 'var(--card-radius)',
  boxShadow: 'var(--card-shadow)',
  display: 'flex',
  flexDirection: 'column',
  minWidth: 0,
};
const bubble: CSSProperties = {
  alignSelf: 'flex-end',
  maxWidth: '88%',
  background: 'var(--bg-tertiary)',
  borderRadius: 'var(--radius-lg)',
  padding: 'var(--space-4) var(--space-5)',
  fontSize: 'var(--font-size-sm)',
  lineHeight: 1.6,
  overflowWrap: 'anywhere',
};
// 有結果的那一輪，旁白只留前 3 行（05 §3.3：對話裡只留旁白與「→ 結果」連結）。
const FOLDED_HEIGHT = 'calc(var(--font-size-sm) * 1.75 * 3)';

function errorText(error: unknown) {
  return error instanceof ApiError ? error.detail : String(error);
}

/** 工具呼叫一行：› 工具名（mono）＋摘要；開發者檢視可展開完整參數。 */
function ToolLine({ call }: Readonly<{ call: TraceItem }>) {
  const [devView] = useDevView();
  const failed = call.status === 'error' || call.status === 'denied';
  const extra = [callDetail(call), CALL_STATUS[call.status], call.errorCode].filter(Boolean).join(' · ');
  const line = (
    <span style={{ color: failed ? 'var(--color-error)' : undefined }}>
      › <span style={mono}>{call.tool}</span>
      {extra ? ` ${extra}` : ''}
    </span>
  );
  if (!devView) return line;
  return (
    <details>
      <summary style={{ cursor: 'pointer', listStyle: 'none' }}>{line}</summary>
      <pre style={{ ...small, ...mono, whiteSpace: 'pre-wrap', wordBreak: 'break-all', background: 'var(--bg-secondary)', padding: 'var(--space-2)', borderRadius: 'var(--radius-md)' }}>
        {JSON.stringify({ seq: call.seq, args: call.args, resultEvidenceIds: call.resultEvidenceIds, resultRunIds: call.resultRunIds, jobId: call.jobId }, null, 2)}
      </pre>
    </details>
  );
}

/** 寫入確認卡（approval_request → N-10f）；從 trace 的 pending_approval 列重建。 */
function ApprovalCard({ sessionId, call }: Readonly<{ sessionId: string; call: TraceItem }>) {
  const resolve = useResolveApproval(sessionId);
  const [devView] = useDevView();
  const requestId = call.approvalRequestId;
  const detail = callDetail(call);
  return (
    <article
      aria-label="寫入確認"
      style={{
        border: 'var(--border-width) var(--border-style) var(--border)',
        borderRadius: 'var(--radius-md)',
        padding: 'var(--space-4) var(--space-5)',
        display: 'flex',
        flexDirection: 'column',
        gap: 'var(--space-3)',
        background: 'var(--color-warning-bg)',
      }}
    >
      <span style={{ fontSize: 'var(--font-size-2xs)', fontWeight: 600, color: 'var(--fg-secondary)' }}>
        大腦要執行需要確認的寫入 · <span style={mono}>{call.tool}</span>
      </span>
      {detail && <span style={{ fontFamily: 'var(--font-serif)', fontSize: 'var(--font-size-xs)', lineHeight: 1.6 }}>{detail}</span>}
      {devView && <pre style={{ ...small, ...mono, whiteSpace: 'pre-wrap' }}>{JSON.stringify(call.args, null, 2)}</pre>}
      <div style={{ display: 'flex', gap: 'var(--space-3)' }}>
        <button type="button" className="ss-btn ss-btn-sm ss-btn-secondary" disabled={!requestId || resolve.isPending} onClick={() => resolve.mutate({ requestId: requestId!, allow: true })}>
          允許
        </button>
        <button type="button" className="ss-btn ss-btn-sm ss-btn-ghost" disabled={!requestId || resolve.isPending} onClick={() => resolve.mutate({ requestId: requestId!, allow: false })}>
          拒絕
        </button>
      </div>
      {resolve.error && <p role="alert" style={{ ...small, color: 'var(--color-error)' }}>{errorText(resolve.error)}</p>}
    </article>
  );
}

/** 一輪的工具呼叫：預設收合成「使用了 N 個工具」；等你確認的寫入一律直接顯示。 */
function ToolCalls({ sessionId, calls, closed }: Readonly<{ sessionId: string | null; calls: TraceItem[]; closed: boolean }>) {
  const [open, setOpen] = useState(false);
  const pending = calls.filter((c) => c.status === 'pending_approval' && !closed && sessionId);
  const rest = calls.filter((c) => !pending.includes(c));
  const names = [...new Set(rest.map((c) => c.tool))];
  const failed = rest.some((c) => c.status === 'error' || c.status === 'denied');
  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 'var(--space-2)', fontSize: 'var(--font-size-2xs)', color: 'var(--fg-secondary)', overflowWrap: 'anywhere' }}>
      {rest.length > 0 && (
        <button
          type="button"
          aria-expanded={open}
          onClick={() => setOpen(!open)}
          style={{ alignSelf: 'flex-start', background: 'none', border: 'none', padding: 0, cursor: 'pointer', font: 'inherit', color: 'inherit', textAlign: 'left' }}
        >
          {open ? '▾' : '▸'} 使用了 {rest.length} 個工具
          {failed && <span style={{ color: 'var(--color-error)' }}> · 有失敗</span>}
          {!open && (
            <span style={{ ...mono, color: 'var(--fg-muted)' }}>
              {' '}· {names.slice(0, 3).join('、')}
              {names.length > 3 ? '…' : ''}
            </span>
          )}
        </button>
      )}
      {open && rest.map((call) => <ToolLine key={call.seq} call={call} />)}
      {pending.map((call) => (
        <ApprovalCard key={call.seq} sessionId={sessionId!} call={call} />
      ))}
    </div>
  );
}

/** 大腦的旁白；有結果的輪次預設折成 3 行，可展開全文。 */
function Narration({ text, folded: foldable }: Readonly<{ text: string; folded: boolean }>) {
  const [open, setOpen] = useState(false);
  const folded = foldable && !open;
  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 'var(--space-2)' }}>
      <div style={folded ? { maxHeight: FOLDED_HEIGHT, overflow: 'hidden', maskImage: 'linear-gradient(to bottom, black 60%, transparent)' } : undefined}>
        <Prose>{text}</Prose>
      </div>
      {foldable && (
        <button type="button" className="ss-btn ss-btn-sm ss-btn-ghost" style={{ alignSelf: 'flex-start' }} aria-expanded={open} onClick={() => setOpen(!open)}>
          {open ? '收起' : '展開全文'}
        </button>
      )}
    </div>
  );
}

function jumpTo(turnId: string) {
  document.getElementById(`result-${turnId}`)?.scrollIntoView({ behavior: 'smooth', block: 'start' });
}

/**
 * 左欄對話（畫布 Agent.dc.html）：問句泡泡、工具呼叫一行一個、旁白、「結果 A · 標題」連結、寫入確認、輸入框。
 * `sessionId` 為 null 時只畫骨架（還沒有對話，輸入框停用）。
 */
export function ChatPane({
  sessionId,
  turns,
  labels,
  live,
  status,
  error,
  meta,
}: Readonly<{
  sessionId: string | null;
  turns: Turn[];
  labels: Map<string, string>;
  live: Record<string, string>;
  status: string;
  error: string | null;
  /** 對話卡標頭（session、題材、L0…）。 */
  meta: ReactNode;
}>) {
  const send = useSendMessage(sessionId ?? '');
  const cancel = useCancelTurn(sessionId ?? '');
  const [text, setText] = useState('');
  const busy = status === 'busy' || send.isPending;
  const closed = !sessionId || status === 'closed' || status === 'error';
  const scroller = useRef<HTMLDivElement>(null);
  const stick = useRef(true);
  const liveLength = Object.values(live).reduce((n, t) => n + t.length, 0);

  // 新內容進來時，若使用者本來就在底部，就跟著捲到最下面；換對話時回到最下面。
  useEffect(() => {
    stick.current = true;
  }, [sessionId]);
  useEffect(() => {
    const el = scroller.current;
    if (el && stick.current) el.scrollTop = el.scrollHeight;
  }, [turns, liveLength, busy, sessionId]);

  const submit = () => {
    const value = text.trim();
    if (!value || busy || closed) return;
    send.mutate(value, { onSuccess: () => setText('') });
  };

  const footer: CSSProperties = { borderTop: 'var(--border-width) var(--border-style) var(--border)', padding: 'var(--space-4) var(--space-5)', display: 'flex', flexDirection: 'column', gap: 'var(--space-3)' };

  return (
    <section
      aria-label="對話"
      style={{ ...pane, flex: '1 1 360px', maxWidth: 420, height: 'calc(100vh - 96px)', minHeight: 480, position: 'sticky', top: 'var(--space-5)' }}
    >
      <div style={{ display: 'flex', flexWrap: 'wrap', alignItems: 'center', gap: 'var(--space-3)', padding: 'var(--space-4) var(--space-5)', borderBottom: 'var(--border-width) var(--border-style) var(--border)' }}>
        {meta}
      </div>
      <div
        ref={scroller}
        onScroll={(e) => {
          const el = e.currentTarget;
          stick.current = el.scrollHeight - el.scrollTop - el.clientHeight < 40;
        }}
        style={{ flex: 1, minHeight: 0, overflowY: 'auto', padding: 'var(--space-5)', display: 'flex', flexDirection: 'column', gap: 'var(--space-5)' }}
      >
        {turns.length === 0 && <p style={small}>還沒有對話。問一個關於這本書的問題，答案會在右側組成一個結果。</p>}
        {turns.map((turn) => {
          const answer = turn.answer ?? live[turn.turnId] ?? null;
          const result = hasResult(turn);
          return (
            <div key={turn.turnId} style={{ display: 'flex', flexDirection: 'column', gap: 'var(--space-4)' }}>
              <div style={bubble}>{turn.question}</div>
              {turn.calls.length > 0 && <ToolCalls sessionId={sessionId} calls={turn.calls} closed={closed} />}
              {answer && <Narration text={answer} folded={result && turn.answer !== null} />}
              {result && (
                <button
                  type="button"
                  onClick={() => jumpTo(turn.turnId)}
                  style={{
                    alignSelf: 'flex-start',
                    font: 'inherit',
                    fontSize: 'var(--font-size-2xs)',
                    color: 'var(--accent)',
                    background: 'none',
                    cursor: 'pointer',
                    textAlign: 'left',
                    padding: 'var(--space-2) var(--space-4)',
                    border: 'var(--border-width) var(--border-style) var(--accent)',
                    borderRadius: 'var(--radius-sm)',
                  }}
                >
                  結果 {labels.get(turn.turnId)} · {resultTitle(turn)}
                </button>
              )}
            </div>
          );
        })}
        {busy && <p style={small}>大腦思考中…</p>}
        {error && <p role="alert" style={{ ...small, color: 'var(--color-error)' }}>{error}</p>}
      </div>

      {closed ? (
        <div style={footer}>
          <p style={{ ...small, fontSize: 'var(--font-size-xs)' }}>
            {sessionId ? '這段對話已結束，只能看；按左側「＋ 新對話」接著問。' : '按左側「＋ 新對話」開始。'}
          </p>
        </div>
      ) : (
        <div style={footer}>
          <textarea
            aria-label="輸入問題"
            rows={3}
            value={text}
            placeholder="輸入問題……（Enter 送出，Shift+Enter 換行）"
            onChange={(e) => setText(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === 'Enter' && !e.shiftKey && !e.nativeEvent.isComposing) {
                e.preventDefault();
                submit();
              }
            }}
            style={{
              resize: 'none',
              fontFamily: 'var(--font-sans)',
              fontSize: 'var(--font-size-sm)',
              padding: 'var(--space-4) var(--space-5)',
              border: 'var(--input-border-width) solid var(--border)',
              borderRadius: 'var(--input-radius)',
              background: 'var(--input-bg)',
              color: 'var(--fg-primary)',
            }}
          />
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', gap: 'var(--space-4)' }}>
            <span style={small}>回答會在右側產生新的結果</span>
            <div style={{ display: 'flex', gap: 'var(--space-3)' }}>
              {busy && (
                <button type="button" className="ss-btn ss-btn-sm ss-btn-ghost" disabled={cancel.isPending} onClick={() => cancel.mutate()}>
                  中止
                </button>
              )}
              <button type="button" className="ss-btn ss-btn-md ss-btn-primary ss-btn-llm" disabled={!text.trim() || busy} onClick={submit}>
                送出
              </button>
            </div>
          </div>
          {send.error && <p role="alert" style={{ ...small, color: 'var(--color-error)' }}>{errorText(send.error)}</p>}
        </div>
      )}
    </section>
  );
}
