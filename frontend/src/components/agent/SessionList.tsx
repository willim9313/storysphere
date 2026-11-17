import { useState, type CSSProperties } from 'react';
import { ApiError } from '@/api/client';
import { useBrainSettings, useOpenSession, type SessionListItem } from '@/api/agent';
import { useLlmSettings } from '@/api/settings';
import { BACKEND_LABEL } from './turns';

const STATUS_LABEL: Record<string, string> = { closed: '已結束', error: '錯誤', busy: '回答中', starting: '啟動中' };
const COLLAPSE_KEY = 'storysphere:agent-list-collapsed';

const small: CSSProperties = { margin: 0, fontSize: 'var(--font-size-2xs)', color: 'var(--fg-muted)', lineHeight: 1.6 };
const rail: CSSProperties = { display: 'flex', flexDirection: 'column', gap: 'var(--space-4)', position: 'sticky', top: 'var(--space-5)', minWidth: 0 };

function errorText(error: unknown) {
  return error instanceof ApiError ? error.detail : String(error);
}

/** 今天的只寫時間，其他寫月日。 */
function when(iso: string) {
  const d = new Date(iso);
  const sameDay = d.toDateString() === new Date().toDateString();
  return d.toLocaleString('zh-TW', sameDay ? { hour: '2-digit', minute: '2-digit', hour12: false } : { month: '2-digit', day: '2-digit', hour: '2-digit', minute: '2-digit', hour12: false });
}

function readCollapsed() {
  try {
    return localStorage.getItem(COLLAPSE_KEY) === '1';
  } catch {
    return false;
  }
}

/**
 * 左側對話清單（畫布 Agent.dc.html，docs/plans/20261117-agent-chat-ux.md）：
 * ＋ 新對話（N-10a）、新對話用的大腦（N-08e）、這本書的對話（N-10b，第一個問題當標題）；可收合成窄條。
 */
export function SessionList({
  bookId,
  sessions,
  currentId,
  onChoose,
}: Readonly<{ bookId: string; sessions: SessionListItem[]; currentId: string | null; onChoose: (id: string) => void }>) {
  const { data: brain } = useBrainSettings();
  const { data: llm } = useLlmSettings();
  const open = useOpenSession(bookId);
  const [choice, setChoice] = useState<string | null>(null);
  const [collapsed, setCollapsed] = useState(readCollapsed);

  const toggle = () => {
    const next = !collapsed;
    setCollapsed(next);
    try {
      localStorage.setItem(COLLAPSE_KEY, next ? '1' : '0');
    } catch {
      // 存不了就只在這次有效
    }
  };

  const models = llm?.models ?? [];
  const fallback = brain?.defaultBackend === 'claude-code' ? 'claude-code' : `deepagents:${brain?.deepagents.model ?? ''}`;
  const value = choice ?? fallback;
  const ccUnavailable = brain?.claudeCode.available === false;
  const start = () => {
    const backend: 'deepagents' | 'claude-code' = value === 'claude-code' ? 'claude-code' : 'deepagents';
    const model = backend === 'claude-code' ? null : value.slice('deepagents:'.length) || null;
    open.mutate({ backend, model }, { onSuccess: (data) => onChoose(data.sessionId) });
  };

  if (collapsed) {
    return (
      <aside aria-label="對話清單（已收合）" style={{ ...rail, flex: '0 0 auto' }}>
        <button type="button" className="ss-btn ss-btn-sm ss-btn-ghost" aria-label="展開對話清單" title="展開對話清單" onClick={toggle}>
          ›
        </button>
        <button type="button" className="ss-btn ss-btn-sm ss-btn-secondary" aria-label="新對話" title="新對話" disabled={open.isPending} onClick={start}>
          ＋
        </button>
      </aside>
    );
  }

  return (
    <aside aria-label="對話清單" style={{ ...rail, flex: '0 0 220px' }}>
      <button type="button" className="ss-btn ss-btn-sm ss-btn-secondary" style={{ justifyContent: 'center' }} disabled={open.isPending} onClick={start}>
        ＋ 新對話
      </button>
      <div style={{ display: 'flex', flexDirection: 'column', gap: 'var(--space-2)' }}>
        <label htmlFor="brain" style={small}>
          新對話用的大腦
        </label>
        <select
          id="brain"
          value={value}
          onChange={(e) => setChoice(e.target.value)}
          style={{
            fontFamily: 'var(--font-sans)',
            fontSize: 'var(--font-size-xs)',
            padding: 'var(--space-3) var(--space-4)',
            border: 'var(--input-border-width) solid var(--border)',
            borderRadius: 'var(--input-radius)',
            background: 'var(--input-bg)',
            color: 'var(--fg-primary)',
            minWidth: 0,
          }}
        >
          {models.map((m) => (
            <option key={m.name} value={`deepagents:${m.name}`}>
              deepagents · {m.modelId.split(':').pop()}
            </option>
          ))}
          {!models.some((m) => `deepagents:${m.name}` === value) && value !== 'claude-code' && <option value={value}>deepagents</option>}
          <option value="claude-code" disabled={ccUnavailable}>
            Claude Code（ACP）{ccUnavailable ? '：不可用' : ''}
          </option>
        </select>
      </div>
      {open.error && (
        <p role="alert" style={{ ...small, color: 'var(--color-error)' }}>
          {errorText(open.error)}
        </p>
      )}
      <hr style={{ border: 0, borderTop: 'var(--border-width) var(--border-style) var(--border)', margin: 0 }} />
      <span style={{ fontSize: 'var(--font-size-2xs)', fontWeight: 600, letterSpacing: '0.06em', color: 'var(--fg-muted)' }}>這本書的對話 · {sessions.length}</span>
      <nav aria-label="之前的對話" style={{ display: 'flex', flexDirection: 'column', gap: 'var(--space-1)', maxHeight: 'calc(100vh - 320px)', overflowY: 'auto' }}>
        {sessions.length === 0 && <p style={small}>還沒有對話。</p>}
        {sessions.map((s) => {
          const active = s.sessionId === currentId;
          const meta = [when(s.createdAt), BACKEND_LABEL[s.backend] ?? s.backend, STATUS_LABEL[s.status], s.openDraftCount > 0 ? `${s.openDraftCount} 份草稿` : null]
            .filter(Boolean)
            .join(' · ');
          return (
            <button
              key={s.sessionId}
              type="button"
              className={`ss-tab${active ? ' active' : ''}`}
              aria-current={active || undefined}
              onClick={() => onChoose(s.sessionId)}
              style={{ width: '100%', textAlign: 'left', display: 'flex', flexDirection: 'column', gap: 'var(--space-1)', padding: 'var(--space-3) var(--space-4)' }}
            >
              <span
                style={{
                  fontSize: 'var(--font-size-xs)',
                  color: s.firstQuestion ? 'var(--fg-primary)' : 'var(--fg-muted)',
                  lineHeight: 1.45,
                  display: '-webkit-box',
                  WebkitLineClamp: 2,
                  WebkitBoxOrient: 'vertical',
                  overflow: 'hidden',
                }}
              >
                {s.firstQuestion ?? '（還沒提問）'}
              </span>
              <span style={{ fontSize: 'var(--font-size-2xs)', color: 'var(--fg-muted)', fontWeight: 400 }}>{meta}</span>
            </button>
          );
        })}
      </nav>
      <button type="button" className="ss-btn ss-btn-sm ss-btn-ghost" style={{ alignSelf: 'flex-start' }} onClick={toggle}>
        ‹ 收合清單
      </button>
    </aside>
  );
}
