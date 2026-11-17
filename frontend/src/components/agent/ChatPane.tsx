import { useState, type CSSProperties } from 'react';
import { ApiError } from '@/api/client';
import { useCancelTurn, useResolveApproval, useSendMessage, type TraceItem } from '@/api/agent';
import { useDevView } from '@/hooks/useDevView';
import { CALL_STATUS, callSummary, hasResult, type Turn } from './turns';

const small: CSSProperties = { margin: 0, fontSize: 'var(--font-size-2xs)', color: 'var(--fg-muted)', lineHeight: 1.6 };

function errorText(error: unknown) {
  return error instanceof ApiError ? error.detail : String(error);
}

/** 工具呼叫一行摘要；開發者檢視可展開完整參數（05 §3.3）。 */
function ToolLine({ call }: Readonly<{ call: TraceItem }>) {
  const [devView] = useDevView();
  const status = CALL_STATUS[call.status];
  const line = (
    <span style={{ fontFamily: 'var(--font-mono)', fontSize: 'var(--font-size-2xs)', color: call.status === 'error' || call.status === 'denied' ? 'var(--color-error)' : 'var(--fg-muted)' }}>
      › {callSummary(call)}
      {status ? ` · ${status}` : ''}
      {call.errorCode ? ` · ${call.errorCode}` : ''}
    </span>
  );
  if (!devView) return <div>{line}</div>;
  return (
    <details>
      <summary style={{ cursor: 'pointer', listStyle: 'none' }}>{line}</summary>
      <pre style={{ ...small, fontFamily: 'var(--font-mono)', whiteSpace: 'pre-wrap', wordBreak: 'break-all', background: 'var(--bg-secondary)', padding: 'var(--space-2)', borderRadius: 'var(--radius-md)' }}>
        {JSON.stringify({ seq: call.seq, args: call.args, resultEvidenceIds: call.resultEvidenceIds, resultRunIds: call.resultRunIds, jobId: call.jobId }, null, 2)}
      </pre>
    </details>
  );
}

/** 寫入確認卡（approval_request → N-10f）；從 trace 的 pending_approval 列重建。 */
function ApprovalCard({ sessionId, call }: Readonly<{ sessionId: string; call: TraceItem }>) {
  const resolve = useResolveApproval(sessionId);
  const requestId = call.approvalRequestId;
  return (
    <div className="ss-chat-confirm" role="group" aria-label="寫入確認">
      <span className="ss-chat-confirm-text">
        大腦要執行需要確認的寫入：<strong>{call.tool}</strong>
        <pre style={{ ...small, fontFamily: 'var(--font-mono)', whiteSpace: 'pre-wrap' }}>{JSON.stringify(call.args, null, 2)}</pre>
      </span>
      <div className="ss-chat-confirm-actions">
        <button type="button" className="ss-btn ss-btn-sm ss-btn-primary" disabled={!requestId || resolve.isPending} onClick={() => resolve.mutate({ requestId: requestId!, allow: true })}>
          允許
        </button>
        <button type="button" className="ss-btn ss-btn-sm ss-btn-ghost" disabled={!requestId || resolve.isPending} onClick={() => resolve.mutate({ requestId: requestId!, allow: false })}>
          拒絕
        </button>
      </div>
      {resolve.error && <p role="alert" style={{ ...small, color: 'var(--color-error)' }}>{errorText(resolve.error)}</p>}
    </div>
  );
}

function jumpTo(turnId: string) {
  document.getElementById(`result-${turnId}`)?.scrollIntoView({ behavior: 'smooth', block: 'start' });
}

/** 左欄對話：問句、工具呼叫摘要、旁白、→ 結果連結、寫入確認、輸入框。 */
export function ChatPane({
  sessionId,
  turns,
  labels,
  live,
  status,
  error,
}: Readonly<{
  sessionId: string;
  turns: Turn[];
  labels: Map<string, string>;
  live: Record<string, string>;
  status: string;
  error: string | null;
}>) {
  const send = useSendMessage(sessionId);
  const cancel = useCancelTurn(sessionId);
  const [text, setText] = useState('');
  const busy = status === 'busy' || send.isPending;
  const closed = status === 'closed' || status === 'error';

  const submit = () => {
    const value = text.trim();
    if (!value || busy || closed) return;
    send.mutate(value, { onSuccess: () => setText('') });
  };

  return (
    <section aria-label="對話" style={{ display: 'flex', flexDirection: 'column', gap: 'var(--space-4)', minHeight: 0 }}>
      <div style={{ display: 'flex', flexDirection: 'column', gap: 'var(--space-5)' }}>
        {turns.length === 0 && <p style={small}>還沒有對話。問一個關於這本書的問題，答案會在右側組成一個結果。</p>}
        {turns.map((turn) => {
          const answer = turn.answer ?? live[turn.turnId] ?? null;
          return (
            <div key={turn.turnId} style={{ display: 'flex', flexDirection: 'column', gap: 'var(--space-2)' }}>
              <div style={{ alignSelf: 'flex-end', maxWidth: '90%', background: 'var(--bg-secondary)', borderRadius: 'var(--radius-md)', padding: 'var(--space-2) var(--space-3)', fontSize: 'var(--font-size-sm)' }}>
                {turn.question}
              </div>
              {turn.calls.map((call) =>
                call.status === 'pending_approval' && !closed ? (
                  <ApprovalCard key={call.seq} sessionId={sessionId} call={call} />
                ) : (
                  <ToolLine key={call.seq} call={call} />
                ),
              )}
              {answer && <div style={{ fontSize: 'var(--font-size-sm)', lineHeight: 1.7, whiteSpace: 'pre-wrap' }}>{answer}</div>}
              {hasResult(turn) && (
                <button type="button" className="ss-btn ss-btn-sm ss-btn-ghost" style={{ alignSelf: 'flex-start' }} onClick={() => jumpTo(turn.turnId)}>
                  → 結果 {labels.get(turn.turnId)}
                </button>
              )}
            </div>
          );
        })}
        {busy && <p style={small}>大腦思考中…</p>}
        {error && <p role="alert" style={{ ...small, color: 'var(--color-error)' }}>{error}</p>}
      </div>

      <div style={{ display: 'flex', flexDirection: 'column', gap: 'var(--space-2)' }}>
        <textarea
          aria-label="輸入問題"
          rows={3}
          value={text}
          disabled={closed}
          placeholder={closed ? '這個 session 已關閉；開新對話才能繼續問。' : '輸入問題……（Enter 送出，Shift+Enter 換行）'}
          onChange={(e) => setText(e.target.value)}
          onKeyDown={(e) => {
            if (e.key === 'Enter' && !e.shiftKey && !e.nativeEvent.isComposing) {
              e.preventDefault();
              submit();
            }
          }}
          style={{
            font: 'inherit',
            fontSize: 'var(--font-size-sm)',
            color: 'var(--fg-primary)',
            background: 'var(--bg-primary)',
            border: 'var(--border-width) var(--border-style) var(--border)',
            borderRadius: 'var(--radius-md)',
            padding: 'var(--space-3)',
            resize: 'vertical',
          }}
        />
        <div style={{ display: 'flex', alignItems: 'center', gap: 'var(--space-3)' }}>
          <span style={{ ...small, flex: 1 }}>回答會在右側產生新的結果。</span>
          {busy && (
            <button type="button" className="ss-btn ss-btn-sm ss-btn-ghost" disabled={cancel.isPending} onClick={() => cancel.mutate()}>
              中止
            </button>
          )}
          <button type="button" className="ss-btn ss-btn-md ss-btn-primary ss-btn-llm" disabled={!text.trim() || busy || closed} onClick={submit}>
            送出
          </button>
        </div>
        {send.error && <p role="alert" style={{ ...small, color: 'var(--color-error)' }}>{errorText(send.error)}</p>}
      </div>
    </section>
  );
}
