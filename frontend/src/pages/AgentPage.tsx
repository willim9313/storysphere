import { useCallback, useMemo, useState, type CSSProperties } from 'react';
import { useParams, useSearchParams } from 'react-router-dom';
import { useQueryClient } from '@tanstack/react-query';
import { ApiError } from '@/api/client';
import {
  agentKeys,
  useBrainSettings,
  useCloseSession,
  useDrafts,
  useOpenSession,
  useSession,
  useSessions,
  useSessionTrace,
} from '@/api/agent';
import { useMethods } from '@/api/registry';
import { useLlmSettings } from '@/api/settings';
import { ChatPane } from '@/components/agent/ChatPane';
import { ResultCard } from '@/components/agent/ResultCard';
import { buildTurns, hasResult, resultLabel, resultState } from '@/components/agent/turns';
import { BookNav } from '@/components/layout/BookNav';
import { AGENT_EVENT_TYPES, useEventStream } from '@/hooks/useEventStream';

const small: CSSProperties = { margin: 0, fontSize: 'var(--font-size-2xs)', color: 'var(--fg-muted)', lineHeight: 1.6 };
const select: CSSProperties = {
  font: 'inherit',
  fontSize: 'var(--font-size-xs)',
  color: 'var(--fg-primary)',
  background: 'var(--bg-primary)',
  border: 'var(--border-width) var(--border-style) var(--border)',
  borderRadius: 'var(--radius-md)',
  padding: 'var(--space-1) var(--space-2)',
};
const column: CSSProperties = { display: 'flex', flexDirection: 'column', gap: 'var(--space-4)', minWidth: 0 };

const BACKEND_LABEL: Record<string, string> = { deepagents: 'deepagents', 'claude-code': 'Claude Code（ACP）' };
const FILTERS = [
  { id: 'all', label: '全部' },
  { id: 'unsaved', label: '未儲存' },
  { id: 'saved', label: '已儲存' },
] as const;

function errorText(error: unknown) {
  return error instanceof ApiError ? error.detail : String(error);
}

function shortTime(iso: string) {
  return new Date(iso).toLocaleString('zh-TW', { month: '2-digit', day: '2-digit', hour: '2-digit', minute: '2-digit', hour12: false });
}

/** 大腦選擇＋開新對話（N-08e、N-10a）。 */
function NewSession({ bookId, onOpened }: Readonly<{ bookId: string; onOpened: (sessionId: string) => void }>) {
  const { data: brain } = useBrainSettings();
  const { data: llm } = useLlmSettings();
  const open = useOpenSession(bookId);
  const [backend, setBackend] = useState<'deepagents' | 'claude-code' | null>(null);
  const [model, setModel] = useState<string>('');

  const chosen = backend ?? (brain?.defaultBackend === 'claude-code' ? 'claude-code' : 'deepagents');
  const modelValue = model || brain?.deepagents.model || '';
  const ccUnavailable = brain?.claudeCode.available === false;

  return (
    <div style={{ display: 'flex', flexWrap: 'wrap', alignItems: 'center', gap: 'var(--space-3)' }}>
      <label style={{ ...small, display: 'flex', alignItems: 'center', gap: 'var(--space-2)' }}>
        大腦
        <select style={select} value={chosen} onChange={(e) => setBackend(e.target.value as 'deepagents' | 'claude-code')}>
          <option value="deepagents">deepagents</option>
          <option value="claude-code" disabled={ccUnavailable}>
            Claude Code（ACP）{ccUnavailable ? '：不可用' : ''}
          </option>
        </select>
      </label>
      {chosen === 'deepagents' && (
        <label style={{ ...small, display: 'flex', alignItems: 'center', gap: 'var(--space-2)' }}>
          模型
          <select style={select} value={modelValue} onChange={(e) => setModel(e.target.value)}>
            {!modelValue && <option value="">（設定頁的預設）</option>}
            {(llm?.models ?? []).map((m) => (
              <option key={m.name} value={m.name}>
                {m.name} · {m.modelId}
              </option>
            ))}
          </select>
        </label>
      )}
      <button
        type="button"
        className="ss-btn ss-btn-sm ss-btn-primary"
        disabled={open.isPending}
        onClick={() =>
          open.mutate(
            { backend: chosen, model: chosen === 'deepagents' && modelValue ? modelValue : null },
            { onSuccess: (data) => onOpened(data.sessionId) },
          )
        }
      >
        新對話
      </button>
      {open.error && <span role="alert" style={{ ...small, color: 'var(--color-error)' }}>{errorText(open.error)}</span>}
    </div>
  );
}

/** 畫面 5 Agent 工作區（05 §3.3、畫布 `Agent.dc.html`）。 */
export function AgentPage() {
  const { bookId = '' } = useParams();
  const [params, setParams] = useSearchParams();
  const client = useQueryClient();
  const { data: sessions = [] } = useSessions(bookId);
  const { data: methodList = [] } = useMethods();
  const close = useCloseSession(bookId);

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

  return (
    <>
      <BookNav view="Agent 工作區" />
      <main style={{ width: '100%', boxSizing: 'border-box', padding: 'var(--space-6) var(--space-7) var(--space-8)', display: 'flex', flexDirection: 'column', gap: 'var(--space-5)' }}>
        <header style={{ display: 'flex', flexWrap: 'wrap', alignItems: 'center', gap: 'var(--space-4)', justifyContent: 'space-between' }}>
          <div style={{ display: 'flex', flexWrap: 'wrap', alignItems: 'center', gap: 'var(--space-3)', fontSize: 'var(--font-size-xs)', color: 'var(--fg-secondary)' }}>
            {session ? (
              <>
                <strong style={{ color: 'var(--fg-primary)' }}>
                  {BACKEND_LABEL[session.backend] ?? session.backend}
                  {session.model ? ` · ${session.model}` : ''}
                </strong>
                <span style={{ fontFamily: 'var(--font-mono)' }}>session {session.sessionId.slice(0, 4)}</span>
                {session.genre && <span>題材：{session.genre}</span>}
                <span className="ss-badge ss-badge-neutral">{session.permissionLevel} · 只用 StorySphere 工具</span>
                <span className={session.status === 'error' ? 'ss-badge ss-badge-error' : 'ss-badge ss-badge-info'}>{session.status}</span>
                {!readOnly && (
                  <button type="button" className="ss-btn ss-btn-sm ss-btn-ghost" disabled={close.isPending} onClick={() => close.mutate(session.sessionId)}>
                    關閉這個 session
                  </button>
                )}
              </>
            ) : (
              <span>還沒有開著的對話。</span>
            )}
          </div>
          <div style={{ display: 'flex', flexWrap: 'wrap', alignItems: 'center', gap: 'var(--space-4)' }}>
            {sessions.length > 0 && (
              <label style={{ ...small, display: 'flex', alignItems: 'center', gap: 'var(--space-2)' }}>
                之前的對話
                <select style={select} value={sessionId ?? ''} onChange={(e) => choose(e.target.value)}>
                  {!sessionId && <option value="">（選一個）</option>}
                  {sessions.map((s) => (
                    <option key={s.sessionId} value={s.sessionId}>
                      {shortTime(s.createdAt)} · {BACKEND_LABEL[s.backend] ?? s.backend} · {s.status}
                      {s.openDraftCount > 0 ? ` · ${s.openDraftCount} 份草稿` : ''}
                    </option>
                  ))}
                </select>
              </label>
            )}
            <NewSession bookId={bookId} onOpened={choose} />
          </div>
        </header>

        {session && (
          <div style={{ display: 'grid', gridTemplateColumns: 'minmax(320px, 2fr) minmax(0, 3fr)', gap: 'var(--space-6)', alignItems: 'start' }}>
            <ChatPane sessionId={session.sessionId} turns={turns} labels={labels} live={live} status={session.status} error={streamError} />

            <section aria-labelledby="results-h" style={column}>
              <div style={{ display: 'flex', flexWrap: 'wrap', alignItems: 'center', justifyContent: 'space-between', gap: 'var(--space-3)' }}>
                <div>
                  <h2 id="results-h" style={{ margin: 0, fontFamily: 'var(--font-serif)', fontSize: 'var(--font-size-lg)', fontWeight: 600 }}>
                    本次分析結果
                  </h2>
                  <span style={small}>
                    {counts.all} 個結果 · 未儲存 {counts.unsaved} · 已存成筆記 {counts.saved}
                  </span>
                </div>
                <nav className="ss-utabs" aria-label="篩選結果">
                  {FILTERS.map((f) => (
                    <button key={f.id} type="button" className={`ss-utab${filter === f.id ? ' active' : ''}`} aria-pressed={filter === f.id} onClick={() => setFilter(f.id)}>
                      {f.label} {counts[f.id]}
                    </button>
                  ))}
                </nav>
              </div>
              <p className="ss-guidance" style={{ margin: 0 }}>
                未儲存的結果只是一次分析結果，下次重跑同一個分析就會被取代。存成筆記才會永久保留；另存方法論則是把這次的方法組合留下來。
                {readOnly && counts.unsaved > 0 && ' 這個 session 已關閉，未儲存的草稿已被捨棄。'}
              </p>
              {shown.map((turn) => (
                <ResultCard
                  key={turn.turnId}
                  bookId={bookId}
                  sessionId={session.sessionId}
                  turn={turn}
                  label={labels.get(turn.turnId) ?? '?'}
                  methods={methods}
                  readOnly={readOnly}
                />
              ))}
              {shown.length === 0 && <p style={small}>{results.length === 0 ? '還沒有結果。大腦呼叫 show_view 或寫筆記草稿時，結果會出現在這裡。' : '沒有符合的結果。'}</p>}
            </section>
          </div>
        )}
      </main>
    </>
  );
}
