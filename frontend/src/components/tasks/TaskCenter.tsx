import { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { Loader, X, ChevronRight, ChevronDown, CheckCheck } from 'lucide-react';
import type { TaskStatus } from '@/api/tasks';
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

interface TaskCenterProps {
  readonly onClose: () => void;
  readonly tasks: TaskStatus[];
  readonly isLoading: boolean;
}

export function TaskCenter({ onClose, tasks, isLoading }: TaskCenterProps) {
  const navigate = useNavigate();
  const [hidden, setHidden] = useState<Set<string>>(loadHidden);
  const [doneOpen, setDoneOpen] = useState(true);

  const visible = tasks.filter((t) => !hidden.has(t.taskId));
  const active = visible.filter((t) => !isTerminal(t));
  const completed = visible.filter(isTerminal);

  const handleNavigate = (path: string) => {
    onClose();
    navigate(path);
  };

  const clearCompleted = () => {
    const next = new Set(hidden);
    completed.forEach((t) => next.add(t.taskId));
    setHidden(next);
    saveHidden(next);
  };

  return (
    <div
      className="flex-shrink-0 h-full flex flex-col overflow-hidden"
      style={{
        width: 320,
        background: 'var(--bg-primary)',
        borderLeft: '1px solid var(--border)',
        boxShadow: 'var(--shadow-md)',
      }}
    >
      {/* Header */}
      <div
        className="flex items-center justify-between flex-shrink-0"
        style={{ padding: '12px 14px', borderBottom: '1px solid var(--border)' }}
      >
        <div className="flex items-center" style={{ gap: 8 }}>
          <Loader size={16} style={{ color: 'var(--accent)' }} />
          <h3
            style={{
              fontFamily: 'var(--font-serif)',
              fontSize: 'var(--font-size-lg, 18px)',
              fontWeight: 700,
              color: 'var(--fg-primary)',
              margin: 0,
            }}
          >
            任務中心
          </h3>
          {active.length > 0 && (
            <span
              style={{
                fontSize: 11,
                minWidth: 18,
                textAlign: 'center',
                padding: '0 5px',
                borderRadius: 999,
                background: 'var(--accent)',
                color: 'var(--bg-primary)',
              }}
            >
              {active.length}
            </span>
          )}
        </div>
        <button
          onClick={onClose}
          style={{ color: 'var(--fg-muted)', background: 'none', border: 0, cursor: 'pointer' }}
          aria-label="關閉任務中心"
        >
          <X size={16} />
        </button>
      </div>

      {/* Body */}
      <div className="flex-1 overflow-y-auto">
        {isLoading && tasks.length === 0 ? (
          <div
            className="flex flex-col items-center justify-center h-full"
            style={{ gap: 8, color: 'var(--fg-muted)' }}
          >
            <Loader size={20} className="animate-spin" />
            <span style={{ fontSize: 13 }}>載入任務中…</span>
          </div>
        ) : visible.length === 0 ? (
          <div
            className="flex flex-col items-center justify-center h-full text-center"
            style={{ gap: 8, padding: '0 24px', color: 'var(--fg-muted)' }}
          >
            <CheckCheck size={24} />
            <span style={{ fontSize: 14, color: 'var(--fg-secondary)' }}>
              目前沒有進行中的任務
            </span>
            <span style={{ fontSize: 12 }}>
              LLM 處理任務啟動後會顯示在這裡
            </span>
          </div>
        ) : (
          <div style={{ padding: '8px 6px' }}>
            {/* Active */}
            {active.length > 0 && (
              <div style={{ marginBottom: 8 }}>
                <SectionLabel text={`進行中 · ${active.length}`} />
                {active.map((t) => (
                  <TaskRow key={t.taskId} task={t} onNavigate={handleNavigate} />
                ))}
              </div>
            )}

            {/* Completed (collapsible) */}
            {completed.length > 0 && (
              <div>
                <div
                  className="flex items-center justify-between"
                  style={{ padding: '4px 10px' }}
                >
                  <button
                    type="button"
                    onClick={() => setDoneOpen((v) => !v)}
                    className="flex items-center"
                    style={{
                      gap: 4,
                      background: 'none',
                      border: 0,
                      cursor: 'pointer',
                      color: 'var(--fg-muted)',
                      fontSize: 11,
                      letterSpacing: '0.05em',
                      textTransform: 'uppercase',
                    }}
                  >
                    {doneOpen ? <ChevronDown size={12} /> : <ChevronRight size={12} />}
                    已完成 · {completed.length}
                  </button>
                  <button
                    type="button"
                    onClick={clearCompleted}
                    style={{
                      background: 'none',
                      border: 0,
                      cursor: 'pointer',
                      color: 'var(--fg-muted)',
                      fontSize: 11,
                    }}
                  >
                    清除
                  </button>
                </div>
                {doneOpen &&
                  completed.map((t) => (
                    <TaskRow key={t.taskId} task={t} onNavigate={handleNavigate} />
                  ))}
              </div>
            )}
          </div>
        )}
      </div>
    </div>
  );
}

function SectionLabel({ text }: { readonly text: string }) {
  return (
    <div
      style={{
        padding: '4px 10px',
        color: 'var(--fg-muted)',
        fontSize: 11,
        letterSpacing: '0.05em',
        textTransform: 'uppercase',
      }}
    >
      {text}
    </div>
  );
}
