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
    <div className="ss-taskc">
      <div className="ss-taskc-head">
        <div className="ss-taskc-title">
          <Loader size={16} className="ss-taskc-icon" />
          <span className="ss-taskc-name">任務中心</span>
          {running.length > 0 && <span className="ss-taskc-count">{running.length}</span>}
        </div>
        <button type="button" className="ss-taskc-close" onClick={onClose} aria-label="關閉任務中心">
          <X size={15} />
        </button>
      </div>

      {showLoading ? (
        <div className="ss-taskc-state">
          <Loader size={22} strokeWidth={1.5} className="animate-spin" />
          <span className="ss-taskc-state-sub">載入任務中…</span>
        </div>
      ) : showEmpty ? (
        <div className="ss-taskc-state ss-taskc-state-empty">
          <CheckCheck size={26} className="ss-taskc-empty-icon" />
          <span className="ss-taskc-empty-main">目前沒有進行中的任務</span>
          <span className="ss-taskc-state-sub ss-taskc-empty-sub">
            啟動分析後，這裡會即時顯示
            <br />
            所有 LLM 任務的進度。
          </span>
        </div>
      ) : (
        <div className="ss-taskc-body">
          {running.length > 0 && (
            <section className="ss-taskc-group">
              <div className="ss-taskc-group-head">
                <span className="ss-taskc-group-label">進行中 · {running.length}</span>
              </div>
              <div className="ss-taskc-list">
                {running.map((t) => (
                  <TaskRow key={t.taskId} task={t} onNavigate={handleNavigate} />
                ))}
              </div>
            </section>
          )}

          {done.length > 0 && (
            <section className="ss-taskc-group">
              <div className="ss-taskc-group-head">
                <button
                  type="button"
                  className="ss-taskc-group-toggle"
                  onClick={() => setDoneOpen((v) => !v)}
                >
                  {doneOpen ? <ChevronDown size={13} /> : <ChevronRight size={13} />}
                  <span className="ss-taskc-group-label">已完成 · {done.length}</span>
                </button>
                <button type="button" className="ss-taskc-clear" onClick={clearCompleted}>
                  清除
                </button>
              </div>

              {doneOpen && (
                <div className="ss-taskc-list ss-taskc-list-done">
                  {done.map((t) => (
                    <TaskRow key={t.taskId} task={t} onNavigate={handleNavigate} />
                  ))}
                </div>
              )}
            </section>
          )}
        </div>
      )}
    </div>
  );
}
