import { useState, type CSSProperties } from 'react';
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
}: Readonly<{
  sessionId: string | null;
  turns: Turn[];
  labels: Map<string, string>;
  live: Record<string, string>;
  status: string;
  error: string | null;
}>) {
  const send = useSendMessage(sessionId ?? '');
  const cancel = useCancelTurn(sessionId ?? '');
  const [text, setText] = useState('');
  const busy = status === 'busy' || send.isPending;
  const closed = !sessionId || status === 'closed' || status === 'error';

  const submit = () => {
    const value = text.trim();
    if (!value || busy || closed) return;
    send.mutate(value, { onSuccess: () => setText('') });
  };

  const placeholder = !sessionId
    ? '先按右上的「新對話」開始。'
    : closed
      ? '這個 session 已關閉；開新對話才能繼續問。'
      : '輸入問題……（Enter 送出，Shift+Enter 換行）';

  return (
    <section aria-label="對話" style={{ ...pane, flex: '1 1 340px', maxWidth: 420, alignSelf: 'stretch' }}>
      <div style={{ flex: 1, padding: 'var(--space-5)', display: 'flex', flexDirection: 'column', gap: 'var(--space-5)' }}>
        {turns.length === 0 && <p style={small}>還沒有對話。問一個關於這本書的問題，答案會在右側組成一個結果。</p>}
        {turns.map((turn) => {
          const answer = turn.answer ?? live[turn.turnId] ?? null;
          const result = hasResult(turn);
          return (
            <div key={turn.turnId} style={{ display: 'flex', flexDirection: 'column', gap: 'var(--space-4)' }}>
              <div style={bubble}>{turn.question}</div>
              {turn.calls.length > 0 && (
                <div style={{ display: 'flex', flexDirection: 'column', gap: 'var(--space-2)', fontSize: 'var(--font-size-2xs)', color: 'var(--fg-secondary)', overflowWrap: 'anywhere' }}>
                  {turn.calls.map((call) =>
                    call.status === 'pending_approval' && !closed && sessionId ? (
                      <ApprovalCard key={call.seq} sessionId={sessionId} call={call} />
                    ) : (
                      <ToolLine key={call.seq} call={call} />
                    ),
                  )}
                </div>
              )}
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

      <div style={{ borderTop: 'var(--border-width) var(--border-style) var(--border)', padding: 'var(--space-4) var(--space-5)', display: 'flex', flexDirection: 'column', gap: 'var(--space-3)' }}>
        <textarea
          aria-label="輸入問題"
          rows={3}
          value={text}
          disabled={closed}
          placeholder={placeholder}
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
            <button type="button" className="ss-btn ss-btn-md ss-btn-primary ss-btn-llm" disabled={!text.trim() || busy || closed} onClick={submit}>
              送出
            </button>
          </div>
        </div>
        {send.error && <p role="alert" style={{ ...small, color: 'var(--color-error)' }}>{errorText(send.error)}</p>}
      </div>
    </section>
  );
}
