import { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { useTranslation } from 'react-i18next';
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
  const { t: tr } = useTranslation('common');
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
          <span className="ss-taskc-name">{tr('taskCenter.title')}</span>
          {running.length > 0 && <span className="ss-taskc-count">{running.length}</span>}
        </div>
        <button type="button" className="ss-taskc-close" onClick={onClose} aria-label={tr('taskCenter.close')}>
          <X size={15} />
        </button>
      </div>

      {showLoading ? (
        <div className="ss-taskc-state">
          <Loader size={22} strokeWidth={1.5} className="animate-spin" />
          <span className="ss-taskc-state-sub">{tr('taskCenter.loading')}</span>
        </div>
      ) : showEmpty ? (
        <div className="ss-taskc-state ss-taskc-state-empty">
          <CheckCheck size={26} className="ss-taskc-empty-icon" />
          <span className="ss-taskc-empty-main">{tr('taskCenter.emptyMain')}</span>
          <span className="ss-taskc-state-sub ss-taskc-empty-sub">
            {tr('taskCenter.emptySub1')}
            <br />
            {tr('taskCenter.emptySub2')}
          </span>
        </div>
      ) : (
        <div className="ss-taskc-body">
          {running.length > 0 && (
            <section className="ss-taskc-group">
              <div className="ss-taskc-group-head">
                <span className="ss-taskc-group-label">{tr('taskCenter.running', { n: running.length })}</span>
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
                  <span className="ss-taskc-group-label">{tr('taskCenter.done', { n: done.length })}</span>
                </button>
                <button type="button" className="ss-taskc-clear" onClick={clearCompleted}>
                  {tr('taskCenter.clear')}
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
