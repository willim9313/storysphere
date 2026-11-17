import { useCallback, useMemo, useState, type CSSProperties } from 'react';
import { useParams, useSearchParams } from 'react-router-dom';
import { useQueryClient } from '@tanstack/react-query';
import { ApiError } from '@/api/client';
import {
  agentKeys,
  useCloseSession,
  useDrafts,
  useSession,
  useSessions,
  useSessionTrace,
  type SessionDetail,
} from '@/api/agent';
import { useMethods } from '@/api/registry';
import { ChatPane } from '@/components/agent/ChatPane';
import { ResultCard } from '@/components/agent/ResultCard';
import { SessionList } from '@/components/agent/SessionList';
import { BACKEND_LABEL, buildTurns, hasResult, resultLabel, resultState } from '@/components/agent/turns';
import { BookNav } from '@/components/layout/BookNav';
import { AGENT_EVENT_TYPES, useEventStream } from '@/hooks/useEventStream';

const small: CSSProperties = { margin: 0, fontSize: 'var(--font-size-2xs)', color: 'var(--fg-muted)', lineHeight: 1.6 };

const FILTERS = [
  { id: 'all', label: '全部' },
  { id: 'unsaved', label: '未儲存' },
  { id: 'saved', label: '已儲存' },
] as const;

function errorText(error: unknown) {
  return error instanceof ApiError ? error.detail : String(error);
}

/** 對話卡標頭：session、題材、L0、狀態；開著的可以關閉（N-10h）。 */
function SessionMeta({ bookId, session }: Readonly<{ bookId: string; session: SessionDetail }>) {
  const close = useCloseSession(bookId);
  const live = session.status !== 'closed' && session.status !== 'error';
  return (
    <>
      <span style={{ fontFamily: 'var(--font-mono)', fontSize: 'var(--font-size-2xs)', color: 'var(--fg-muted)' }}>
        session {session.sessionId.slice(0, 4)} · {BACKEND_LABEL[session.backend] ?? session.backend}
        {session.model ? ` · ${session.model}` : ''}
        {session.genre ? ` · 題材：${session.genre}` : ''}
      </span>
      <span className="ss-badge ss-badge-neutral">{session.permissionLevel} · 只用 StorySphere 工具</span>
      {!live && <span className={session.status === 'error' ? 'ss-badge ss-badge-error' : 'ss-badge ss-badge-neutral'}>{session.status === 'closed' ? '已結束' : session.status}</span>}
      {live && (
        <button type="button" className="ss-btn ss-btn-sm ss-btn-ghost" style={{ marginLeft: 'auto' }} disabled={close.isPending} onClick={() => close.mutate(session.sessionId)}>
          結束對話
        </button>
      )}
      {close.error && <span role="alert" style={{ ...small, color: 'var(--color-error)' }}>{errorText(close.error)}</span>}
    </>
  );
}

/** 畫面 5 Agent 工作區（05 §3.3、畫布 `Agent.dc.html`）。 */
export function AgentPage() {
  const { bookId = '' } = useParams();
  const [params, setParams] = useSearchParams();
  const client = useQueryClient();
  const { data: sessions = [] } = useSessions(bookId);
  const { data: methodList = [] } = useMethods();

  // 沒指定 session 時，接著用最近一個還開著的。
  const sessionId = params.get('session') ?? sessions.find((s) => s.status !== 'closed' && s.status !== 'error')?.sessionId ?? null;
  const { data: session } = useSession(sessionId);
  const { data: trace } = useSessionTrace(sessionId);
  const { data: drafts = [] } = useDrafts(sessionId);
  const [live, setLive] = useState<Record<string, string>>({});
  const [streamError, setStreamError] = useState<string | null>(null);
  const [filter, setFilter] = useState<(typeof FILTERS)[number]['id']>('all');

  const choose = (id: string) => {
    setLive({});
    setStreamError(null);
    setParams({ session: id });
  };

  // SSE 只負責即時的旁白；其他事件收到就重抓 REST（狀態只有一份，重新整理也一樣）。
  const onEvent = useCallback(
    (event: { type: string; data: Record<string, unknown> }) => {
      if (!sessionId) return;
      const turnId = typeof event.data.turnId === 'string' ? event.data.turnId : null;
      const data = (event.data.data ?? {}) as Record<string, unknown>;
      const invalidate = (part: string) => client.invalidateQueries({ queryKey: agentKeys.session(sessionId, part) });
      switch (event.type) {
        case 'text_delta':
          if (turnId) setLive((prev) => ({ ...prev, [turnId]: (prev[turnId] ?? '') + String(data.text ?? '') }));
          break;
        case 'tool_call':
        case 'tool_result':
        case 'approval_request':
        case 'view':
          void invalidate('trace');
          break;
        case 'note_draft':
          void invalidate('drafts');
          break;
        case 'error':
          setStreamError(`${String(data.code ?? 'error')}：${String(data.message ?? '')}`);
          void client.invalidateQueries({ queryKey: agentKeys.session(sessionId) });
          break;
        default: // done、resync
          void client.invalidateQueries({ queryKey: agentKeys.session(sessionId) });
      }
    },
    [client, sessionId],
  );
  const streaming = session && session.status !== 'closed' ? `/agent/sessions/${encodeURIComponent(session.sessionId)}/events` : null;
  useEventStream(streaming, onEvent, AGENT_EVENT_TYPES);

  const methods = useMemo(() => new Map(methodList.map((m) => [m.id, m])), [methodList]);
  const turns = useMemo(() => (session ? buildTurns(session, trace?.items ?? [], drafts) : []), [session, trace, drafts]);
  const results = turns.filter(hasResult);
  const labels = new Map(results.map((t, i) => [t.turnId, resultLabel(i)]));
  const counts = {
    all: results.length,
    unsaved: results.filter((t) => resultState(t) === 'unsaved').length,
    saved: results.filter((t) => resultState(t) === 'saved').length,
  };
  const shown = results.filter((t) => filter === 'all' || resultState(t) === filter);
  const readOnly = !session || session.status === 'closed' || session.status === 'error';
  // 最新一個還沒儲存的結果加框（設計稿的結果 A）。
  const latestUnsaved = readOnly ? null : [...results].reverse().find((t) => resultState(t) === 'unsaved')?.turnId ?? null;

  return (
    <>
      <BookNav view="Agent 工作區" />
      <main style={{ width: '100%', boxSizing: 'border-box', padding: 'var(--space-5) var(--space-6) var(--space-8)', display: 'flex', flexDirection: 'column', gap: 'var(--space-5)' }}>
        <div style={{ display: 'flex', gap: 'var(--space-6)', alignItems: 'flex-start' }}>
          <SessionList bookId={bookId} sessions={sessions} currentId={session?.sessionId ?? null} onChoose={choose} />
          <ChatPane
            sessionId={session?.sessionId ?? null}
            turns={turns}
            labels={labels}
            live={live}
            status={session?.status ?? 'closed'}
            error={streamError}
            meta={session ? <SessionMeta bookId={bookId} session={session} /> : <span style={small}>還沒有開著的對話。</span>}
          />

          <section aria-labelledby="results-h" style={{ flex: '999 1 560px', minWidth: 0, display: 'flex', flexDirection: 'column', gap: 'var(--space-5)' }}>
            <div style={{ display: 'flex', flexWrap: 'wrap', justifyContent: 'space-between', alignItems: 'center', gap: 'var(--space-4)' }}>
              <div style={{ display: 'flex', flexDirection: 'column', gap: 'var(--space-1)' }}>
                <h2 id="results-h" style={{ margin: 0, fontFamily: 'var(--font-serif)', fontSize: 'var(--font-size-xl)', fontWeight: 700 }}>
                  本次分析結果
                </h2>
                <span style={small}>
                  {counts.all} 個結果 · 未儲存 {counts.unsaved} · 已存成筆記 {counts.saved}
                </span>
              </div>
              <nav className="ss-tabs" aria-label="篩選結果">
                {FILTERS.map((f) => (
                  <button key={f.id} type="button" className={`ss-tab${filter === f.id ? ' active' : ''}`} aria-pressed={filter === f.id} onClick={() => setFilter(f.id)}>
                    {f.label} {counts[f.id]}
                  </button>
                ))}
              </nav>
            </div>
            <p style={{ margin: 0, padding: 'var(--space-4) var(--space-5)', background: 'var(--color-info-bg)', borderRadius: 'var(--radius-sm)', fontSize: 'var(--font-size-xs)', color: 'var(--fg-secondary)', lineHeight: 1.6 }}>
              未儲存的結果只是一次分析結果，下次重跑同一個分析就會被取代。存成筆記才會永久保留；另存方法論則是把這次的方法組合留下來。
              {readOnly && session && counts.unsaved > 0 && ' 這個 session 已關閉，未儲存的草稿已被捨棄。'}
            </p>
            {session &&
              shown.map((turn) => (
                <ResultCard
                  key={turn.turnId}
                  bookId={bookId}
                  sessionId={session.sessionId}
                  turn={turn}
                  label={labels.get(turn.turnId) ?? '?'}
                  methods={methods}
                  readOnly={readOnly}
                  highlight={turn.turnId === latestUnsaved}
                  busy={session.status === 'busy'}
                />
              ))}
            {shown.length === 0 && <p style={small}>{results.length === 0 ? '還沒有結果。大腦呼叫 show_view 或寫筆記草稿時，結果會出現在這裡。' : '沒有符合的結果。'}</p>}
          </section>
        </div>
      </main>
    </>
  );
}
