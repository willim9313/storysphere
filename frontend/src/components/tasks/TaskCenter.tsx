import { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { Loader, X, ChevronRight, ChevronDown, CheckCheck } from 'lucide-react';
import type { TaskStatus } from '@/api/tasks';
import { useTheme } from '@/contexts/ThemeContext';
import { TaskRow } from './TaskRow';

const HIDDEN_KEY = 'taskCenter.hiddenIds';

function loadHidden(): Set<string> {
  try {
    const raw = localStorage.getItem(HIDDEN_KEY);
    return new Set(raw ? (JSON.parse(raw) as string[]) : []);
  } catch {
    return new Set();
  }
}

function saveHidden(ids: Set<string>): void {
  try {
    localStorage.setItem(HIDDEN_KEY, JSON.stringify([...ids]));
  } catch {
    /* ignore quota / disabled storage */
  }
}

const isTerminal = (t: TaskStatus) => t.status === 'done' || t.status === 'error';

const SECTION_LABEL: React.CSSProperties = {
  fontFamily: 'var(--font-sans)',
  fontSize: 10,
  fontWeight: 600,
  letterSpacing: '.06em',
  textTransform: 'uppercase',
  color: 'var(--fg-muted)',
};

interface TaskCenterProps {
  readonly onClose: () => void;
  readonly tasks: TaskStatus[];
  readonly isLoading: boolean;
}

export function TaskCenter({ onClose, tasks, isLoading }: TaskCenterProps) {
  const navigate = useNavigate();
  const { theme } = useTheme();
  const mono = theme === 'ink';
  const [hidden, setHidden] = useState<Set<string>>(loadHidden);
  const [doneOpen, setDoneOpen] = useState(true);

  const visible = tasks.filter((t) => !hidden.has(t.taskId));
  const running = visible.filter((t) => !isTerminal(t));
  const done = visible.filter(isTerminal);

  const handleNavigate = (path: string) => {
    onClose();
    navigate(path);
  };

  const clearCompleted = () => {
    const next = new Set(hidden);
    done.forEach((t) => next.add(t.taskId));
    setHidden(next);
    saveHidden(next);
  };

  const showEmpty = !isLoading && visible.length === 0;
  const showLoading = isLoading && tasks.length === 0;

  return (
    <div
      style={{
        display: 'flex',
        flexDirection: 'column',
        width: 320,
        height: '100%',
        minHeight: 0,
        background: 'var(--bg-primary)',
        fontFamily: 'var(--font-sans)',
        borderLeft: 'var(--border-width) var(--border-style) var(--border)',
        boxShadow: 'var(--shadow-md)',
        overflow: 'hidden',
      }}
    >
      {/* Header */}
      <div
        style={{
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'space-between',
          padding: '11px 14px',
          borderBottom: 'var(--border-width) var(--border-style) var(--border)',
          flexShrink: 0,
        }}
      >
        <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
          <Loader size={16} style={{ color: 'var(--accent)' }} />
          <span
            style={{
              fontFamily: 'var(--font-serif)',
              fontSize: 14,
              fontWeight: 600,
              color: 'var(--fg-primary)',
            }}
          >
            任務中心
          </span>
          {running.length > 0 && (
            <span
              style={{
                fontFamily: 'var(--font-mono)',
                fontSize: 10,
                fontWeight: 700,
                color: '#fff',
                background: 'var(--accent)',
                minWidth: 16,
                height: 16,
                padding: '0 4px',
                borderRadius: 9,
                display: 'inline-flex',
                alignItems: 'center',
                justifyContent: 'center',
              }}
            >
              {running.length}
            </span>
          )}
        </div>
        <button
          onClick={onClose}
          style={{ color: 'var(--fg-muted)', background: 'none', border: 0, cursor: 'pointer', display: 'flex' }}
          aria-label="關閉任務中心"
        >
          <X size={15} />
        </button>
      </div>

      {/* Body */}
      {showLoading ? (
        <div
          style={{
            flex: 1,
            display: 'flex',
            flexDirection: 'column',
            alignItems: 'center',
            justifyContent: 'center',
            gap: 10,
            color: 'var(--fg-muted)',
          }}
        >
          <Loader size={22} className="animate-spin" />
          <span style={{ fontSize: 12 }}>載入任務中…</span>
        </div>
      ) : showEmpty ? (
        <div
          style={{
            flex: 1,
            display: 'flex',
            flexDirection: 'column',
            alignItems: 'center',
            justifyContent: 'center',
            gap: 10,
            padding: 30,
            textAlign: 'center',
          }}
        >
          <CheckCheck size={26} style={{ color: 'var(--fg-muted)' }} />
          <span style={{ fontSize: 13, color: 'var(--fg-secondary)' }}>
            目前沒有進行中的任務
          </span>
          <span style={{ fontSize: 11, color: 'var(--fg-muted)', lineHeight: 1.5 }}>
            啟動分析後，這裡會即時顯示
            <br />
            所有 LLM 任務的進度。
          </span>
        </div>
      ) : (
        <div style={{ flex: 1, minHeight: 0, overflowY: 'auto', padding: '8px 8px 12px' }}>
          {running.length > 0 && (
            <>
              <div style={{ ...SECTION_LABEL, padding: '6px 6px 4px' }}>
                進行中 · {running.length}
              </div>
              <div style={{ display: 'flex', flexDirection: 'column', gap: 2 }}>
                {running.map((t) => (
                  <TaskRow key={t.taskId} task={t} mono={mono} onNavigate={handleNavigate} />
                ))}
              </div>
            </>
          )}

          {done.length > 0 && (
            <>
              <div
                style={{
                  display: 'flex',
                  alignItems: 'center',
                  gap: 5,
                  padding: '8px 6px 4px',
                  marginTop: running.length > 0 ? 6 : 0,
                }}
              >
                <button
                  type="button"
                  onClick={() => setDoneOpen((v) => !v)}
                  style={{
                    display: 'flex',
                    alignItems: 'center',
                    gap: 5,
                    flex: 1,
                    background: 'transparent',
                    border: 'none',
                    cursor: 'pointer',
                    textAlign: 'left',
                    padding: 0,
                  }}
                >
                  {doneOpen ? (
                    <ChevronDown size={13} style={{ color: 'var(--fg-muted)' }} />
                  ) : (
                    <ChevronRight size={13} style={{ color: 'var(--fg-muted)' }} />
                  )}
                  <span style={SECTION_LABEL}>已完成 · {done.length}</span>
                </button>
                <button
                  type="button"
                  onClick={clearCompleted}
                  style={{
                    background: 'transparent',
                    border: 'none',
                    cursor: 'pointer',
                    fontFamily: 'var(--font-sans)',
                    fontSize: 10,
                    color: 'var(--accent)',
                  }}
                >
                  清除
                </button>
              </div>

              {doneOpen && (
                <div style={{ display: 'flex', flexDirection: 'column', gap: 2, opacity: 0.92 }}>
                  {done.map((t) => (
                    <TaskRow key={t.taskId} task={t} mono={mono} onNavigate={handleNavigate} />
                  ))}
                </div>
              )}
            </>
          )}
        </div>
      )}
    </div>
  );
}
